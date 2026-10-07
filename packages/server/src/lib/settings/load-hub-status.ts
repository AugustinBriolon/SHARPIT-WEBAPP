import { cache } from 'react';
import { listCoachMemoryEntries } from '@sharpit/server/lib/coach-memory/core/service';
import { getGarminAccount } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import {
  getGoogleAccount,
  isGoogleConnected,
} from '@sharpit/server/lib/integrations/google/google-sync';
import { getRenphoAccount } from '@sharpit/server/lib/integrations/renpho/renpho-sync';
import { getStravaAccount } from '@sharpit/server/lib/integrations/strava/strava-sync';
import { getWithingsAccount } from '@sharpit/server/lib/integrations/withings/withings-sync';
import {
  isGarminAccountConnected,
  isOAuthAccountConnected,
  isRenphoAccountConnected,
  reconnectProviderNames,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import { prisma } from '@sharpit/db/client';
import { getAthleteProfile, getGoals } from '@sharpit/server/lib/queries';
import {
  accountStatusLabel,
  equipmentFactsFromRaw,
  equipmentStatusLabel,
  goalsStatusLabel,
  integrationsStatusLabel,
  memoryStatusLabel,
  type SettingsHubStatus,
} from '@sharpit/app/lib/settings/hub-status';

const APP_VERSION = '0.1.0';

async function loadIntegrationHubFacts(athleteId: string): Promise<{
  connectedCount: number;
  reconnectNames: string[];
}> {
  const [strava, garmin, withings, renpho, google] = await Promise.all([
    getStravaAccount(athleteId).catch(() => null),
    getGarminAccount(athleteId).catch(() => null),
    getWithingsAccount(athleteId).catch(() => null),
    getRenphoAccount(athleteId).catch(() => null),
    getGoogleAccount(athleteId).catch(() => null),
  ]);

  const connectedCount = [
    isOAuthAccountConnected(strava),
    isGarminAccountConnected(garmin),
    isOAuthAccountConnected(withings),
    isRenphoAccountConnected(renpho),
    isGoogleConnected(google),
  ].filter(Boolean).length;

  return {
    connectedCount,
    reconnectNames: reconnectProviderNames({
      strava,
      garmin,
      withings,
      renpho,
      google,
    }),
  };
}

/**
 * Per-request memoized read for the settings hub. Each status chip streams into
 * its own Suspense boundary, so the loader is called once per chip and deduped
 * to a single round of queries here.
 */
export const getSettingsHubStatus = cache(loadSettingsHubStatus);

/** Server snapshot for settings hub status chips. Failures degrade to neutral copy. */
function activeMemoryLabel(
  activeMemory:
    NonNullable<Awaited<ReturnType<typeof listCoachMemoryEntries>>>['entries'][number] | null,
): string | null {
  return (
    activeMemory?.locationLabel?.trim() ||
    activeMemory?.label?.trim() ||
    (activeMemory ? 'Actif' : null)
  );
}

function buildHubGoalsStatus(goals: Awaited<ReturnType<typeof getGoals>>) {
  const activeEntries = goals.filter((goal) => !goal.achieved);
  const activeRaces = activeEntries.filter((goal) => goal.kind === 'RACE').length;
  return goalsStatusLabel({ total: activeEntries.length, activeRaces });
}

function buildHubMemoryStatus(memory: Awaited<ReturnType<typeof listCoachMemoryEntries>> | null) {
  const activeMemory = memory?.entries.find((entry) => entry.isActive) ?? null;
  return memoryStatusLabel({
    entryCount: memory?.entries.length ?? 0,
    hasProfileContext: Boolean(memory?.profileContext?.trim()),
    activeLabel: activeMemoryLabel(activeMemory),
  });
}

function assembleSettingsHubStatus(input: {
  profile: Awaited<ReturnType<typeof getAthleteProfile>> | null;
  goals: Awaited<ReturnType<typeof getGoals>>;
  memory: Awaited<ReturnType<typeof listCoachMemoryEntries>> | null;
  integrationFacts: { connectedCount: number; reconnectNames: string[] };
}): SettingsHubStatus {
  const { profile, goals, memory, integrationFacts } = input;

  return {
    account: accountStatusLabel({
      heightCm: profile?.heightCm,
      birthDate: profile?.birthDate,
      sleepTargetMinutes: profile?.sleepTargetMinutes,
      sleepBedtimeTargetMin: profile?.sleepBedtimeTargetMin,
    }),
    equipment: equipmentStatusLabel(equipmentFactsFromRaw(profile?.equipment ?? null)),
    goals: buildHubGoalsStatus(goals),
    memory: buildHubMemoryStatus(memory),
    integrations: integrationsStatusLabel(integrationFacts),
    about: `v${APP_VERSION}`,
  };
}

export async function loadSettingsHubStatus(athleteId: string): Promise<SettingsHubStatus> {
  const [profile, goals, memory, integrationFacts] = await Promise.all([
    getAthleteProfile(athleteId).catch(() => null),
    getGoals(athleteId).catch(() => []),
    listCoachMemoryEntries(prisma, athleteId).catch(() => null),
    loadIntegrationHubFacts(athleteId).catch(() => ({ connectedCount: 0, reconnectNames: [] })),
  ]);

  return assembleSettingsHubStatus({ profile, goals, memory, integrationFacts });
}
