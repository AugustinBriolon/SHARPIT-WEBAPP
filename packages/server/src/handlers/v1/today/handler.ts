import { NextRequest, NextResponse, after } from 'next/server';
import { appOrigin } from '@sharpit/server/lib/app-origin';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { getActivitiesList, getHealthEntries } from '@sharpit/server/lib/queries';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import {
  analyzeLinkedPlannedSessions,
  autoLinkActivitiesOfDay,
} from '@sharpit/server/lib/planned-session/linking/session-linking';
import { addDays, format, startOfDay } from 'date-fns';
import {
  ensureMorningRecalibration,
  getMorningRecalibrationPresentation,
  isMorningCheckInDone,
} from '@sharpit/server/lib/morning-recalibration/service';
import { buildTodayPresentationViewModel } from '@sharpit/server/lib/presentation/today/today';
import { projectV1Consistency } from '@sharpit/server/lib/presentation/v1/consistency';
import { loadV1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';
import { loadV1DayTimeline } from '@sharpit/server/lib/presentation/v1/day-timeline';
import { projectV1TodayFromViewModel } from '@sharpit/server/lib/presentation/v1/today';
import { readPlanHorizonView } from '@sharpit/server/lib/coach/plan/plan-horizon';
import { isSettledTrainingDay, todayIsoDate } from '@sharpit/app/lib/health/activity-status';
import { startServerTiming } from '@sharpit/server/lib/http/server-timing';

function isValidTrainingDayId(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Midday local time on the requested day — away from both DST edges. */
function referenceDateFor(trainingDayId: string): Date {
  return new Date(`${trainingDayId}T12:00:00`);
}

/**
 * Pairs the day's finished activities with their planned sessions, as the web does when an
 * activity arrives. The native client never triggers that sync, so without this an athlete
 * who only opens the app would never see a session marked as done. Best effort: a failure
 * costs the pairing, not the screen.
 */
async function autoLinkTodayActivities(athleteId: string, trainingDayId: string): Promise<void> {
  try {
    const sessionIds = await autoLinkActivitiesOfDay(athleteId, referenceDateFor(trainingDayId));
    if (sessionIds.length > 0) {
      after(() => analyzeLinkedPlannedSessions(athleteId, sessionIds));
    }
  } catch (error) {
    console.error('[api/v1/today/auto-link]', error);
  }
}

/**
 * The athlete's today, give or take the server's clock: the app asks for its own local day,
 * which can sit a day either side of UTC around midnight.
 */
function isAroundToday(trainingDayId: string, now: Date = new Date()): boolean {
  return [-1, 0, 1].some((offset) => format(addDays(now, offset), 'yyyy-MM-dd') === trainingDayId);
}

/**
 * Today's morning proposal: written as soon as the night is read (the check-in refines it
 * later), only read for any other day. Best effort: a failure costs the card, not the screen.
 */
async function loadMorningProposal(athleteId: string, trainingDayId: string) {
  try {
    const presentation = isAroundToday(trainingDayId)
      ? (await ensureMorningRecalibration(athleteId, trainingDayId)).presentation
      : await getMorningRecalibrationPresentation(athleteId, trainingDayId);
    const checkInDone = presentation ? await isMorningCheckInDone(athleteId, trainingDayId) : true;
    return { presentation, checkInDone };
  } catch (error) {
    console.error('[api/v1/today/morning-recalibration]', error);
    return { presentation: null, checkInDone: true };
  }
}

/**
 * Canonical Today payload for native (and future complementary-web) clients.
 * Presentation `/api/presentation/today` remains for the current Next.js UI.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trainingDayId = searchParams.get('trainingDayId');

  if (!trainingDayId || !isValidTrainingDayId(trainingDayId)) {
    return NextResponse.json(
      { error: 'trainingDayId est requis et doit être au format YYYY-MM-DD' },
      { status: 400 },
    );
  }

  try {
    const timing = startServerTiming();
    const athleteId = await getCurrentAthleteId();
    timing.mark('auth');
    // A settled day's sessions were paired when they arrived; reading it again changes nothing.
    if (!isSettledTrainingDay(trainingDayId)) {
      await autoLinkTodayActivities(athleteId, trainingDayId);
    }
    timing.mark('link');
    const morning = await loadMorningProposal(athleteId, trainingDayId);
    timing.mark('morning');
    const morningRecalibration = morning.presentation;
    const refDate = referenceDateFor(trainingDayId);

    // Pre-fetch shared data in a single parallel batch so no database table is queried twice
    const [snapshot, healthEntries, activities] = await Promise.all([
      getOrBuildAthleteSnapshot(athleteId, trainingDayId),
      getHealthEntries(athleteId, 14, refDate),
      // The 60 days up to the one asked for: a past day reads its own weeks, not today's.
      getActivitiesList(athleteId, {
        after: addDays(startOfDay(refDate), -60),
        before: addDays(startOfDay(refDate), 1),
      }),
    ]);
    timing.mark('state');

    const [viewModel, dayScores] = await Promise.all([
      buildTodayPresentationViewModel(athleteId, trainingDayId, {
        morningRecalibration,
        athleteSnapshot: snapshot,
        healthEntries,
        activities,
      }),
      loadV1DayScores(athleteId, trainingDayId, new Date(), {
        snapshot,
        healthEntries,
      }).catch((error) => {
        console.error('[api/v1/today/day-scores]', error);
        return {
          stress: null,
          energyBank: null,
          targetBand: null,
          strainPerformance: null,
        };
      }),
    ]);
    timing.mark('view');
    const projected = projectV1TodayFromViewModel(viewModel, {
      trainingDayId,
      webOrigin: appOrigin(request.nextUrl.origin),
      consistency: projectV1Consistency(activities, refDate),
      morningCheckInDone: morning.checkInDone,
      stress: dayScores.stress,
      energyBank: dayScores.energyBank,
      targetBand: dayScores.targetBand,
    });
    const timeline = await loadV1DayTimeline(athleteId, trainingDayId, {
      sessions: projected.sessions.map((session) => ({
        title: session.title,
        kind: session.kind,
        minuteOfDay: null,
      })),
      stress: dayScores.stress,
      energyBank: dayScores.energyBank,
      healthEntries,
    }).catch((error) => {
      console.error('[api/v1/today/timeline]', error);
      return [];
    });
    timing.mark('timeline');
    // Only today speaks of the plan's end: a past day reads as it was.
    const planHorizon =
      trainingDayId === todayIsoDate()
        ? await readPlanHorizonView(athleteId, trainingDayId).catch((error) => {
            console.error('[api/v1/today/plan-horizon]', error);
            return null;
          })
        : null;
    timing.mark('horizon');
    return NextResponse.json(
      { ...projected, timeline, planHorizon },
      { headers: { 'server-timing': timing.header('today') } },
    );
  } catch (error) {
    console.error('[api/v1/today]', error);
    return NextResponse.json({ error: 'Impossible de produire la vue Today' }, { status: 500 });
  }
}
