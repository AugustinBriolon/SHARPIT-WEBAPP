import { ActivityType, GoalHorizon, PrismaClient } from '@prisma/client';
import { addDays, startOfDay, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  await prisma.strengthSet.deleteMany();
  await prisma.runMetrics.deleteMany();
  await prisma.bikeMetrics.deleteMany();
  await prisma.swimMetrics.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.dailyHealth.deleteMany();
  await prisma.goal.deleteMany();

  const today = startOfDay(new Date());

  const athlete = await prisma.athleteProfile.findFirstOrThrow();
  const athleteId = athlete.id;

  await prisma.goal.create({
    data: {
      athleteId,
      title: 'Ironman < 10h',
      horizon: GoalHorizon.LONG_TERM,
      metricKey: 'ironman_time',
      currentValue: null,
      targetValue: 36000,
      unit: 'seconds',
      targetDate: addDays(today, 94),
    },
  });

  await prisma.dailyHealth.create({
    data: {
      athleteId,
      date: today,
      sleepMinutes: 494,
      hrv: 89,
      restingHr: 42,
      weightKg: 79.6,
      calories: 3400,
      recoveryScore: 87,
      stress: 3,
      mood: 'Bien',
    },
  });

  await prisma.activity.create({
    data: {
      athleteId,
      type: ActivityType.BIKE,
      date: today,
      title: 'Bike Z2',
      duration: 90 * 60,
      rpe: 5,
      feeling: 'Fluide',
      load: 72,
      bikeMetrics: {
        create: {
          ftpPercent: 65,
          normalizedPower: 198,
          intensityFactor: 0.65,
          tss: 72,
          avgCadence: 88,
          avgPower: 185,
          elevationM: 320,
          calories: 980,
          bikeName: 'Canyon',
        },
      },
    },
  });

  await prisma.activity.create({
    data: {
      athleteId,
      type: ActivityType.RUN,
      date: subDays(today, 1),
      title: 'Sortie endurance',
      duration: 55 * 60,
      rpe: 6,
      feeling: 'Solide',
      load: 58,
      runMetrics: {
        create: {
          distanceM: 10500,
          elevationM: 85,
          paceSecPerKm: 314,
          avgHr: 142,
          cadence: 176,
          shoes: 'Nike Vaporfly',
        },
      },
    },
  });

  await prisma.activity.create({
    data: {
      athleteId,
      type: ActivityType.SWIM,
      date: subDays(today, 2),
      title: 'CSS intervals',
      duration: 45 * 60,
      rpe: 7,
      load: 45,
      swimMetrics: {
        create: {
          distanceM: 2200,
          sets: 12,
          cssSecPer100m: 98,
          avgPaceSecPer100m: 102,
          swolf: 42,
          drills: 'Catch-up, sculling',
        },
      },
    },
  });

  await prisma.activity.create({
    data: {
      athleteId,
      type: ActivityType.STRENGTH,
      date: subDays(today, 3),
      title: 'Force bas du corps',
      duration: 50 * 60,
      rpe: 7,
      load: 35,
      strengthSets: {
        create: [
          { exercise: 'Squat', sets: 4, reps: 6, weightKg: 120, rpe: 8, restSec: 180, order: 0 },
          {
            exercise: 'Romanian Deadlift',
            sets: 3,
            reps: 8,
            weightKg: 100,
            rpe: 7,
            restSec: 120,
            order: 1,
          },
          {
            exercise: 'Bulgarian Split Squat',
            sets: 3,
            reps: 10,
            weightKg: 24,
            rpe: 7,
            restSec: 90,
            order: 2,
          },
        ],
      },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
