/**
 * Demo journal + analyses seed — same habit profile as the preview script:
 * daily supplement stack, no alcohol, intermittent late_meal / device_in_bed,
 * modest caffeine. Sleep / recovery / BB drop on rough nights so Analyses
 * and the Today bridge show a credible priority finding.
 */

import { AccessTier, type PrismaClient } from '@prisma/client';
import {
  demoDateFromTrainingDayId,
  demoTrainingDayIdDaysAgo,
} from '@sharpit/server/lib/demo/demo-calendar';
import { defaultJournalPrefs, type JournalPrefs } from '@sharpit/app/lib/journal/journal-prefs';
import type { JournalBuiltinTrackableId } from '@sharpit/app/lib/journal/journal-trackables';
import { JOURNAL_BUILTIN_TRACKABLE_IDS } from '@sharpit/app/lib/journal/journal-trackables';

export const DEMO_JOURNAL_DAYS = 14;

const DEMO_JOURNAL_ENABLED: ReadonlySet<JournalBuiltinTrackableId> = new Set([
  'metric_caffeine',
  'metric_mood',
  'metric_hydration',
  'late_meal',
  'device_in_bed',
  'creatine',
  'omega3',
  'multivitamin',
  'magnesium',
  'collagen',
  'protein_powder',
  'alcohol',
]);

export type DemoJournalDayHabits = {
  lateMeal: 'yes' | 'no';
  deviceInBed: 'yes' | 'no';
  roughNight: boolean;
};

export type DemoJournalNightOutcomes = {
  sleepMinutes: number;
  recoveryScore: number;
  bodyBattery: number;
  sleepScore: number;
  stress: number;
  moodLabel: string;
};

/** Intermittent night habits — enough contrast for Analyses unlock (≥7 days). */
export function demoJournalDayHabits(daysAgo: number): DemoJournalDayHabits {
  const lateMeal = daysAgo % 3 === 0 ? 'yes' : 'no';
  const deviceInBed = daysAgo % 4 === 1 || daysAgo % 4 === 2 ? 'yes' : 'no';
  return {
    lateMeal,
    deviceInBed,
    roughNight: lateMeal === 'yes' || deviceInBed === 'yes',
  };
}

/** Physiology mirrors the habit night — presentation analytics only. */
export function demoJournalNightOutcomes(
  daysAgo: number,
  roughNight: boolean,
): DemoJournalNightOutcomes {
  if (roughNight) {
    return {
      sleepMinutes: 360 + (daysAgo % 3) * 15,
      recoveryScore: 45 + (daysAgo % 3) * 5,
      bodyBattery: 42 + (daysAgo % 3) * 4,
      sleepScore: 62,
      stress: 38,
      moodLabel: 'Correct',
    };
  }
  return {
    sleepMinutes: 450 + (daysAgo % 4) * 12,
    recoveryScore: 70 + (daysAgo % 4) * 4,
    bodyBattery: 65 + (daysAgo % 4) * 5,
    sleepScore: 80,
    stress: 26,
    moodLabel: 'Bon',
  };
}

export function demoJournalFactors(
  lateMeal: 'yes' | 'no',
  deviceInBed: 'yes' | 'no',
): Record<string, 'yes' | 'no'> {
  return {
    creatine: 'yes',
    omega3: 'yes',
    multivitamin: 'yes',
    magnesium: 'yes',
    collagen: 'yes',
    protein_powder: 'yes',
    alcohol: 'no',
    sauna: 'no',
    tobacco: 'no',
    yoga: 'no',
    ice_bath: 'no',
    cold_shower: 'no',
    antibiotic: 'no',
    cbd: 'no',
    late_meal: lateMeal,
    device_in_bed: deviceInBed,
  };
}

/** Demo athlete tracks the stack that produces Analyses findings. */
export function demoJournalPrefs(): JournalPrefs {
  const prefs = defaultJournalPrefs();
  const enabled = { ...prefs.enabled };
  for (const id of JOURNAL_BUILTIN_TRACKABLE_IDS) {
    enabled[id] = DEMO_JOURNAL_ENABLED.has(id);
  }
  return { ...prefs, enabled };
}

export function demoJournalCaffeineMg(daysAgo: number): number {
  return 80 + (daysAgo % 3) * 10;
}

export function demoJournalHydrationMl(daysAgo: number): number {
  return 2200 + (daysAgo % 4) * 100;
}

async function upsertDemoJournalHealthDay(input: {
  prisma: PrismaClient;
  athleteId: string;
  date: Date;
  outcomes: ReturnType<typeof demoJournalNightOutcomes>;
  daysAgo: number;
}): Promise<void> {
  const { prisma, athleteId, date, outcomes, daysAgo } = input;
  const healthPatch = {
    sleepMinutes: outcomes.sleepMinutes,
    recoveryScore: outcomes.recoveryScore,
    bodyBattery: outcomes.bodyBattery,
    sleepScore: outcomes.sleepScore,
    stress: outcomes.stress,
    totalSteps: 8500 + daysAgo * 250,
  };

  const createFields = {
    hrv: 75 + (daysAgo % 4) * 4,
    restingHr: 44 - (daysAgo % 3),
    weightKg: 79.6,
    calories: 3200 + (daysAgo % 5) * 100,
    mood: outcomes.moodLabel,
    ...healthPatch,
  };

  await prisma.dailyHealth.upsert({
    where: { athleteId_date: { athleteId, date } },
    create: { athleteId, date, ...createFields },
    update: { mood: outcomes.moodLabel, ...healthPatch },
  });
}

async function seedOneDemoJournalDay(input: {
  prisma: PrismaClient;
  athleteId: string;
  daysAgo: number;
}): Promise<void> {
  const { prisma, athleteId, daysAgo } = input;
  const trainingDayId = demoTrainingDayIdDaysAgo(daysAgo);
  const date = demoDateFromTrainingDayId(trainingDayId);
  const { lateMeal, deviceInBed, roughNight } = demoJournalDayHabits(daysAgo);
  const outcomes = demoJournalNightOutcomes(daysAgo, roughNight);

  await prisma.athleteDayJournal.create({
    data: {
      athleteId,
      trainingDayId,
      factors: demoJournalFactors(lateMeal, deviceInBed),
      moodLabel: outcomes.moodLabel,
      hydrationMl: demoJournalHydrationMl(daysAgo),
      caffeineMg: demoJournalCaffeineMg(daysAgo),
    },
  });

  await upsertDemoJournalHealthDay({ prisma, athleteId, date, outcomes, daysAgo });
}

/**
 * Prefs + 14 journal days + aligned DailyHealth sleep/recovery/BB.
 * Call after the base recovery trend so rows exist to patch (or create).
 */
export async function seedDemoJournalAnalyses(
  prisma: PrismaClient,
  athleteId: string,
  _today: Date,
): Promise<void> {
  await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: {
      tier: AccessTier.PRO,
      journalPrefs: demoJournalPrefs(),
    },
  });

  await seedDemoJournalDays(prisma, athleteId);
}

/** The 14 journal days and their nights alone, leaving the profile's tier and prefs as they are. */
export async function seedDemoJournalDays(prisma: PrismaClient, athleteId: string): Promise<void> {
  await prisma.athleteDayJournal.deleteMany({ where: { athleteId } });

  for (let daysAgo = DEMO_JOURNAL_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
    await seedOneDemoJournalDay({ prisma, athleteId, daysAgo });
  }
}
