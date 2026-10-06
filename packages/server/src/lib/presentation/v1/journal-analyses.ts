import type { JournalHabitFinding } from '@sharpit/app/lib/journal/journal-habit-analysis';
import {
  buildJournalAnalysesViewModel,
  type DomainSectionModel,
} from '@sharpit/app/lib/journal/journal-analyses-view-model';
import { buildJournalHabitReading } from '@sharpit/app/lib/journal/journal-habit-reading';
import { isJournalAnalysisReady } from '@sharpit/app/lib/journal/journal-limits';

export type V1JournalAnalysesRow = {
  key: string;
  habit: string;
  /** « le lendemain », … — null when the habit and the outcome share the day. */
  lagLabel: string | null;
  /** Below the net threshold: a lead to confirm, not an association. */
  weak: boolean;
  withoutLabel: string;
  withLabel: string;
  deltaLabel: string;
  mediansLabel: string;
  overlapSentence: string;
  /** 0–100 on the domain's axis. */
  withoutPct: number;
  withPct: number;
  withDaysPct: number[];
  withoutDaysPct: number[];
  nYes: number;
  nNo: number;
};

export type V1JournalAnalysesDomain = {
  outcome: 'sleepMinutes' | 'recoveryScore' | 'bodyBattery';
  title: string;
  ticks: Array<{ label: string; pct: number }>;
  rows: V1JournalAnalysesRow[];
};

export type V1JournalAnalysesResponse = {
  apiVersion: 1;
  minDays: number;
  daysWithSignal: number;
  daysInSpan: number;
  /** Null until `minDays` days carry a journal signal. */
  reading: {
    headline: string;
    verdict: string;
    summary: string;
    actionHint: string;
    strengths: string[];
  } | null;
  /** Net associations where the habit goes with better nights or recovery. */
  lifts: V1JournalAnalysesDomain[];
  /** Net associations where the habit goes with worse ones. */
  drags: V1JournalAnalysesDomain[];
  /** Habits whose every association is still weak. */
  leads: V1JournalAnalysesDomain[];
};

function projectDomain(domain: DomainSectionModel): V1JournalAnalysesDomain {
  return {
    outcome: domain.outcome,
    title: domain.title,
    ticks: domain.ticks.map(({ label, pct }) => ({ label, pct })),
    rows: domain.rows.map((row) => ({
      key: row.key,
      habit: row.label,
      lagLabel: row.lagLabel,
      weak: row.weak,
      withoutLabel: row.withoutLabel,
      withLabel: row.withLabel,
      deltaLabel: row.deltaLabel,
      mediansLabel: row.mediansLabel,
      overlapSentence: row.overlapSentence,
      withoutPct: row.without.pct,
      withPct: row.withHabit.pct,
      withDaysPct: row.withDays.map((day) => day.pct),
      withoutDaysPct: row.withoutDays.map((day) => day.pct),
      nYes: row.nYes,
      nNo: row.nNo,
    })),
  };
}

/**
 * The journal's habit ↔ night associations for native clients (ADR-040): the web's reading and
 * view model, worded server-side. No statistics here — the findings are the journal's own.
 */
export function projectV1JournalAnalyses(input: {
  minDays: number;
  daysWithSignal: number;
  daysInSpan: number;
  findings: readonly JournalHabitFinding[];
}): V1JournalAnalysesResponse {
  const base = {
    apiVersion: 1 as const,
    minDays: input.minDays,
    daysWithSignal: input.daysWithSignal,
    daysInSpan: input.daysInSpan,
  };
  if (!isJournalAnalysisReady(input.daysWithSignal)) {
    return { ...base, reading: null, lifts: [], drags: [], leads: [] };
  }
  const reading = buildJournalHabitReading(input.findings, input.daysWithSignal);
  const viewModel = buildJournalAnalysesViewModel({
    findings: input.findings,
    reading,
    daysInSpan: input.daysInSpan,
  });
  return {
    ...base,
    reading: {
      headline: reading.headline,
      verdict: reading.verdict,
      summary: reading.summary,
      actionHint: reading.actionHint,
      strengths: reading.strengths.map((item) => item.title),
    },
    lifts: viewModel.liftDomains.map(projectDomain),
    drags: viewModel.dragDomains.map(projectDomain),
    leads: viewModel.weakDomains.map(projectDomain),
  };
}
