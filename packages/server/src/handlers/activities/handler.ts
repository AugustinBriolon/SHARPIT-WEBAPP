import { NextRequest, NextResponse, after } from 'next/server';
import { ActivityType } from '@prisma/client';
import { sportSupportsOutdoorContext } from '@sharpit/core/planned-session/defaults';
import { enrichActivityObservedContext } from '@sharpit/server/lib/activity/detail/enrich-observed-context';
import { buildActivityCreateData } from '@sharpit/server/lib/activity/activity-service';
import { runActivityNarrativeAnalysis } from '@sharpit/server/lib/activity/narrative/activity-narrative';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { isDemoSession } from '@sharpit/app/lib/demo/demo-session';
import { syncManualActivityObservations } from '@sharpit/server/lib/observation/manual-observation-sync';
import { createActivity, getActivitiesList } from '@sharpit/server/lib/queries';
import { prisma } from '@sharpit/db/client';
import { updateRecordsForTypesSafe } from '@sharpit/server/lib/training/records/records';
import { createActivitySchema } from '@sharpit/app/lib/validators/activity';

export async function GET(request: NextRequest) {
  // Read search params before try so Cache Components prerender interrupts propagate.
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as ActivityType | null;
  const limit = searchParams.get('limit');
  const sinceDays = searchParams.get('sinceDays');
  const before = searchParams.get('before');
  const after = searchParams.get('after');

  try {
    // Weather / narrative enrichment runs on athlete-state refresh & provider sync —
    // never as a side-effect of listing activities (avoids Neon work on every GET).
    const athleteId = await getCurrentAthleteId();

    // A demo session's `sinceDays` is capped server-side, not just hidden by the
    // UI's date pickers — /training/history calls this route with no params at
    // all, which would otherwise return the full seeded history regardless.
    const requestedSinceDays = sinceDays ? Number(sinceDays) : undefined;
    const effectiveSinceDays = (await isDemoSession())
      ? Math.min(requestedSinceDays ?? 7, 7)
      : requestedSinceDays;

    const activities = await getActivitiesList(athleteId, {
      type: type && Object.values(ActivityType).includes(type) ? type : undefined,
      limit: limit ? Number(limit) : undefined,
      sinceDays: effectiveSinceDays,
      before: before ? new Date(before) : undefined,
      after: after ? new Date(after) : undefined,
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de charger les séances' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = createActivitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const activity = await createActivity(
      athleteId,
      buildActivityCreateData(parsed.data) as Parameters<typeof createActivity>[1],
    );
    // Observations do not mutate the returned activity JSON; kept awaited so ingest
    // finishes before Instant UX continues (downstream twin consistency).
    await syncManualActivityObservations(activity);

    const activityId = activity.id;
    const activityType = parsed.data.type;
    const shouldEnrich =
      sportSupportsOutdoorContext(activityType) &&
      parsed.data.observedLocationLat !== null &&
      parsed.data.observedLocationLng !== null;

    // Return the createActivity row immediately (Instant UX). Weather / observed
    // context / narrative / auto-link land via later invalidate+refetch once
    // after() work completes — do not block 201 on enrich.
    after(async () => {
      try {
        await updateRecordsForTypesSafe(athleteId, [activityType]);
      } catch (error) {
        console.error('[activities/POST] records', error);
      }

      if (shouldEnrich) {
        try {
          await enrichActivityObservedContext(prisma, athleteId, activityId);
        } catch (error) {
          console.error('[activities/POST] enrich-context', error);
        }
      }

      try {
        await runActivityNarrativeAnalysis(athleteId, activityId);
      } catch (error) {
        console.error('[activities/POST] narrative', error);
      }

      let plannedSessionIdsToAnalyze: string[] = [];
      try {
        const { autoLinkActivities } =
          await import('@sharpit/server/lib/planned-session/linking/session-linking');
        plannedSessionIdsToAnalyze = (await autoLinkActivities(athleteId, [activityId])).sessionIds;
      } catch (error) {
        console.error('[activities/POST] auto-link', error);
      }

      try {
        const { scheduleBackgroundTasks } =
          await import('@sharpit/server/lib/athlete-state/background');
        scheduleBackgroundTasks({
          athleteId,
          activityIds: [activityId],
          regenerateBriefing: false,
          plannedSessionIdsToAnalyze,
        });
      } catch (error) {
        console.error('[activities/POST] background', error);
      }
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de créer la séance' }, { status: 500 });
  }
}
