/**
 * Fills the structured race fields (ADR-082) of race goals made before them, best-effort from
 * their free text: triathlon formats (S/M/L/XXL) and road distances (5 km … marathon), the
 * target when it parses and sits within the format's bounds. The free text itself is kept.
 * Goals already structured or not recognised are left alone. Dry-run by default.
 *
 * Usage :
 *   yarn db:backfill:structured-goals --athlete <id>           # dry-run, one athlete
 *   yarn db:backfill:structured-goals --all                    # dry-run, every athlete
 *   yarn db:backfill:structured-goals --athlete <id> --apply   # writes (needs --athlete or --all)
 */
import { GoalKind, type Goal } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { structuredRaceFromText } from '@sharpit/app/lib/goals/goal-race-projection';
import { raceTargetBounds, resolveStructuredRace } from '@sharpit/app/lib/goals/race-formats';

type Options = { apply: boolean; all: boolean; athlete: string | null };

function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false, all: false, athlete: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--athlete') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--athlete attend une valeur');
      }
      options.athlete = value;
      i += 1;
    } else {
      throw new Error(`Option inconnue : ${arg}`);
    }
  }
  if (options.all === Boolean(options.athlete)) {
    throw new Error('Choisis --athlete <id> ou --all');
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

/** The structured columns to write for this goal, or null when its text says nothing usable. */
function structuredColumns(goal: Goal) {
  const read = structuredRaceFromText(goal);
  const race = read && resolveStructuredRace(read);
  if (!read || !race) {
    return null;
  }
  const { minSec, maxSec } = raceTargetBounds(race);
  const target = read.targetSeconds;
  return {
    discipline: race.discipline,
    formatKey: race.formatKey,
    swimM: race.swimM ?? null,
    bikeM: race.bikeM ?? null,
    runM: race.runM ?? null,
    run2M: race.run2M ?? null,
    segments: race.segments ?? null,
    targetSeconds: target !== null && target >= minSec && target <= maxSec ? target : null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const goals = await prisma.goal.findMany({
    where: {
      kind: GoalKind.RACE,
      discipline: null,
      ...(options.athlete ? { athleteId: options.athlete } : {}),
    },
    orderBy: [{ athleteId: 'asc' }, { targetDate: 'asc' }],
  });
  console.log(`Base : ${databaseHost()} · ${goals.length} course(s) non structurée(s)`);

  let mapped = 0;
  for (const goal of goals) {
    const columns = structuredColumns(goal);
    const text = `"${goal.title}" · format "${goal.raceFormat ?? ''}" · cible "${goal.targetPerformance ?? ''}"`;
    if (!columns) {
      console.log(`  skip ${goal.id} ${text}`);
      continue;
    }
    mapped += 1;
    console.log(`  map  ${goal.id} ${text} → ${JSON.stringify(columns)}`);
    if (options.apply) {
      await prisma.goal.update({ where: { id: goal.id }, data: columns });
    }
  }
  console.log(
    `${mapped} / ${goals.length} course(s) ${options.apply ? 'mises à jour' : 'à mettre à jour'}`,
  );
  if (!options.apply) {
    console.log('Dry-run : rien n’a été écrit (ajoute --apply).');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
