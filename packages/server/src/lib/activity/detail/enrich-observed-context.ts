import { startOfDay, addDays } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import type { PrismaClient } from '@prisma/client';
import { type ActivityType } from '@prisma/client';
import { isActivityToday } from '@sharpit/app/lib/activity/list/activity-day';
import { backfillActivityObservedLocation } from '@sharpit/server/lib/activity/location/observed-location';
import { activityWeatherWindow } from '@sharpit/server/lib/activity/weather/activity-weather-window';
import {
  extractActivityWeatherSnapshot,
  needsWeatherEnrichment,
  serializeActivityWeather,
} from '@sharpit/app/lib/activity/weather/activity-weather';
import { isIndoorActivitySession } from '@sharpit/app/lib/activity/location/indoor-activity';
import { runActivityNarrativeAnalysis } from '@sharpit/server/lib/activity/narrative/activity-narrative';
import { fetchForecastPredictions } from '@sharpit/server/lib/planned-session/forecast/forecast-fetch';
import { computeTrainingDayId } from '@sharpit/core/training/training-day';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

export { isActivityToday } from '@sharpit/app/lib/activity/list/activity-day';

const OUTDOOR_TYPES = new Set<ActivityType>(['RUN', 'BIKE', 'SWIM', 'TRIATHLON']);

/**
 * Auto narrative from enrich is today-only (ingest / same-day context refresh).
 * Older activities: no auto work — athlete can request synthesis from the UI.
 */
export function shouldRefreshActivityNarrative(input: {
  force?: boolean;
  isToday: boolean;
  hasNarrative: boolean;
  weatherUpdated: boolean;
  locationNew: boolean;
}): boolean {
  if (input.force) {
    return true;
  }
  if (!input.isToday) {
    return false;
  }
  if (!input.hasNarrative) {
    return true;
  }
  return input.weatherUpdated || input.locationNew;
}

async function clearIndoorWeatherIfNeeded(
  prisma: PrismaClient,
  activityId: string,
  weather: string | null,
): Promise<boolean> {
  if (!weather) {
    return false;
  }
  await prisma.activity.update({
    where: { id: activityId },
    data: { weather: null },
  });
  return true;
}

async function refreshActivityNarrativeIfNeeded(input: {
  athleteId: string;
  activityId: string;
  shouldRefresh: boolean;
  force: boolean;
  hasNarrative: boolean;
  isToday: boolean;
  weatherUpdated: boolean;
  locationNew: boolean;
}): Promise<boolean> {
  if (!input.shouldRefresh) {
    return false;
  }
  return runActivityNarrativeAnalysis(input.athleteId, input.activityId, {
    force:
      input.force ||
      (input.hasNarrative && input.isToday && (input.weatherUpdated || input.locationNew)),
  });
}

async function handleIndoorActivityEnrichment(input: {
  prisma: PrismaClient;
  athleteId: string;
  activityId: string;
  activity: { weather: string | null };
  options?: { forceNarrative?: boolean };
  isToday: boolean;
  hasNarrative: boolean;
}): Promise<{ weatherUpdated: boolean; narrativeRefreshed: boolean }> {
  const weatherUpdated = await clearIndoorWeatherIfNeeded(
    input.prisma,
    input.activityId,
    input.activity.weather,
  );
  const narrativeRefreshed = await refreshActivityNarrativeIfNeeded({
    athleteId: input.athleteId,
    activityId: input.activityId,
    shouldRefresh: shouldRefreshActivityNarrative({
      force: input.options?.forceNarrative,
      isToday: input.isToday,
      hasNarrative: input.hasNarrative,
      weatherUpdated,
      locationNew: false,
    }),
    force:
      Boolean(input.options?.forceNarrative) ||
      (input.hasNarrative && input.isToday && weatherUpdated),
    hasNarrative: input.hasNarrative,
    isToday: input.isToday,
    weatherUpdated,
    locationNew: false,
  });
  return { weatherUpdated, narrativeRefreshed };
}

async function updateOutdoorWeatherSnapshot(input: {
  prisma: PrismaClient;
  athleteId: string;
  activityId: string;
  activity: { date: Date; duration: number | null; weather: string | null };
  observed: { latitude: number; longitude: number; label: string };
  locationCorrected: boolean;
  locationNew: boolean;
}): Promise<boolean> {
  if (
    !needsWeatherEnrichment(input.activity.weather) &&
    !input.locationCorrected &&
    !input.locationNew
  ) {
    return false;
  }
  const window = activityWeatherWindow(input.activity.date, input.activity.duration);
  const trainingDayId = computeTrainingDayId(input.activity.date);
  const { predictions } = await fetchForecastPredictions({
    location: {
      latitude: input.observed.latitude,
      longitude: input.observed.longitude,
      label: input.observed.label,
    },
    windowStart: window.start,
    windowEnd: window.end,
    athleteId: input.athleteId,
    trainingDayId,
  });
  const snapshot = extractActivityWeatherSnapshot(predictions, input.observed.label);
  const weatherLabel = snapshot ? serializeActivityWeather(snapshot) : null;
  if (!weatherLabel) {
    return false;
  }
  await input.prisma.activity.update({
    where: { id: input.activityId },
    data: { weather: weatherLabel },
  });
  return true;
}

async function enrichHistoricalOutdoorActivity(
  athleteId: string,
  activityId: string,
): Promise<{ weatherUpdated: boolean; narrativeRefreshed: boolean }> {
  const narrativeRefreshed = await runActivityNarrativeAnalysis(athleteId, activityId, {
    force: true,
  });
  return { weatherUpdated: false, narrativeRefreshed };
}

function detectObservedLocationDelta(input: {
  priorCoords: { latitude: number; longitude: number } | null;
  hadObservedLocation: boolean;
  observed: Awaited<ReturnType<typeof backfillActivityObservedLocation>>;
}) {
  const locationNew = !input.hadObservedLocation && isSet(input.observed);
  const locationCorrected =
    isSet(input.observed) &&
    isSet(input.priorCoords) &&
    (Math.abs(input.priorCoords.latitude - input.observed.latitude) > 0.0005 ||
      Math.abs(input.priorCoords.longitude - input.observed.longitude) > 0.0005);
  return { locationNew, locationCorrected };
}

function readPriorObservedCoords(activity: {
  observedLocationLat: number | null;
  observedLocationLng: number | null;
}) {
  if (
    activity.observedLocationLat === undefined ||
    activity.observedLocationLat === null ||
    activity.observedLocationLng === undefined ||
    activity.observedLocationLng === null
  ) {
    return null;
  }
  return {
    latitude: activity.observedLocationLat,
    longitude: activity.observedLocationLng,
  };
}

function shouldRefreshOutdoorWeather(input: {
  weather: string | null;
  locationCorrected: boolean;
  locationNew: boolean;
  observed: Awaited<ReturnType<typeof backfillActivityObservedLocation>>;
}) {
  return (
    (needsWeatherEnrichment(input.weather) || input.locationCorrected || input.locationNew) &&
    isSet(input.observed)
  );
}

async function enrichTodayOutdoorActivity(input: {
  prisma: PrismaClient;
  athleteId: string;
  activityId: string;
  activity: {
    date: Date;
    duration: number | null;
    weather: string | null;
    observedLocationLabel: string | null;
    observedLocationLat: number | null;
    observedLocationLng: number | null;
  };
  options?: { forceNarrative?: boolean };
  hasNarrative: boolean;
}): Promise<{ weatherUpdated: boolean; narrativeRefreshed: boolean }> {
  const priorCoords = readPriorObservedCoords(input.activity);
  const hadObservedLocation = Boolean(input.activity.observedLocationLabel?.trim());
  const observed = await backfillActivityObservedLocation(input.prisma, input.activityId);
  const { locationNew, locationCorrected } = detectObservedLocationDelta({
    priorCoords,
    hadObservedLocation,
    observed,
  });

  let weatherUpdated = false;
  if (
    shouldRefreshOutdoorWeather({
      weather: input.activity.weather,
      locationCorrected,
      locationNew,
      observed,
    }) &&
    observed
  ) {
    weatherUpdated = await updateOutdoorWeatherSnapshot({
      prisma: input.prisma,
      athleteId: input.athleteId,
      activityId: input.activityId,
      activity: input.activity,
      observed,
      locationCorrected,
      locationNew,
    });
  }

  const narrativeRefreshed = await refreshActivityNarrativeIfNeeded({
    athleteId: input.athleteId,
    activityId: input.activityId,
    shouldRefresh: shouldRefreshActivityNarrative({
      force: input.options?.forceNarrative,
      isToday: true,
      hasNarrative: input.hasNarrative,
      weatherUpdated,
      locationNew,
    }),
    force: Boolean(input.options?.forceNarrative),
    hasNarrative: input.hasNarrative,
    isToday: true,
    weatherUpdated,
    locationNew,
  });

  return { weatherUpdated, narrativeRefreshed };
}

export async function enrichActivityObservedContext(
  prisma: PrismaClient,
  athleteId: string,
  activityId: string,
  options?: { forceNarrative?: boolean },
): Promise<{ weatherUpdated: boolean; narrativeRefreshed: boolean }> {
  let weatherUpdated = false;
  let narrativeRefreshed = false;

  const activity = await prisma.activity.findFirst({
    where: { id: activityId, athleteId },
    select: {
      id: true,
      type: true,
      title: true,
      notes: true,
      date: true,
      duration: true,
      weather: true,
      narrativeAnalyzedAt: true,
      observedLocationLabel: true,
      observedLocationLat: true,
      observedLocationLng: true,
    },
  });

  if (!activity || !OUTDOOR_TYPES.has(activity.type)) {
    return { weatherUpdated, narrativeRefreshed };
  }

  const isToday = isActivityToday(activity.date);
  const hasNarrative = Boolean(activity.narrativeAnalyzedAt);

  // Historical browse / late sync of old sessions: never auto-fetch weather or narrative.
  // Ingest of today's sessions + enrichTodayActivitiesContext remain the only paths.
  if (!isToday && !options?.forceNarrative) {
    return { weatherUpdated, narrativeRefreshed };
  }

  // Indoor / virtual / trainer — never fetch outdoor weather (Zwift GPS ≠ outdoor).
  // Clear any previously persisted outdoor snapshot so coach narratives stay honest.
  if (isIndoorActivitySession(activity)) {
    return handleIndoorActivityEnrichment({
      prisma,
      athleteId,
      activityId,
      activity,
      options,
      isToday,
      hasNarrative,
    });
  }

  // Manual / forced narrative on a historical outdoor session: no weather backfill.
  if (!isToday) {
    return enrichHistoricalOutdoorActivity(athleteId, activityId);
  }

  return enrichTodayOutdoorActivity({
    prisma,
    athleteId,
    activityId,
    activity,
    options,
    hasNarrative,
  });
}

/** Enrichit les activités outdoor du jour dont la météo est absente ou non affichable. */
export async function enrichTodayActivitiesContext(
  prisma: PrismaClient,
  athleteId: string,
): Promise<void> {
  const today = startOfDay(new Date());
  const activities = await prisma.activity.findMany({
    where: {
      athleteId,
      ...visibleActivityWhere,
      date: { gte: today, lt: addDays(today, 1) },
      type: { in: [...OUTDOOR_TYPES] },
    },
    select: { id: true, type: true, title: true, notes: true, weather: true },
  });

  await Promise.all(
    activities
      .filter((row) => !isIndoorActivitySession(row) && needsWeatherEnrichment(row.weather))
      .map(async ({ id }) => {
        try {
          await enrichActivityObservedContext(prisma, athleteId, id);
        } catch (error) {
          console.error('[enrich-today-activities]', id, error);
        }
      }),
  );
}
