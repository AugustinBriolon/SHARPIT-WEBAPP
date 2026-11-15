/**
 * Deterministic score of one generated plan: what the week contains against what a phase asks
 * of it. No model is called, so a prompt or context change gets before/after numbers in CI.
 */
import type { CoachPlan } from '@sharpit/app/lib/validators/coach';

export type RubricPhase = 'BASE' | 'BUILD' | 'PEAK' | 'TAPER' | 'RACE';

export type PlanRubricCheckId =
  | 'hard-share-low'
  | 'hard-share-high'
  | 'middle-share-high'
  | 'too-many-hard'
  | 'hard-back-to-back'
  | 'missing-rationale'
  | 'sport-missing';

export type PlanRubricFinding = { check: PlanRubricCheckId; detail: string };

export type PlanRubricInput = {
  plan: CoachPlan;
  /** null when no macro-plan drives the week: the distribution is then not judged. */
  phase: RubricPhase | null;
  practisedSports: readonly string[];
  /** Days the generation was asked to cover. */
  days: number;
};

export type PlanRubricResult = { score: number; findings: PlanRubricFinding[] };

type Session = CoachPlan['sessions'][number];
type ShareBand = { min: number; max: number };

const ENDURANCE_SPORTS: ReadonlySet<string> = new Set(['RUN', 'BIKE', 'SWIM']);
const MIDDLE_INTENSITIES: ReadonlySet<string> = new Set(['TEMPO']);
const HARD_INTENSITIES: ReadonlySet<string> = new Set(['THRESHOLD', 'VO2MAX', 'RACE']);

/**
 * Share of endurance minutes spent in hard sessions, per phase. A race week is left out: the
 * race itself is most of its hard time.
 * shortcut: bands are a first reading of polarized/pyramidal practice, not fitted to outcomes;
 * recalibrate once the coach-reviewed weeks exist.
 */
export const HARD_SHARE_BANDS: Readonly<Record<RubricPhase, ShareBand | null>> = {
  BASE: { min: 0, max: 0.1 },
  BUILD: { min: 0.1, max: 0.2 },
  PEAK: { min: 0.1, max: 0.2 },
  TAPER: { min: 0.05, max: 0.15 },
  RACE: null,
};

export const MAX_MIDDLE_SHARE = 0.3;
export const MAX_HARD_SESSIONS_PER_ROLLING_WEEK = 3;
const POINTS_PER_FINDING = 20;
const DAYS_IN_WEEK = 7;

const percent = (share: number) => `${Math.round(share * 100)} %`;

function minutesOf(sessions: readonly Session[], intensities?: ReadonlySet<string>): number {
  return sessions
    .filter((session) => !intensities || intensities.has(session.intensity))
    .reduce((total, session) => total + session.durationMin, 0);
}

function distributionFindings(
  endurance: readonly Session[],
  phase: RubricPhase | null,
): PlanRubricFinding[] {
  const total = minutesOf(endurance);
  const band = phase ? HARD_SHARE_BANDS[phase] : null;
  if (!band || total === 0) {
    return [];
  }
  const hard = minutesOf(endurance, HARD_INTENSITIES) / total;
  const middle = minutesOf(endurance, MIDDLE_INTENSITIES) / total;
  const range = `${percent(band.min)}–${percent(band.max)}`;
  const findings: PlanRubricFinding[] = [];
  if (hard < band.min) {
    findings.push({
      check: 'hard-share-low',
      detail: `${percent(hard)} hard, ${phase} asks ${range}`,
    });
  }
  if (hard > band.max) {
    findings.push({
      check: 'hard-share-high',
      detail: `${percent(hard)} hard, ${phase} asks ${range}`,
    });
  }
  if (middle > MAX_MIDDLE_SHARE) {
    findings.push({ check: 'middle-share-high', detail: `${percent(middle)} tempo` });
  }
  return findings;
}

function hardCountFindings(hard: readonly Session[]): PlanRubricFinding[] {
  const worst = Math.max(
    0,
    ...hard.map(
      (first) =>
        hard.filter(
          (other) =>
            other.dayOffset >= first.dayOffset && other.dayOffset < first.dayOffset + DAYS_IN_WEEK,
        ).length,
    ),
  );
  return worst > MAX_HARD_SESSIONS_PER_ROLLING_WEEK
    ? [{ check: 'too-many-hard', detail: `${worst} hard sessions within 7 days` }]
    : [];
}

function backToBackFindings(hard: readonly Session[]): PlanRubricFinding[] {
  const clash = hard.find((first) =>
    hard.some((next) => next.type === first.type && next.dayOffset === first.dayOffset + 1),
  );
  return clash
    ? [
        {
          check: 'hard-back-to-back',
          detail: `${clash.type} hard on days ${clash.dayOffset} and ${clash.dayOffset + 1}`,
        },
      ]
    : [];
}

function rationaleFindings(hard: readonly Session[]): PlanRubricFinding[] {
  return hard
    .filter((session) => session.rationale.trim() === '')
    .map((session) => ({ check: 'missing-rationale' as const, detail: session.title }));
}

function sportFindings(input: PlanRubricInput): PlanRubricFinding[] {
  if (input.days < DAYS_IN_WEEK) {
    return [];
  }
  const planned = new Set<string>(input.plan.sessions.map((session) => session.type));
  return input.practisedSports
    .filter((sport) => ENDURANCE_SPORTS.has(sport) && !planned.has(sport))
    .map((sport) => ({ check: 'sport-missing' as const, detail: sport }));
}

export function scorePlanWeek(input: PlanRubricInput): PlanRubricResult {
  const endurance = input.plan.sessions.filter((session) => ENDURANCE_SPORTS.has(session.type));
  const hard = endurance.filter((session) => HARD_INTENSITIES.has(session.intensity));
  const findings = [
    ...distributionFindings(endurance, input.phase),
    ...hardCountFindings(hard),
    ...backToBackFindings(hard),
    ...rationaleFindings(hard),
    ...sportFindings(input),
  ];
  return { score: Math.max(0, 100 - findings.length * POINTS_PER_FINDING), findings };
}
