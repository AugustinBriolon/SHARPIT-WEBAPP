/**
 * Dev seed: last N days of AthleteDayJournal + DailyHealth matching the demo habit profile.
 * Usage: yarn tsx scripts/seed-journal-analysis-preview.ts [athleteId]
 *
 * Same profile as public demo (`demo-journal-seed.ts`):
 * - Daily yes: creatine, omega3, multivitamin, magnesium, collagen, protein_powder
 * - Never: alcohol (+ other lifestyle extras left as no)
 * - Sometimes: late_meal, device_in_bed
 * - Caffeine: ~2 small cups (~80–100 mg)
 */
import { PrismaClient } from '@prisma/client';
import {
  DEMO_JOURNAL_DAYS,
  demoJournalCaffeineMg,
  demoJournalDayHabits,
  demoJournalFactors,
  demoJournalHydrationMl,
  demoJournalNightOutcomes,
} from '@sharpit/server/lib/demo/demo-journal-seed';

const prisma = new PrismaClient();

function dayIdOffset(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function utcDateFromDayId(dayId: string): Date {
  const [y, m, day] = dayId.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!));
}

async function resolveProfile() {
  const [, , argId] = process.argv;
  const byArg = argId ? await prisma.athleteProfile.findUnique({ where: { id: argId } }) : null;
  return byArg ?? (await prisma.athleteProfile.findFirst({ orderBy: { updatedAt: 'desc' } }));
}

async function seedJournalDay(athleteId: string, ago: number) {
  const trainingDayId = dayIdOffset(ago);
  const date = utcDateFromDayId(trainingDayId);
  const { lateMeal, deviceInBed, roughNight } = demoJournalDayHabits(ago);
  const { moodLabel, ...health } = demoJournalNightOutcomes(ago, roughNight);
  const caffeineMg = demoJournalCaffeineMg(ago);
  const hydrationMl = demoJournalHydrationMl(ago);

  const journal = {
    factors: demoJournalFactors(lateMeal, deviceInBed),
    moodLabel,
    hydrationMl,
    caffeineMg,
  };
  await prisma.athleteDayJournal.upsert({
    where: { athleteId_trainingDayId: { athleteId, trainingDayId } },
    create: { athleteId, trainingDayId, ...journal },
    update: journal,
  });

  const daily = { ...health, totalSteps: 8500 + ago * 250 };
  await prisma.dailyHealth.upsert({
    where: { athleteId_date: { athleteId, date } },
    create: { athleteId, date, ...daily },
    update: daily,
  });

  console.log(
    `  ${trainingDayId} · caféine=${caffeineMg}mg · late_meal=${lateMeal} · écran=${deviceInBed} · sleep=${health.sleepMinutes}`,
  );
}

async function main() {
  const profile = await resolveProfile();
  if (!profile) {
    console.error('Aucun AthleteProfile trouvé.');
    process.exit(1);
  }

  console.log(`Seed journal (profil réel) → athlete ${profile.id}`);
  for (let ago = DEMO_JOURNAL_DAYS - 1; ago >= 0; ago -= 1) {
    await seedJournalDay(profile.id, ago);
  }
  console.log(
    `\nOK — ${DEMO_JOURNAL_DAYS} jours (même profil que la démo). Recharge /journal/analyses`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
