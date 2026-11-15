import { prisma } from '@sharpit/db/client';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

/** One logged block of sets, with the day it was done. */
export type StrengthSetRow = {
  exercise: string;
  exerciseCatalogId: string | null;
  sets: number;
  reps: number;
  weightKg: number | null;
  durationSec: number | null;
  notes: string | null;
  date: Date;
};

/** What the athlete last did on an exercise, and their best — the next session's defaults. */
export type StrengthExerciseHistory = {
  name: string;
  catalogId: string | null;
  note: string | null;
  sessions: number;
  last: {
    date: string;
    sets: number;
    reps: number;
    weightKg: number | null;
    durationSec: number | null;
  };
  best: { weightKg: number | null; reps: number | null; durationSec: number | null };
};

/** « Développé couché » and « developpe  couche » are one exercise. */
export function exerciseKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Groups the logged sets by exercise, most recently done first. The name shown is the one last
 * written; the best load keeps the repetitions it was lifted for.
 */
export function summarizeExerciseHistory(rows: StrengthSetRow[]): StrengthExerciseHistory[] {
  const sorted = [...rows].sort((a, b) => b.date.getTime() - a.date.getTime());
  const byKey = new Map<string, StrengthExerciseHistory & { days: Set<string> }>();

  for (const row of sorted) {
    const key = exerciseKey(row.exercise);
    if (!key) {
      continue;
    }
    const day = row.date.toISOString().slice(0, 10);
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        name: row.exercise.trim(),
        catalogId: row.exerciseCatalogId,
        note: null,
        sessions: 0,
        last: {
          date: day,
          sets: row.sets,
          reps: row.reps,
          weightKg: row.weightKg,
          durationSec: row.durationSec,
        },
        best: { weightKg: null, reps: null, durationSec: null },
        days: new Set(),
      };
      byKey.set(key, entry);
    }
    entry.days.add(day);
    entry.catalogId ??= row.exerciseCatalogId;
    entry.note ??= row.notes?.trim() || null;
    if (row.weightKg !== null && row.weightKg > 0 && row.weightKg > (entry.best.weightKg ?? 0)) {
      entry.best.weightKg = row.weightKg;
      entry.best.reps = row.reps;
    }
    if (
      row.durationSec !== null &&
      row.durationSec > 0 &&
      row.durationSec > (entry.best.durationSec ?? 0)
    ) {
      entry.best.durationSec = row.durationSec;
    }
  }

  return [...byKey.values()].map(({ days, ...entry }) => ({ ...entry, sessions: days.size }));
}

/** Every exercise the athlete has logged, with its last and best figures. */
export async function loadExerciseHistory(athleteId: string): Promise<StrengthExerciseHistory[]> {
  const sets = await prisma.strengthSet.findMany({
    where: { activity: { athleteId, ...visibleActivityWhere } },
    select: {
      exercise: true,
      exerciseCatalogId: true,
      sets: true,
      reps: true,
      weightKg: true,
      durationSec: true,
      notes: true,
      activity: { select: { date: true } },
    },
    orderBy: { activity: { date: 'desc' } },
    // Two years of a daily lifter stay well under this; older sets no longer set a default.
    take: 5000,
  });
  return summarizeExerciseHistory(
    sets.map(({ activity, ...set }) => ({ ...set, date: activity.date })),
  );
}

/** Exercises given to the plan generator: enough to cover a programme, short in the prompt. */
const COACH_HISTORY_LIMIT = 25;

function figures(sets: number | null, reps: number | null, weightKg: number | null): string {
  const volume = sets !== null ? `${sets}×${reps}` : `${reps} rép.`;
  return weightKg !== null && weightKg > 0 ? `${volume} à ${weightKg} kg` : volume;
}

function historyLine(entry: StrengthExerciseHistory): string {
  const { last, best } = entry;
  const lastText =
    last.durationSec !== null && last.durationSec > 0
      ? `${last.sets}×${last.durationSec} s`
      : figures(last.sets, last.reps, last.weightKg);
  const bestText =
    best.weightKg !== null
      ? `, meilleur ${figures(null, best.reps, best.weightKg)}`
      : best.durationSec !== null
        ? `, meilleur ${best.durationSec} s`
        : '';
  return `- ${entry.name} : dernière fois ${lastText} (${last.date})${bestText}, ${entry.sessions} séance(s)`;
}

/**
 * What the athlete actually lifted, for the plan generator: without it every strength
 * session was prescribed from nothing and no load could progress from the last one.
 * Empty when nothing was logged.
 */
export function formatStrengthHistoryBlock(history: readonly StrengthExerciseHistory[]): string {
  if (history.length === 0) {
    return '';
  }
  return [
    '\n\n## Historique de renfo (chiffres réellement faits)',
    '- Pour un exercice listé, pars de la dernière séance : même charge si elle date de plus de 3 semaines, sinon +2,5 à 5 % ou +1 à 2 répétitions. Ne dépasse jamais le meilleur de plus de 5 %. Un exercice absent de la liste se prescrit sans charge chiffrée.',
    ...history.slice(0, COACH_HISTORY_LIMIT).map(historyLine),
  ].join('\n');
}

export async function loadStrengthHistoryBlock(athleteId: string): Promise<string> {
  return formatStrengthHistoryBlock(await loadExerciseHistory(athleteId));
}
