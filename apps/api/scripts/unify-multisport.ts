/**
 * Unifies past multisport races: Strava / Apple Health legs become one triathlon (or are
 * absorbed into Garmin's), titled after the race goal and linked to it. A race goal whose day has
 * come with an activity linked, never marked reached, is marked reached. Dry-run by default.
 *
 * Usage :
 *   yarn db:unify:multisport --athlete <id> [--days 90]     # dry-run, one athlete
 *   yarn db:unify:multisport --all [--days 90]              # dry-run, every athlete
 *   yarn db:unify:multisport --athlete <id> --apply         # writes (needs --athlete or --all)
 */
import { ActivityType, GoalKind } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import { raceDayKey } from '@sharpit/app/lib/goals/race-moment';
import {
  unifyMultisportDay,
  type MultisportDayPlan,
} from '@sharpit/server/lib/activity/multisport/unify-multisport';
import { withRaceStanding } from '@sharpit/server/lib/goals/goal-achievements';

const DAY_MS = 24 * 60 * 60 * 1000;
const FLAGS_WITH_VALUE = new Set(['--athlete', '--days']);
const BOOLEAN_FLAGS = new Set(['--apply', '--all']);

type Options = { apply: boolean; all: boolean; athlete: string | null; days: number };

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (BOOLEAN_FLAGS.has(arg)) {
      flags.add(arg);
    } else if (FLAGS_WITH_VALUE.has(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} attend une valeur`);
      }
      values.set(arg, value);
      i += 1;
    } else {
      throw new Error(`Option inconnue : ${arg}`);
    }
  }
  const days = Number(values.get('--days') ?? 90);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('--days doit être un entier positif');
  }
  const options = {
    apply: flags.has('--apply'),
    all: flags.has('--all'),
    athlete: values.get('--athlete') ?? null,
    days,
  };
  if (options.all && options.athlete) {
    throw new Error('--all et --athlete sont exclusifs');
  }
  if (options.apply && !options.all && !options.athlete) {
    throw new Error('--apply exige --athlete <id> ou --all');
  }
  return options;
}

/** Host only — never the credentials of the connection string. */
function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').host || '(inconnu)';
  } catch {
    return '(DATABASE_URL illisible)';
  }
}

/** Days that can hold a race: a swim or a triathlon was recorded, or a race goal falls on it. */
async function candidateDays(athleteId: string, since: Date): Promise<string[]> {
  const [activities, goals] = await Promise.all([
    prisma.activity.findMany({
      where: {
        athleteId,
        mergedIntoId: null,
        date: { gte: since },
        type: { in: [ActivityType.SWIM, ActivityType.TRIATHLON] },
      },
      select: { date: true },
    }),
    prisma.goal.findMany({
      where: { athleteId, kind: GoalKind.RACE, targetDate: { gte: since, lte: new Date() } },
      select: { targetDate: true },
    }),
  ]);
  const keys = [
    ...activities.map((row) => dayKeyFromDate(row.date)),
    ...goals.flatMap((goal) => (goal.targetDate ? [raceDayKey(goal.targetDate)] : [])),
  ];
  return [...new Set(keys)].sort();
}

type Totals = { days: number; create: number; hide: number; link: number; achieve: number };

/** Races already run (day come, activity linked) still waiting to be marked reached. */
async function runRacesToAchieve(athleteId: string) {
  const goals = await prisma.goal.findMany({
    where: { athleteId, kind: GoalKind.RACE, achieved: false },
  });
  return (await withRaceStanding(athleteId, goals)).filter((goal) => goal.status === 'done');
}

async function achieveRunRaces(athleteId: string, apply: boolean, totals: Totals): Promise<void> {
  for (const goal of await runRacesToAchieve(athleteId)) {
    totals.achieve += 1;
    console.log(`  achieve goal "${goal.title}" (${goal.id}) · result ${goal.result?.activityId}`);
    if (apply) {
      await prisma.goal.update({ where: { id: goal.id }, data: { achieved: true } });
    }
  }
}

function describe(dayKey: string, plan: MultisportDayPlan): string {
  const target =
    plan.target.kind === 'create'
      ? `create TRIATHLON "${plan.target.data.title}"`
      : `update ${plan.target.id}`;
  return [
    `  ${dayKey}: ${target}`,
    plan.absorbIds.length > 0 ? `hide [${plan.absorbIds.join(', ')}]` : null,
    Object.keys(plan.update).length > 0 ? `set ${JSON.stringify(plan.update)}` : null,
    plan.goal ? `link goal "${plan.goal.title}" (${plan.goal.id})` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function count(totals: Totals, plan: MultisportDayPlan): void {
  totals.days += 1;
  totals.create += plan.target.kind === 'create' ? 1 : 0;
  totals.hide += plan.absorbIds.length;
  totals.link += plan.goal ? 1 : 0;
}

async function planAll(athleteIds: string[], since: Date, apply: boolean): Promise<Totals> {
  const totals: Totals = { days: 0, create: 0, hide: 0, link: 0, achieve: 0 };
  for (const athleteId of athleteIds) {
    console.log(`Athlete ${athleteId}`);
    for (const dayKey of await candidateDays(athleteId, since)) {
      const plan = await unifyMultisportDay(athleteId, dayKey, { apply });
      if (plan) {
        count(totals, plan);
        console.log(describe(dayKey, plan));
      }
    }
    await achieveRunRaces(athleteId, apply, totals);
  }
  return totals;
}

function summary(totals: Totals): string {
  return `${totals.days} journée(s) · ${totals.create} triathlon(s) à créer · ${totals.hide} ligne(s) à masquer · ${totals.link} lien(s) objectif · ${totals.achieve} course(s) à marquer atteinte(s)`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - options.days * DAY_MS);
  const athleteIds = options.athlete
    ? [options.athlete]
    : (await prisma.athleteProfile.findMany({ select: { id: true } })).map((row) => row.id);

  console.log(`Base : ${databaseHost()} · ${athleteIds.length} athlète(s) · ${options.days} jours`);
  // Always plan first: the counts are printed before anything is written.
  const planned = await planAll(athleteIds, since, false);
  console.log(`Plan : ${summary(planned)}`);
  if (!options.apply) {
    console.log('Dry-run : rien n’a été écrit (ajoute --apply).');
    return;
  }
  const applied = await planAll(athleteIds, since, true);
  console.log(`Terminé : ${summary(applied)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
