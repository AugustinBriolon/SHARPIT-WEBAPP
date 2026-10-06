import { describe, expect, it } from 'vitest';
import { ActivityType } from '@prisma/client';
import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';
import {
  buildGarminActivityData,
  garminDedupDurations,
  garminEnrichmentUpdate,
  garminTrainingStressScore,
  mapGarminType,
} from '@sharpit/server/lib/integrations/garmin/garmin-activities';

describe('garminDedupDurations', () => {
  it('keeps moving as primary and exposes elapsed as alternate for runs', () => {
    const activity = {
      movingDuration: 2_400,
      duration: 2_500,
      elapsedDuration: 2_820,
    } as unknown as IActivity;

    expect(garminDedupDurations(activity, ActivityType.RUN)).toEqual({
      duration: 2_400,
      altDurations: [2_500, 2_820],
    });
  });
});

describe('garminTrainingStressScore', () => {
  const activity = (fields: Partial<IActivity>) => fields as IActivity;

  it('reads the Training Stress Score when Garmin provides one', () => {
    expect(garminTrainingStressScore(activity({ trainingStressScore: 65 }))).toBe(65);
  });

  it('never substitutes the EPOC training load', () => {
    // trainingStressScore is Coggan TSS (100 = one hour at threshold);
    // activityTrainingLoad is EPOC-derived and ran ~3x that scale on real data,
    // which is what made cross-sport load comparison meaningless.
    expect(
      garminTrainingStressScore(
        activity({ trainingStressScore: null, activityTrainingLoad: 210 } as Partial<IActivity>),
      ),
    ).toBeNull();
  });

  it('rejects non-positive and non-numeric values', () => {
    expect(garminTrainingStressScore(activity({ trainingStressScore: 0 }))).toBeNull();
    expect(garminTrainingStressScore(activity({}))).toBeNull();
  });
});

describe('mapGarminType', () => {
  it.each([
    ['triathlon', ActivityType.TRIATHLON],
    ['duathlon', ActivityType.TRIATHLON],
    ['multisport', ActivityType.TRIATHLON],
    ['multi_sport', ActivityType.TRIATHLON],
    ['running', ActivityType.RUN],
    ['cycling', ActivityType.BIKE],
    ['lap_swimming', ActivityType.SWIM],
    ['strength_training', ActivityType.STRENGTH],
  ])('%s -> %s', (typeKey, expected) => {
    expect(mapGarminType(typeKey)).toBe(expected);
  });

  it('falls back to OTHER for supported-but-unmodeled Garmin sports', () => {
    expect(mapGarminType('kayaking')).toBe(ActivityType.OTHER);
    expect(mapGarminType('padel')).toBe(ActivityType.OTHER);
  });

  it.each([
    ['hiking', ActivityType.HIKE],
    ['walking', ActivityType.HIKE],
    ['mountaineering', ActivityType.HIKE],
    ['hike', ActivityType.HIKE],
  ])('%s -> HIKE', (typeKey, expected) => {
    expect(mapGarminType(typeKey)).toBe(expected);
  });

  it('keeps trail_running as RUN', () => {
    expect(mapGarminType('trail_running')).toBe(ActivityType.RUN);
  });
});

describe('bike distance', () => {
  const ride = {
    activityId: 42,
    activityName: 'Sortie',
    startTimeLocal: '2026-09-29 09:00:00',
    distance: 41_250,
    duration: 4_500,
    elevationGain: 320,
  } as unknown as IActivity;
  const evaluation = { rpe: null, feeling: null, notes: null };

  // The ride's distance was dropped on import, so the app read « 0,0 km » beside its time.
  it('keeps the ride distance Garmin summarises on import', () => {
    const data = buildGarminActivityData(ride, evaluation, ActivityType.BIKE);
    const created = (data.bikeMetrics as { create: { distanceM: number | null } }).create;
    expect(created.distanceM).toBe(41_250);
  });

  it('fills the distance of a ride already imported from Strava', () => {
    const data = garminEnrichmentUpdate(ride, evaluation, ActivityType.BIKE, 'strava-1');
    const { upsert } = data.bikeMetrics as {
      upsert: { create: { distanceM: number | null }; update: { distanceM?: number } };
    };
    expect(upsert.create.distanceM).toBe(41_250);
    expect(upsert.update.distanceM).toBe(41_250);
  });
});
