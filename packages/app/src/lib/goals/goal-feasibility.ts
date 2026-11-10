import { formatDuration } from '@sharpit/app/lib/format';
import type { RaceProjection } from '@sharpit/app/lib/goals/goal-race-projection';

/**
 * Where a race's target time sits against its own projection: at or behind the projected finish
 * it is within reach, inside the optimistic half of the range a stretch, faster than the whole
 * range out of reach. The projection already carries the trend to race day.
 */
export type RaceGoalFeasibility = 'within_reach' | 'stretch' | 'out_of_reach';

type ProjectedFinish = Pick<
  RaceProjection,
  'finishSec' | 'lowSec' | 'highSec' | 'targetSec' | 'confidence'
>;

export function raceGoalFeasibility(projection: ProjectedFinish): RaceGoalFeasibility | null {
  const { targetSec, finishSec, lowSec } = projection;
  if (targetSec === null) {
    return null;
  }
  if (targetSec >= finishSec) {
    return 'within_reach';
  }
  return targetSec >= lowSec ? 'stretch' : 'out_of_reach';
}

const CONFIDENCE_FR = { low: 'faible', medium: 'moyenne', high: 'haute' } as const;

const INSTRUCTION: Record<RaceGoalFeasibility, string> = {
  within_reach: 'La cible est à portée : construis vers elle.',
  stretch:
    'La cible est ambitieuse mais dans la fourchette : dis-le dans le résumé, sans promettre.',
  out_of_reach:
    'La cible est hors de portée à cette date : dis-le clairement dans le résumé, propose un temps dans la fourchette (ou plus de temps), et calibre les séances sur le niveau projeté, jamais sur la cible.',
};

/** The plan prompt's lines on the target; empty when the race names no time. */
export function formatRaceFeasibilityForCoach(projection: ProjectedFinish): string[] {
  const feasibility = raceGoalFeasibility(projection);
  if (!feasibility || projection.targetSec === null) {
    return [];
  }
  return [
    `Projection SharpIt le jour de la course : ${formatDuration(projection.finishSec)} (fourchette ${formatDuration(projection.lowSec)} à ${formatDuration(projection.highSec)}, confiance ${CONFIDENCE_FR[projection.confidence]}) ; cible ${formatDuration(projection.targetSec)}.`,
    INSTRUCTION[feasibility],
  ];
}
