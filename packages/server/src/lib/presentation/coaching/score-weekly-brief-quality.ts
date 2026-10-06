/**
 * Deterministic quality score for the Weekly Coaching Brief ViewModel.
 * Offline scout only — no LLM, no I/O.
 */

import type { WeeklyCoachingBriefViewModel } from '@sharpit/app/presentation/weekly-coaching-brief-view-model';

export type WeeklyBriefQualityFlag =
  | 'empty_state'
  | 'missing_plan_week'
  | 'missing_goal'
  | 'missing_load'
  | 'no_key_sessions'
  | 'missing_recovery'
  | 'missing_limiting_factor'
  | 'no_learning_feedback';

export type WeeklyBriefQualityResult = {
  readonly score: number;
  readonly flags: readonly WeeklyBriefQualityFlag[];
};

const DEDUCTIONS: Record<Exclude<WeeklyBriefQualityFlag, 'empty_state'>, number> = {
  missing_plan_week: 20,
  missing_goal: 10,
  missing_load: 15,
  no_key_sessions: 15,
  missing_recovery: 10,
  missing_limiting_factor: 10,
  no_learning_feedback: 5,
};

const EMPTY_STATE_CAP = 25;

function collectFlags(vm: WeeklyCoachingBriefViewModel): WeeklyBriefQualityFlag[] {
  const flags: WeeklyBriefQualityFlag[] = [];
  if (vm.emptyState) {
    flags.push('empty_state');
  }
  if (!vm.planContext) {
    flags.push('missing_plan_week');
  }
  if (!vm.goalContext) {
    flags.push('missing_goal');
  }
  if (!vm.load) {
    flags.push('missing_load');
  }
  if (vm.keySessions.length === 0) {
    flags.push('no_key_sessions');
  }
  if (!vm.recovery) {
    flags.push('missing_recovery');
  }
  if (!vm.limitingFactor) {
    flags.push('missing_limiting_factor');
  }
  if (vm.learningFeedback.length === 0) {
    flags.push('no_learning_feedback');
  }
  return flags;
}

export function scoreWeeklyBriefQuality(
  vm: WeeklyCoachingBriefViewModel,
): WeeklyBriefQualityResult {
  const flags = collectFlags(vm);
  let score = 100;
  for (const flag of flags) {
    if (flag === 'empty_state') {
      continue;
    }
    score -= DEDUCTIONS[flag];
  }
  if (flags.includes('empty_state')) {
    score = Math.min(score, EMPTY_STATE_CAP);
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    flags,
  };
}
