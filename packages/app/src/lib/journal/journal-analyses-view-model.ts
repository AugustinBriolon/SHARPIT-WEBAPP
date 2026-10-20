/**
 * View model of /journal/analyses: drag vs lift domain sections of dumbbell
 * rows on shared axes, and the « pistes à confirmer » footer. Counts come from
 * the reading (compiled findings) so the page shows one number everywhere.
 * Presentation only — no Core engine, no new statistics.
 */

import {
  compileJournalHabitFindings,
  type CompiledJournalHabitFinding,
  type JournalHabitFinding,
  type JournalOutcomeKey,
  type ObservationPolarity,
} from '@sharpit/app/lib/journal/journal-habit-analysis';
import {
  JOURNAL_HABIT_AXES,
  axisPosition,
  axisTicks,
  type AxisPosition,
  type AxisTick,
} from '@sharpit/app/lib/journal/journal-habit-axis';
import {
  describeDistributionOverlap,
  formatDumbbellAriaLabel,
  formatLagLabel,
  formatMediansLine,
  formatOutcomeValue,
  formatSignedDelta,
  habitGroupLabel,
} from '@sharpit/app/lib/journal/journal-habit-finding-copy';
import type { JournalHabitReading } from '@sharpit/app/lib/journal/journal-habit-reading';

export type DumbbellRowModel = {
  key: string;
  factorId: string;
  outcome: JournalOutcomeKey;
  label: string;
  lagLabel: string | null;
  polarity: ObservationPolarity;
  /** Below the net threshold: the gap is drawn dashed. */
  weak: boolean;
  /** A 7-day test of this habit already has a reading. */
  tested: boolean;
  without: AxisPosition;
  withHabit: AxisPosition;
  /** Formatted median without the habit (same unit as the domain axis). */
  withoutLabel: string;
  /** Formatted median with the habit. */
  withLabel: string;
  deltaLabel: string;
  ariaLabel: string;
  mediansLabel: string;
  overlapSentence: string;
  withDays: AxisPosition[];
  withoutDays: AxisPosition[];
  nYes: number;
  nNo: number;
};

export type DomainSectionModel = {
  outcome: JournalOutcomeKey;
  title: string;
  ticks: AxisTick[];
  rows: DumbbellRowModel[];
};

export type JournalAnalysesCoverage = {
  daysWithSignal: number;
  daysInSpan: number;
  missingDays: number;
};

export type JournalAnalysesViewModel = {
  netCount: number;
  weakCount: number;
  /** Net associations where the habit tracks lower outcomes (a drag). */
  dragDomains: DomainSectionModel[];
  /** Net associations where the habit tracks higher outcomes (a lift). */
  liftDomains: DomainSectionModel[];
  /** Habits whose every association is still weak — shown only on demand. */
  weakDomains: DomainSectionModel[];
  weakLabels: string[];
  coverage: JournalAnalysesCoverage;
};

const DOMAIN_ORDER: readonly JournalOutcomeKey[] = ['sleepMinutes', 'recoveryScore', 'bodyBattery'];

const DOMAIN_TITLES: Record<JournalOutcomeKey, string> = {
  sleepMinutes: 'Sommeil',
  recoveryScore: 'Récupération',
  bodyBattery: 'Body Battery',
};

function toDumbbellRow(effect: JournalHabitFinding, tested: ReadonlySet<string>): DumbbellRowModel {
  const axis = JOURNAL_HABIT_AXES[effect.outcome];
  const place = (value: number) => axisPosition(axis, value);
  return {
    key: `${effect.factorId}:${effect.polarity}:${effect.outcome}`,
    factorId: effect.factorId,
    outcome: effect.outcome,
    label: habitGroupLabel(effect.factorId, effect.companionFactorIds),
    lagLabel: formatLagLabel(effect.lagDays),
    polarity: effect.polarity,
    weak: effect.confidence !== 'high',
    tested: tested.has(effect.factorId),
    without: place(effect.medianNo),
    withHabit: place(effect.medianYes),
    withoutLabel: formatOutcomeValue(effect.outcome, effect.medianNo),
    withLabel: formatOutcomeValue(effect.outcome, effect.medianYes),
    deltaLabel: formatSignedDelta(effect.outcome, effect.medianYes - effect.medianNo),
    ariaLabel: formatDumbbellAriaLabel(effect),
    mediansLabel: formatMediansLine(effect),
    overlapSentence: describeDistributionOverlap(effect),
    withDays: effect.yesValues.map(place),
    withoutDays: effect.noValues.map(place),
    nYes: effect.nYes,
    nNo: effect.nNo,
  };
}

function groupByDomain(
  findings: readonly CompiledJournalHabitFinding[],
  tested: ReadonlySet<string>,
): DomainSectionModel[] {
  return DOMAIN_ORDER.map((outcome) => ({
    outcome,
    title: DOMAIN_TITLES[outcome],
    ticks: axisTicks(JOURNAL_HABIT_AXES[outcome]),
    rows: findings
      .flatMap((finding) => finding.effects.filter((effect) => effect.outcome === outcome))
      .map((effect) => toDumbbellRow(effect, tested)),
  })).filter((domain) => domain.rows.length > 0);
}

/** Keep domain shells; drop rows that do not match the polarity band. */
function domainsForPolarity(
  domains: DomainSectionModel[],
  polarity: ObservationPolarity,
): DomainSectionModel[] {
  return domains
    .map((domain) => ({
      ...domain,
      rows: domain.rows.filter((row) => row.polarity === polarity),
    }))
    .filter((domain) => domain.rows.length > 0);
}

export function buildJournalAnalysesViewModel(input: {
  findings: readonly JournalHabitFinding[];
  reading: JournalHabitReading;
  daysInSpan: number;
  testedFactorIds?: readonly string[];
}): JournalAnalysesViewModel {
  const tested = new Set(input.testedFactorIds);
  const compiled = compileJournalHabitFindings(input.findings);
  const net = compiled.filter((finding) => finding.confidence === 'high');
  const weak = compiled.filter((finding) => finding.confidence === 'medium');
  const { daysWithSignal } = input.reading;

  // A domain appears only once one of its associations is net.
  const netDomains = groupByDomain(net, tested).filter((domain) =>
    domain.rows.some((row) => !row.weak),
  );

  return {
    netCount: input.reading.netCount,
    weakCount: input.reading.weakCount,
    dragDomains: domainsForPolarity(netDomains, 'minus'),
    liftDomains: domainsForPolarity(netDomains, 'plus'),
    weakDomains: groupByDomain(weak, tested),
    weakLabels: [
      ...new Set(
        weak.map((finding) => habitGroupLabel(finding.factorId, finding.companionFactorIds)),
      ),
    ],
    coverage: {
      daysWithSignal,
      daysInSpan: input.daysInSpan,
      missingDays: Math.max(0, input.daysInSpan - daysWithSignal),
    },
  };
}
