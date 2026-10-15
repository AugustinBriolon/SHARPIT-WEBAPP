/**
 * Today dashboard — instrument facts for the Limiting panel.
 * Never restate twin scores already shown in the hero (sleep / recovery / effort / adaptation).
 */

import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import type { DecisionData } from '@sharpit/app/athlete-state/today-state';
import {
  resolveLimiterSignal,
  type LimiterSignal,
  type LimiterSignalHints,
} from '@sharpit/app/lib/today/dashboard/limiter-signal';

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

function systemLabel(system: string | null | undefined, domain?: string | null): string | null {
  if (system && SYSTEM_LABEL[system]) {
    return SYSTEM_LABEL[system];
  }
  if (domain && SYSTEM_LABEL[domain]) {
    return SYSTEM_LABEL[domain];
  }
  return null;
}

function limiterFromRecovery(
  limitingFactor: AthleteSnapshot['limitingFactor'] | DecisionData['limitingFactor'] | null,
  recovery: AthleteSnapshot['recovery'] | null | undefined,
  hints?: LimiterSignalHints | null,
): LimiterSignal | null {
  if (!limitingFactor || limitingFactor.system !== 'RECOVERY') {
    return null;
  }
  return resolveLimiterSignal({
    primaryLimitingFactor: recovery?.primaryLimitingFactor ?? null,
    hints,
  });
}

/**
 * Limiting panel = constraint identity only (system + cause).
 * No twin scores — those live in the hero metrics row.
 */
export function buildTodayLimitingFacts(input: {
  limitingFactor: AthleteSnapshot['limitingFactor'] | DecisionData['limitingFactor'] | null;
  recovery?: AthleteSnapshot['recovery'] | null;
  hints?: LimiterSignalHints | null;
  reminders?: string[];
}): { facts: TodayFactRow[]; emptyText: string | null; limiterSignal: LimiterSignal | null } {
  const { limitingFactor, reminders = [], recovery = null, hints = null } = input;

  if (limitingFactor) {
    const frein =
      systemLabel(
        limitingFactor.system,
        'domain' in limitingFactor ? limitingFactor.domain : null,
      ) ?? 'Signaux';
    const signal = limiterFromRecovery(limitingFactor, recovery, hints);
    const cause = signal?.label ?? null;

    const facts: TodayFactRow[] = [
      { label: 'Frein', value: frein },
      ...(cause ? [{ label: 'Cause', value: cause }] : []),
    ];

    return { facts, emptyText: null, limiterSignal: signal };
  }

  if (reminders.length > 0) {
    return {
      facts: reminders.slice(0, 3).map((hint, i) => ({
        label: i === 0 ? 'Levier' : 'Aussi',
        value: hint,
      })),
      emptyText: null,
      limiterSignal: null,
    };
  }

  return {
    facts: [],
    emptyText: 'Aucun frein majeur aujourd’hui.',
    limiterSignal: null,
  };
}
