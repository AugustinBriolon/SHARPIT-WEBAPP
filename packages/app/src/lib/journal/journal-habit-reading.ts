import {
  compileJournalHabitFindings,
  partitionCompiledFindings,
  relativeEffectForFinding,
  type CompiledJournalHabitFinding,
  type JournalHabitFinding,
} from '@sharpit/app/lib/journal/journal-habit-analysis';
import { canBeHabitPriorityLever } from '@sharpit/app/lib/journal/journal-habit-priors';
import {
  formatCompiledJournalHabitFinding,
  formatOutcomeValue,
  habitGroupLabel,
  joinFrench,
  journalFactorDisplayLabel,
} from '@sharpit/app/lib/journal/journal-habit-finding-copy';

export type JournalHabitReadingHighlight = {
  factorId: string;
  title: string;
  polarity: 'plus' | 'minus';
  confidence: 'high' | 'medium';
};

export type JournalHabitReading = {
  daysWithSignal: number;
  netCount: number;
  weakCount: number;
  empty: boolean;
  headline: string;
  /** The plate's one-sentence verdict: names the lever and its size. */
  verdict: string;
  summary: string;
  priority: (CompiledJournalHabitFinding & { title: string; detail: string }) | null;
  /** Favourable associations to celebrate — not buried behind a drag. */
  strengths: JournalHabitReadingHighlight[];
  highlights: JournalHabitReadingHighlight[];
  actionHint: string;
  /** Only high-confidence, plausible levers earn a 7-day test CTA. */
  supportsExperiment: boolean;
};

const MAX_HIGHLIGHTS = 4;
const MAX_STRENGTHS = 3;

/** A habit the days cannot separate from another is never the lever: which one would it be? */
function compiledIsPriorityEligible(item: CompiledJournalHabitFinding): boolean {
  const primaryOutcome = item.effects[0]?.outcome;
  if (!primaryOutcome || item.companionFactorIds.length > 0) {
    return false;
  }
  return canBeHabitPriorityLever(item.factorId, primaryOutcome);
}

function sortByRelativeEffect(
  items: readonly CompiledJournalHabitFinding[],
): CompiledJournalHabitFinding[] {
  return [...items].sort(
    (a, b) => relativeEffectForFinding(b.effects[0]!) - relativeEffectForFinding(a.effects[0]!),
  );
}

/**
 * Balanced priority: strongest eligible high signal first (plus or minus), then
 * medium only when nothing is net. Exploratory / implausible levers never win.
 */
function pickPriority(
  compiled: readonly CompiledJournalHabitFinding[],
): CompiledJournalHabitFinding | null {
  const eligible = compiled.filter(compiledIsPriorityEligible);
  const { plusHigh, minusHigh, plusMedium, minusMedium } = partitionCompiledFindings(eligible);
  const high = sortByRelativeEffect([...plusHigh, ...minusHigh]);
  if (high[0]) {
    return high[0];
  }
  const medium = sortByRelativeEffect([...plusMedium, ...minusMedium]);
  return medium[0] ?? null;
}

function buildEmptyHeadline(strengthCount: number): string {
  return strengthCount > 0
    ? 'Des habitudes vont dans le bon sens'
    : 'Aucune association nette pour l’instant';
}

function buildWeakOnlyHeadline(weakCount: number): string {
  return weakCount === 1 ? 'Une piste à confirmer' : `${weakCount} pistes encore fragiles`;
}

function buildNetHeadline(netCount: number, weakCount: number): string {
  const withWeak = weakCount > 0;
  if (netCount === 1) {
    return withWeak
      ? '1 association nette · pistes à confirmer'
      : '1 association nette à surveiller';
  }
  return withWeak
    ? `${netCount} associations nettes · pistes à confirmer`
    : `${netCount} associations nettes à surveiller`;
}

function buildHeadline(netCount: number, weakCount: number, strengthCount: number): string {
  if (netCount === 0 && weakCount === 0) {
    return buildEmptyHeadline(strengthCount);
  }
  if (netCount === 0) {
    return buildWeakOnlyHeadline(weakCount);
  }
  return buildNetHeadline(netCount, weakCount);
}

function buildSummary(
  daysWithSignal: number,
  netCount: number,
  weakCount: number,
  strengthCount: number,
): string {
  const parts = [`${daysWithSignal} jours analysés`];
  if (netCount > 0) {
    parts.push(`${netCount} association${netCount > 1 ? 's nettes' : ' nette'}`);
  }
  if (strengthCount > 0 && netCount === 0) {
    parts.push(
      `${strengthCount} point${strengthCount > 1 ? 's' : ''} positif${strengthCount > 1 ? 's' : ''}`,
    );
  }
  if (weakCount > 0) {
    parts.push(`${weakCount} à confirmer`);
  }
  return parts.join(' · ');
}

function buildActionHint(
  priority: CompiledJournalHabitFinding | null,
  supportsExperiment: boolean,
  strengths: readonly JournalHabitReadingHighlight[],
  inseparable: readonly CompiledJournalHabitFinding[],
): string {
  if (priority && supportsExperiment) {
    const habit = journalFactorDisplayLabel(priority.factorId);
    if (priority.polarity === 'minus') {
      return `Teste 7 jours sans « ${habit} » (ou en réduisant), puis compare sommeil et récupération.`;
    }
    return `Garde « ${habit} » quand tu peux — le contraste observé va dans le bon sens.`;
  }
  if (priority && priority.confidence === 'medium') {
    return 'Piste encore fragile : continue à noter quelques semaines avant de changer quoi que ce soit.';
  }
  if (strengths[0]) {
    return `Ce qui tient : « ${journalFactorDisplayLabel(strengths[0].factorId)} » — garde ce levier, le contraste est favorable.`;
  }
  if (inseparable[0]) {
    return `« ${habitGroupLabel(inseparable[0].factorId, inseparable[0].companionFactorIds)} » tombent les mêmes jours : impossible de savoir lequel compte. Pour les départager, arrête-en un seul pendant 7 jours.`;
  }
  return 'Les constantes (toujours / jamais) ne créent pas de contraste — varie un levier à la fois pendant 7 jours.';
}

function toHighlight(item: CompiledJournalHabitFinding): JournalHabitReadingHighlight {
  return {
    factorId: item.factorId,
    title: formatCompiledJournalHabitFinding(item).title,
    polarity: item.polarity,
    confidence: item.confidence,
  };
}

function buildStrengths(
  compiled: readonly CompiledJournalHabitFinding[],
): JournalHabitReadingHighlight[] {
  const { plusHigh, plusMedium } = partitionCompiledFindings(compiled);
  return sortByRelativeEffect([...plusHigh, ...plusMedium])
    .slice(0, MAX_STRENGTHS)
    .map(toHighlight);
}

function buildHighlights(
  compiled: readonly CompiledJournalHabitFinding[],
): JournalHabitReadingHighlight[] {
  const { plusHigh, minusHigh, plusMedium, minusMedium } = partitionCompiledFindings(compiled);
  // Celebrate lifts first, then drags — never bury what works.
  const ordered = [...plusHigh, ...minusHigh, ...plusMedium, ...minusMedium];
  return ordered.slice(0, MAX_HIGHLIGHTS).map(toHighlight);
}

const OUTCOME_ORDER = ['sleepMinutes', 'recoveryScore', 'bodyBattery'] as const;

function effectAmount(effect: JournalHabitFinding): string {
  const magnitude = Math.round(effect.absDelta);
  if (effect.outcome === 'sleepMinutes') {
    return magnitude >= 60
      ? `${formatOutcomeValue('sleepMinutes', magnitude)} de sommeil`
      : `${magnitude} minutes de sommeil`;
  }
  return `${magnitude} points de ${effect.outcome === 'recoveryScore' ? 'récupération' : 'Body Battery'}`;
}

function buildVerdict(
  priority: CompiledJournalHabitFinding | null,
  strengths: readonly JournalHabitReadingHighlight[],
  headline: string,
): string {
  if (priority) {
    const amounts = [...priority.effects]
      .sort((a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome))
      .map(effectAmount);
    // An association, worded as one: the gap is what the days show, not what the habit does.
    const lead =
      priority.confidence === 'high' ? 'Ton écart le plus net' : 'Ta piste la plus avancée';
    const direction = priority.polarity === 'minus' ? 'en moins' : 'en plus';
    return `${lead} : « ${journalFactorDisplayLabel(priority.factorId)} », ${joinFrench(amounts)} ${direction}.`;
  }
  if (strengths[0]) {
    return `Ce qui tient : « ${journalFactorDisplayLabel(strengths[0].factorId)} » — contraste favorable à garder.`;
  }
  return headline;
}

/**
 * Deterministic athlete-facing reading of habit↔physiology associations.
 * Presentation only — no causation claim, no Core engine.
 */
export function buildJournalHabitReading(
  findings: readonly JournalHabitFinding[],
  daysWithSignal: number,
): JournalHabitReading {
  const compiled = compileJournalHabitFindings(findings);
  const { plusHigh, minusHigh, plusMedium, minusMedium } = partitionCompiledFindings(compiled);
  const netCount = plusHigh.length + minusHigh.length;
  const weakCount = plusMedium.length + minusMedium.length;
  const strengths = buildStrengths(compiled);
  const empty = netCount === 0 && weakCount === 0 && strengths.length === 0;
  const priorityFinding = pickPriority(compiled);
  const priorityCopy = priorityFinding ? formatCompiledJournalHabitFinding(priorityFinding) : null;
  const supportsExperiment =
    priorityFinding !== null &&
    priorityFinding.confidence === 'high' &&
    compiledIsPriorityEligible(priorityFinding);
  const headline = buildHeadline(netCount, weakCount, strengths.length);

  return {
    daysWithSignal,
    netCount,
    weakCount,
    empty,
    headline,
    verdict: buildVerdict(priorityFinding, strengths, headline),
    summary: buildSummary(daysWithSignal, netCount, weakCount, strengths.length),
    priority:
      priorityFinding && priorityCopy
        ? {
            ...priorityFinding,
            title: priorityCopy.title,
            detail: priorityCopy.detail,
          }
        : null,
    strengths,
    highlights: buildHighlights(compiled),
    actionHint: buildActionHint(
      priorityFinding,
      supportsExperiment,
      strengths,
      compiled.filter((item) => item.companionFactorIds.length > 0),
    ),
    supportsExperiment,
  };
}
