import {
  DEFAULT_CORE_PRACTICED_SPORTS,
  type PracticedSportId,
} from '@sharpit/app/lib/practiced-sports';
import { buildContextCoachTools } from './coach-tools-context';
import { buildFoodLogCoachTools } from './coach-tools-food-log';
import { buildQueryCoachTools } from './coach-tools-query';
import { buildSessionCoachTools } from './coach-tools-sessions';
import { coachTypeEnumForSports, travelDisciplineEnumForSports } from './coach-tools-shared';
import { withCoachToolExecution } from './coach-tool-execution';

/** The tools that write the athlete's plan, context or food log: run one at a time within an answer. */
const COACH_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'createPlannedSession',
  'createBrickSession',
  'updatePlannedSession',
  'deletePlannedSession',
  'setTravelContext',
  'setTrainingConstraint',
  'logFoods',
]);

/**
 * Tous s'exécutent côté serveur et renvoient un résumé compact.
 * `practicedSports` narrows create/update/travel proposal enums (proposals only).
 */
export function createCoachTools(
  athleteId: string,
  options?: { practicedSports?: readonly PracticedSportId[] },
) {
  const practicedSports = options?.practicedSports ?? [...DEFAULT_CORE_PRACTICED_SPORTS];
  const proposalTypeEnum = coachTypeEnumForSports(practicedSports);
  const proposalTravelEnum = travelDisciplineEnumForSports(practicedSports);

  return withCoachToolExecution(
    {
      ...buildQueryCoachTools(athleteId),
      ...buildSessionCoachTools(athleteId, practicedSports, proposalTypeEnum),
      ...buildContextCoachTools(athleteId, proposalTravelEnum),
      ...buildFoodLogCoachTools(athleteId),
    },
    COACH_WRITE_TOOLS,
  );
}
