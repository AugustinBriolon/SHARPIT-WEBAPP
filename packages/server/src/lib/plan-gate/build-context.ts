import { addDays, min as minDate, max as maxDate } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import {
  getAthleteProfile,
  getGoalById,
  getActiveTrainingPlan,
  getPlannedSessions,
  getTrainingZoneNotes,
} from '@sharpit/server/lib/queries';
import {
  googleCalendarGateFromPrefs,
  shouldLoadCalendarBusyBlocks,
} from '@sharpit/server/lib/cron/provider-sync-gates';
import { isOAuthAccountConnected } from '@sharpit/server/lib/integrations/shared/connection-status';
import {
  getGoogleAccount,
  getUpcomingBusy,
} from '@sharpit/server/lib/integrations/google/google-sync';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import { loadDailyTrainingStressEntries } from '@sharpit/server/lib/training/pmc/pmc-server';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import { normalizeAthletePracticedSports } from '@sharpit/app/lib/practiced-sports';
import type { GateContext, GateProposal } from '@sharpit/app/lib/plan-gate/types';

const WINDOW_PADDING_DAYS = 7; // for recovery-spacing / duplicate checks near the proposal window edges

function hasThresholds(
  profile: {
    ftpW: number | null;
    lthr: number | null;
    maxHr: number | null;
    runThresholdPaceSecPerKm: number | null;
  } | null,
): boolean {
  if (!profile) {
    return false;
  }
  return (
    isSet(profile.ftpW) ||
    isSet(profile.lthr) ||
    isSet(profile.maxHr) ||
    isSet(profile.runThresholdPaceSecPerKm)
  );
}

/**
 * The ONLY place in the plan-gate module that touches Prisma or the Snapshot service.
 * Builds a fully-resolved, deterministic GateContext — evaluate-plan.ts never fetches
 * anything itself.
 *
 * Also returns the raw `snapshot` used to build the context, so callers that need the
 * full AthleteSnapshot (e.g. Decision Memory's frozen snapshotContext) don't have to
 * fetch it a second time.
 */
function gateWindowBounds(proposals: readonly GateProposal[], now: Date) {
  const proposalDates = proposals.map((p) => new Date(`${p.date}T00:00:00`));
  const hasProposalDates = proposalDates.length > 0;
  const windowStart = hasProposalDates
    ? addDays(minDate(proposalDates), -WINDOW_PADDING_DAYS)
    : addDays(now, -WINDOW_PADDING_DAYS);
  const windowEnd = hasProposalDates
    ? addDays(maxDate(proposalDates), WINDOW_PADDING_DAYS)
    : addDays(now, WINDOW_PADDING_DAYS);
  return { proposalDates, windowStart, windowEnd };
}

function mapGateExistingSessions(
  sessions: Awaited<ReturnType<typeof getPlannedSessions>>,
): GateContext['existingSessions'] {
  return sessions.map((s) => ({
    id: s.id,
    date: new Date(s.date),
    type: s.type,
    intensity: s.intensity,
    completed: s.completed,
    load: s.load,
  }));
}

function buildGateContextPayload(input: {
  trainingDayId: string;
  snapshot: AthleteSnapshot;
  dailyTrainingStress: GateContext['dailyTrainingStress'];
  existingSessionsRaw: Awaited<ReturnType<typeof getPlannedSessions>>;
  goal: Awaited<ReturnType<typeof getGoalById>>;
  trainingPlan: Awaited<ReturnType<typeof getActiveTrainingPlan>>;
  busyBlocks: GateContext['busyBlocks'];
  athleteProfile: Awaited<ReturnType<typeof getAthleteProfile>>;
  now: Date;
}): GateContext {
  const {
    trainingDayId,
    snapshot,
    dailyTrainingStress,
    existingSessionsRaw,
    goal,
    trainingPlan,
    busyBlocks,
    athleteProfile,
    now,
  } = input;

  return {
    trainingDayId,
    decision: snapshot.decision,
    physicalHealth: snapshot.physicalHealth,
    fatigueTrainingCapacity: snapshot.fatigue?.trainingCapacity ?? null,
    dailyTrainingStress,
    existingSessions: mapGateExistingSessions(existingSessionsRaw),
    goal: goal ? { horizon: goal.horizon, targetDate: goal.targetDate } : null,
    planWeeks: trainingPlan
      ? trainingPlan.weeks.map((w) => ({
          weekStart: w.weekStart,
          phase: w.phase,
          targetLoad: w.targetLoad,
        }))
      : [],
    busyBlocks,
    athleteProfile: { hasThresholds: hasThresholds(athleteProfile) },
    practicedSports: normalizeAthletePracticedSports(athleteProfile?.practicedSports ?? null)
      .sports,
    now,
  };
}

export async function buildGateContext(params: {
  athleteId: string;
  trainingDayId: string;
  proposals: readonly GateProposal[];
  goalId?: string | null;
  now?: Date;
}): Promise<{ context: GateContext; snapshot: AthleteSnapshot }> {
  const { athleteId, trainingDayId, proposals, goalId, now = new Date() } = params;
  const { proposalDates, windowStart, windowEnd } = gateWindowBounds(proposals, now);

  const [
    snapshot,
    dailyTrainingStress,
    existingSessionsRaw,
    goal,
    trainingPlan,
    athleteProfile,
    googleAccount,
    trainingZones,
    sourcePrefs,
  ] = await Promise.all([
    getOrBuildAthleteSnapshot(athleteId, trainingDayId),
    loadDailyTrainingStressEntries(athleteId, { refDate: now }),
    getPlannedSessions(athleteId, { from: windowStart, to: windowEnd }),
    goalId ? getGoalById(athleteId, goalId) : Promise.resolve(null),
    getActiveTrainingPlan(athleteId),
    getAthleteProfile(athleteId),
    getGoogleAccount(athleteId),
    getTrainingZoneNotes(athleteId, now),
    loadResolvedSourcePrefs(athleteId),
  ]);

  const calendarGate = googleCalendarGateFromPrefs(sourcePrefs);
  const loadBusy = shouldLoadCalendarBusyBlocks({
    googleOAuthConnected: isOAuthAccountConnected(googleAccount),
    calendarEnabled: calendarGate.calendarEnabled,
  });

  // null = no calendar connected (skip the rule); [] = connected with nothing busy.
  const busyBlocks = loadBusy
    ? await getUpcomingBusy(
        athleteId,
        WINDOW_PADDING_DAYS + Math.max(1, proposalDates.length),
      ).catch(() => [])
    : null;

  const payload = buildGateContextPayload({
    trainingDayId,
    snapshot,
    dailyTrainingStress,
    existingSessionsRaw,
    goal,
    trainingPlan,
    busyBlocks,
    athleteProfile,
    now,
  });
  const context: GateContext = { ...payload, trainingZones };

  return { context, snapshot };
}
