/** "GOBLET_SQUAT" → "Goblet Squat" */
export function humanizeExercise(raw: string): string {
  return raw
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
