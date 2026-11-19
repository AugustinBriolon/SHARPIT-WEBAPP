/**
 * Dev-only stress data for the local bypass athlete (`dev-athlete`): the realistic worst case
 * for every value the apps render, so layouts are tested against unkind data.
 *
 *   yarn db:seed:worst            worst case (default)
 *   yarn db:seed:worst empty      a consented athlete with no data at all
 *   yarn db:seed:worst one        exactly one of everything
 *
 * `yarn db:seed` restores the small demo dataset. Refuses any database that is not local.
 */
import { ActivityType, GoalKind, GoalPriority, PrismaClient } from '@prisma/client';
import { createScriptPrismaClient } from '@sharpit/db/adapter';
import {
  demoDateFromTrainingDayId,
  demoTrainingDayIdDaysAgo,
} from '@sharpit/server/lib/demo/demo-calendar';
import {
  finalizeDemoSeed,
  purgeDemoDerivedState,
} from '@sharpit/server/lib/demo/finalize-demo-seed';
import { recomputeFoodLogDay } from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import { CURRENT_PRIVACY_VERSION } from '@sharpit/app/lib/privacy/constants';
import { addDays, subDays } from 'date-fns';

const ATHLETE_ID = 'dev-athlete';
const LOCAL_DATABASE = /@(localhost|127\.0\.0\.1):5432\/sharpit/;

type Mode = 'worst' | 'empty' | 'one';

const LONG_RACE =
  "Ironman 70.3 Les Sables d'Olonne-Vendée — Championnat d'Europe Middle Distance 2027";
const LONG_PLACE = 'Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson, Marne, Grand Est, France';
const LONG_NOTE =
  'Sortie longue avec Aleksandra Wiśniewska-Kowalczyk et Konstantin Oberhauser-Wettstein. ' +
  'Départ 5 h 40, vent de face sur les 60 premiers kilomètres, crevaison au km 84, ravitaillement raté. '.repeat(
    18,
  );

/** One title per failure: long, compound, tiny, missing, emoji-first, markup, newline, duplicate. */
const ACTIVITY_TITLES: (string | null)[] = [
  'Sortie longue vélo — Col de la Croix de Fer, Glandon et Madeleine par la vallée de la Maurienne',
  'Geschwindigkeitsausdauertraining',
  'J',
  null,
  '🦊 Footing',
  '<b>Seuil</b> &amp; **VO2max**',
  'Natation\ntechnique',
  'Footing',
  'Footing',
  '   ',
  'Đặng Thị Ngọc Hân — séance club',
  'Renforcement musculaire du haut du corps et gainage',
];

const ACTIVITY_TYPES = [
  ActivityType.BIKE,
  ActivityType.RUN,
  ActivityType.SWIM,
  ActivityType.STRENGTH,
  ActivityType.RUN,
  ActivityType.HIKE,
  ActivityType.OTHER,
  ActivityType.TRIATHLON,
];

async function purge(prisma: PrismaClient): Promise<void> {
  const where = { athleteId: ATHLETE_ID };
  await prisma.plannedSession.deleteMany({ where });
  await prisma.performanceRecord.deleteMany({ where });
  await prisma.activity.deleteMany({ where });
  await prisma.dailyHealth.deleteMany({ where });
  await prisma.foodLogEntry.deleteMany({ where });
  await prisma.goal.deleteMany({ where });
  await prisma.bodyCompositionMeasurement.deleteMany({ where });
  await prisma.condition.deleteMany({ where });
  await prisma.conversation.deleteMany({ where });
  await prisma.athleteDayJournal.deleteMany({ where });
  await prisma.dailyBriefing.deleteMany({ where });
  await prisma.weeklyReview.deleteMany({ where });
  // Snapshots, twin and observations are computed from the rows above: an empty athlete must read empty.
  await purgeDemoDerivedState(prisma, ATHLETE_ID);
}

/** Past the consent wall and the wizard; AI consent stays off so nothing calls a model. */
async function upsertAthlete(prisma: PrismaClient): Promise<void> {
  const now = new Date();
  const fields = {
    tier: 'PRO' as const,
    onboardingCompletedAt: now,
    termsAcceptedAt: now,
    privacyAcceptedAt: now,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    healthDataConsentAt: now,
    heightCm: 203,
    birthDate: new Date('1958-03-01'),
    ftpW: 412,
    maxHr: 201,
    lthr: 184,
    runThresholdPaceSecPerKm: 178,
    swimCssSecPer100m: 71,
    context: LONG_NOTE,
  };
  await prisma.athleteProfile.upsert({
    where: { id: ATHLETE_ID },
    create: { id: ATHLETE_ID, clerkUserId: 'dev-bypass-user', ...fields },
    update: fields,
  });
}

async function seedGoals(prisma: PrismaClient, today: Date, mode: Mode): Promise<void> {
  const goals = [
    {
      title: LONG_RACE,
      kind: GoalKind.RACE,
      priority: GoalPriority.A,
      raceFormat: 'Ironman 70.3',
      targetPerformance: 'Sub 4 h 29 min 59 s — podium groupe d’âge 65-69',
      targetDate: addDays(today, 1),
      location: LONG_PLACE,
      notes: LONG_NOTE,
      lowerIsBetter: true,
    },
    { title: 'J', kind: GoalKind.RACE, priority: GoalPriority.C, targetDate: addDays(today, 1284) },
    {
      title: 'Marathon de Paris',
      kind: GoalKind.RACE,
      priority: GoalPriority.B,
      targetDate: subDays(today, 400),
    },
    {
      title: 'Poids',
      kind: GoalKind.METRIC,
      metricKey: 'weightKg',
      startValue: 142.5,
      currentValue: 143.1,
      targetValue: 78,
      unit: 'kg',
      lowerIsBetter: true,
    },
    {
      title: 'Dormir avant 22 h 30 tous les soirs de semaine, y compris en déplacement',
      kind: GoalKind.HABIT,
    },
    { title: 'Objectif sans date ni lieu', kind: GoalKind.RACE },
  ];
  for (const goal of mode === 'one' ? goals.slice(0, 1) : goals) {
    await prisma.goal.create({ data: { athleteId: ATHLETE_ID, ...goal } });
  }
}

async function seedActivities(prisma: PrismaClient, today: Date, mode: Mode): Promise<void> {
  if (mode === 'one') {
    await prisma.activity.create({
      data: {
        athleteId: ATHLETE_ID,
        type: ActivityType.RUN,
        date: subDays(today, 1),
        duration: 60,
        title: 'J',
      },
    });
    return;
  }
  // The visible head of every list: one failure per row, extremes on duration and load.
  const extremes = [
    { duration: 14 * 3600 + 59 * 60 + 59, load: 1284.4, rpe: 10 },
    { duration: 45, load: 0, rpe: 1 },
    { duration: null, load: null, rpe: null },
    { duration: 3600, load: 0.30000000000000004, rpe: 5 },
  ];
  for (const [index, title] of ACTIVITY_TITLES.entries()) {
    const type = ACTIVITY_TYPES[index % ACTIVITY_TYPES.length]!;
    const extreme = extremes[index % extremes.length]!;
    await prisma.activity.create({
      data: {
        athleteId: ATHLETE_ID,
        type,
        // Four on the same day (a brick and more), then one a day; one just before midnight.
        date: index < 4 ? subDays(today, 1) : subDays(today, index - 2),
        title,
        ...extreme,
        feeling:
          index % 3 === 0 ? 'Épuisé mais satisfait, jambes lourdes dès le premier col' : null,
        notes: index === 0 ? LONG_NOTE : null,
        weather:
          index === 0 ? 'Orage violent, 38 °C ressenti 44 °C, vent 70 km/h rafales 110' : null,
        observedLocationLabel: index % 2 === 0 ? LONG_PLACE : null,
        ...(type === ActivityType.RUN
          ? {
              runMetrics: {
                create: {
                  distanceM: index === 1 ? 0 : 128_400,
                  elevationM: 9_840,
                  paceSecPerKm: 1284,
                  avgHr: 201,
                },
              },
            }
          : {}),
      },
    });
  }
  // The realistic upper bound of an unpaginated history: three years, several a week.
  const history = Array.from({ length: 1_000 }, (_, index) => ({
    athleteId: ATHLETE_ID,
    type: ACTIVITY_TYPES[index % ACTIVITY_TYPES.length]!,
    date: subDays(today, 12 + index),
    title: ACTIVITY_TITLES[index % ACTIVITY_TITLES.length] ?? null,
    duration: 1_800 + (index % 7) * 1_300,
    load: (index % 11) * 23.7,
    rpe: 1 + (index % 10),
  }));
  await prisma.activity.createMany({ data: history });
}

async function seedHealth(prisma: PrismaClient, mode: Mode): Promise<void> {
  const days = mode === 'one' ? 1 : 60;
  for (let daysAgo = 0; daysAgo < days; daysAgo++) {
    const date = demoDateFromTrainingDayId(demoTrainingDayIdDaysAgo(daysAgo));
    // API bounds (health-samples handler): hrv 1–500, restingHr 20–250, steps ≤ 200 000, weight 20–400.
    const shapes = [
      {
        sleepMinutes: 1_440,
        hrv: 500,
        restingHr: 20,
        recoveryScore: 100,
        totalSteps: 200_000,
        weightKg: 399.9,
        calories: 20_000,
        stress: 100,
        bodyBattery: 100,
        sleepScore: 100,
      },
      {
        sleepMinutes: 0,
        hrv: 1,
        restingHr: 250,
        recoveryScore: 0,
        totalSteps: 0,
        weightKg: 20,
        calories: 0,
        stress: 0,
        bodyBattery: 0,
        sleepScore: 0,
      },
      // Partial: a night without stages, a day without recovery.
      {
        sleepMinutes: 431,
        hrv: null,
        restingHr: null,
        recoveryScore: null,
        totalSteps: 1,
        weightKg: null,
      },
      {},
      {
        sleepMinutes: 61,
        sleepDeepMin: 1,
        sleepLightMin: 59,
        sleepRemMin: 0,
        sleepAwakeMin: 1,
        sleepBedtimeMin: 1_439,
        sleepWakeMin: 60,
        hrv: 142,
        restingHr: 31,
        recoveryScore: 1,
        mood: 'Très fatigué, irritable, mal dormi à cause du décalage horaire',
      },
    ];
    const fields = shapes[daysAgo % shapes.length]!;
    await prisma.dailyHealth.create({ data: { athleteId: ATHLETE_ID, date, ...fields } });
  }
}

async function seedPlan(prisma: PrismaClient, today: Date, mode: Mode): Promise<void> {
  const count = mode === 'one' ? 1 : 12;
  for (let index = 0; index < count; index++) {
    await prisma.plannedSession.create({
      data: {
        athleteId: ATHLETE_ID,
        type: ACTIVITY_TYPES[index % ACTIVITY_TYPES.length]!,
        // Twelve sessions on one day, the first two at the day's two ends.
        date: demoDateFromTrainingDayId(demoTrainingDayIdDaysAgo(0)),
        startTime: ['23:59', '00:00'][index] ?? null,
        title: ACTIVITY_TITLES[index % ACTIVITY_TITLES.length] ?? null,
        description: index === 0 ? LONG_NOTE : null,
        durationMin: [899, 1, null, 60][index % 4] ?? null,
        load: [1284.4, 0, null, 55][index % 4] ?? null,
        isKey: index % 2 === 0,
        locationLabel: index % 3 === 0 ? LONG_PLACE : null,
      },
    });
  }
}

async function seedNutrition(prisma: PrismaClient, mode: Mode): Promise<void> {
  const date = demoDateFromTrainingDayId(demoTrainingDayIdDaysAgo(0));
  const foods = [
    {
      name: 'Préparation pour gâteau de riz au lait de coco, mangue et fruit de la passion, sans gluten, enrichie en protéines',
      brand: 'Les Délices de la Vallée de Chevreuse — Sélection Bio',
    },
    { name: 'Œuf', brand: null },
    { name: 'Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz', brand: 'A' },
    { name: 'Banane', brand: null },
  ];
  const count = mode === 'one' ? 1 : 40;
  await prisma.foodLogEntry.createMany({
    data: Array.from({ length: count }, (_, index) => {
      const food = foods[index % foods.length]!;
      return {
        athleteId: ATHLETE_ID,
        date,
        meal: 'DINNER' as const,
        ...food,
        grams: [1284.5, 0.1, 100, 1][index % 4]!,
        kcal: [12_345.6, 0, 89, 1][index % 4]!,
        protein: [612.3, 0, 1.1, 0.04][index % 4]!,
        carbs: [1_840.2, 0, 22.8, 0.2][index % 4]!,
        fat: [402.9, 0, 0.3, 0][index % 4]!,
      };
    }),
  });
  // The day's totals are computed on the write path, which rows inserted here skip.
  await recomputeFoodLogDay(ATHLETE_ID, demoTrainingDayIdDaysAgo(0));
}

async function seedBodyAndHealthNotes(
  prisma: PrismaClient,
  today: Date,
  mode: Mode,
): Promise<void> {
  await prisma.bodyCompositionMeasurement.create({
    data: {
      athleteId: ATHLETE_ID,
      source: 'RENPHO',
      externalId: 'worst-body-0',
      measuredAt: today,
      weightKg: 399.9,
      bodyFatPct: 61.4,
      musclePct: 12.3,
      bmi: 97.1,
    },
  });
  if (mode === 'one') {
    return;
  }
  const regions = [
    'Tendon d’Achille',
    'Articulation sacro-iliaque',
    'Genou',
    'Épaule',
    'Lombaires',
    'Cheville',
  ];
  for (const [index, bodyRegion] of regions.entries()) {
    await prisma.condition.create({
      data: {
        athleteId: ATHLETE_ID,
        scope: 'LOCALIZED',
        type: 'PAIN',
        bodyRegion,
        side: index % 2 === 0 ? 'LEFT' : 'BILATERAL',
        label:
          index === 0
            ? 'Tendinopathie d’insertion du tendon d’Achille gauche avec bursite rétro-calcanéenne récidivante'
            : `Douleur ${bodyRegion.toLowerCase()}`,
        status: (['ACTIVE', 'WORSENING', 'RECURRENT', 'IMPROVING', 'NEW', 'STABLE'] as const)[
          index
        ]!,
        severity: index === 0 ? 1 : 0,
        affectsTraining: true,
        startedAt: subDays(today, index === 0 ? 1_284 : 0),
        recurrenceCount: index === 0 ? 37 : 1,
      },
    });
  }
}

async function seedCoachAndTexts(prisma: PrismaClient, today: Date): Promise<void> {
  const turn = (id: string, role: 'user' | 'assistant', text: string) => ({
    id,
    role,
    parts: [{ type: 'text', text }],
  });
  await prisma.conversation.create({
    data: {
      athleteId: ATHLETE_ID,
      title: `Préparation ${LONG_RACE} : reprise après blessure, nutrition de course et stratégie d'allure`,
      messages: [
        turn('worst-1', 'user', 'ok'),
        turn(
          'worst-2',
          'assistant',
          `## Plan\n\n| Semaine | Charge | Séance clé |\n| --- | --- | --- |\n| 1 | 1 284 | ${ACTIVITY_TITLES[0]} |\n\n**Lien** : https://example.com/plans/ironman-70-3/semaine-12/seances/9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f?onglet=commentaires&filtre=non-resolus\n\n${LONG_NOTE}`,
        ),
        turn('worst-3', 'user', LONG_NOTE),
      ],
    },
  });
  await prisma.dailyBriefing.create({
    data: {
      athleteId: ATHLETE_ID,
      date: demoDateFromTrainingDayId(demoTrainingDayIdDaysAgo(0)),
      content: LONG_NOTE,
      readiness: 0,
    },
  });
  await prisma.performanceRecord.createMany({
    data: [
      {
        group: 'run',
        category: 'distance',
        label: 'Plus longue sortie — ultra-trail en autonomie complète',
        rank: 1,
        value: 128_400,
        displayValue: '128,40 km',
        sublabel: LONG_PLACE,
        activityDate: subDays(today, 1_000),
        activityTitle: ACTIVITY_TITLES[0],
      },
      {
        group: 'run',
        category: 'pace',
        label: '1 km',
        rank: 1,
        value: 178,
        displayValue: '2:58',
        activityDate: today,
      },
      {
        group: 'bike',
        category: 'power',
        label: 'FTP',
        rank: 1,
        value: 0,
        displayValue: '0 W',
        activityDate: today,
      },
    ].map((record) => ({ athleteId: ATHLETE_ID, ...record })),
  });
}

async function main(): Promise<void> {
  if (!LOCAL_DATABASE.test(process.env.DATABASE_URL ?? '')) {
    throw new Error(
      'seed-worst-case only runs against the local Docker database (localhost:5432/sharpit).',
    );
  }
  const mode = (process.argv[2] ?? 'worst') as Mode;
  if (!['worst', 'empty', 'one'].includes(mode)) {
    throw new Error(`Unknown mode "${mode}" — use worst, empty or one.`);
  }
  const prisma = createScriptPrismaClient();
  try {
    const today = new Date(`${demoTrainingDayIdDaysAgo(0)}T07:00:00.000Z`);
    await upsertAthlete(prisma);
    await purge(prisma);
    if (mode !== 'empty') {
      await seedGoals(prisma, today, mode);
      await seedActivities(prisma, today, mode);
      await seedHealth(prisma, mode);
      await seedPlan(prisma, today, mode);
      await seedNutrition(prisma, mode);
      await seedBodyAndHealthNotes(prisma, today, mode);
      if (mode === 'worst') {
        await seedCoachAndTexts(prisma, today);
      }
      await finalizeDemoSeed(prisma, ATHLETE_ID);
    }
    console.info(`Seeded "${mode}" dataset for ${ATHLETE_ID}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
