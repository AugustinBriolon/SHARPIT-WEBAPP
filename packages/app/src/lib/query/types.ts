import type {
  AthleteThresholdSnapshot,
  BodyCompositionMeasurement,
  DailyHealth,
  Goal,
  Prisma,
} from '@prisma/client';
import type { EnrichedGoal } from '@sharpit/app/lib/goals/enriched-goal';
import type {
  activityDetailInclude,
  activityListSelect,
  physicalNoteInclude,
  plannedSessionInclude,
  planWeekInclude,
} from '@sharpit/app/lib/query/activity-include';

/**
 * Client-side row types: the shapes the API's queries select (`activity-include.ts`), as
 * Prisma payload types — dates are `Date`s once the fetchers revive them. Types only: no
 * Prisma runtime reaches the browser, and nothing here depends on the server package.
 */
export type ClientActivity = Prisma.ActivityGetPayload<{ select: typeof activityListSelect }>;
export type ClientActivityDetail = Prisma.ActivityGetPayload<{
  include: typeof activityDetailInclude;
}>;
export type ClientHealthEntry = DailyHealth;
export type ClientBodyCompositionEntry = BodyCompositionMeasurement;
export type ClientGoal = EnrichedGoal<Goal>;
export type ClientPlannedSession = Prisma.PlannedSessionGetPayload<{
  include: typeof plannedSessionInclude;
}>;
export type ClientPhysicalNote = Prisma.PhysicalNoteGetPayload<{
  include: typeof physicalNoteInclude;
}>;
export type ClientPhysicalCheckin = ClientPhysicalNote['checkins'][number];
export type ClientTrainingPlan = Prisma.TrainingPlanGetPayload<{
  include: typeof planWeekInclude;
}>;
export type ClientPlanWeek = ClientTrainingPlan['weeks'][number];
export type ClientThresholdSnapshot = AthleteThresholdSnapshot;
