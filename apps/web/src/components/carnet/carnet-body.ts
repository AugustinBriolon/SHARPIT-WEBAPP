/** The arithmetic behind the Corps cards: where a ring stops and how a night splits. */

export type SleepStageKey = 'deep' | 'rem' | 'light' | 'awake';

export type SleepStage = { key: SleepStageKey; label: string; minutes: number; share: number };

const STAGE_LABELS: Record<SleepStageKey, string> = {
  deep: 'Profond',
  rem: 'Paradoxal',
  light: 'Léger',
  awake: 'Éveil',
};

/** The stroke length a ring of `radius` fills for `value` out of `max`, clamped to the ring. */
export function ringDash(value: number, max: number, radius: number): [number, number] {
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(Math.max(value / max, 0), 1) * circumference;
  return [filled, circumference];
}

/** The stages a night holds, in reading order, each with its share of the night. */
export function sleepStages(minutes: Record<SleepStageKey, number | null>): SleepStage[] {
  const present = (Object.keys(STAGE_LABELS) as SleepStageKey[]).flatMap((key) => {
    const value = minutes[key];
    return value !== null && value > 0 ? [{ key, label: STAGE_LABELS[key], minutes: value }] : [];
  });
  const total = present.reduce((sum, stage) => sum + stage.minutes, 0);
  return present.map((stage) => ({ ...stage, share: stage.minutes / total }));
}
