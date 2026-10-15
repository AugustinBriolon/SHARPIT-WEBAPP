/**
 * Today dashboard — instrument facts for the Limiting panel.
 * Never restate twin scores already shown in the hero (sleep / recovery / effort / adaptation).
 * Frein value reuses the #154 chip (limiterSignals + limiterCountLabel) — never raw « Signaux ».
 */

import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import type { DecisionData, LimitingFactor } from '@sharpit/app/athlete-state/today-state';
import type { LimiterSignalCode } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import { formatLimiterChipBody } from '@sharpit/server/lib/verdict/verdict-copy';

export type TodayFactRow = {
  label: string;
  value: string;
  hint?: string | null;
};

const SYSTEM_LABEL: Record<string, string> = {
  RECOVERY: 'Récupération',
  FATIGUE: 'Fatigue',
  ADAPTATION: 'Adaptation',
  PHYSICAL_HEALTH: 'Santé physique',
  ENVIRONMENT: 'Environnement',
};

const LIMITER_DIMENSION_LABEL: Record<string, string> = {
  autonomic: 'Système autonome',
  sleep: 'Sommeil',
  subjective: 'Ressenti',
  loadContext: "Charge d'entraînement",
};

function limiterFromDescription(
  description: LimitingFactor['description'] | DecisionData['limitingFactor']['description'],
): string | null {
  const raw = description?.params?.limiter;
  if (raw === undefined || raw === null) {
    return null;
  }
  return LIMITER_DIMENSION_LABEL[String(raw)] ?? String(raw);
}

function systemLabel(system: string | null | undefined, domain?: string | null): string | null {
  if (system && SYSTEM_LABEL[system]) {
    return SYSTEM_LABEL[system];
  }
  if (domain && SYSTEM_LABEL[domain]) {
    return SYSTEM_LABEL[domain];
  }
  return null;
}

/**
 * Limiting panel = constraint identity only (chip / system + cause).
 * No twin scores — those live in the hero metrics row.
 */
export function buildTodayLimitingFacts(input: {
  limitingFactor: AthleteSnapshot['limitingFactor'] | DecisionData['limitingFactor'] | null;
  reminders?: string[];
  /** Frein codes from the verdict plate (#154) — preferred over system / « Signaux ». */
  limiterSignals?: readonly LimiterSignalCode[];
  /** « N signaux » when 2+ freins — null below 2. */
  limiterCountLabel?: string | null;
}): { facts: TodayFactRow[]; emptyText: string | null } {
  const { limitingFactor, reminders = [], limiterSignals = [], limiterCountLabel = null } = input;

  if (limitingFactor) {
    const chipBody = formatLimiterChipBody(limiterSignals, limiterCountLabel);
    const frein =
      chipBody ??
      systemLabel(limitingFactor.system, 'domain' in limitingFactor ? limitingFactor.domain : null);
    const cause = limiterFromDescription(limitingFactor.description);

    const facts: TodayFactRow[] = [
      ...(frein ? [{ label: 'Frein', value: frein }] : []),
      ...(cause ? [{ label: 'Cause', value: cause }] : []),
    ];

    return { facts, emptyText: facts.length > 0 ? null : 'Aucun frein majeur aujourd’hui.' };
  }

  if (reminders.length > 0) {
    return {
      facts: reminders.slice(0, 3).map((hint, i) => ({
        label: i === 0 ? 'Levier' : 'Aussi',
        value: hint,
      })),
      emptyText: null,
    };
  }

  return {
    facts: [],
    emptyText: 'Aucun frein majeur aujourd’hui.',
  };
}
