/** RPE Garmin (directWorkoutRpe) : entier 10–100, échelle 1–10. */
export function garminRpeToScale(raw: number | null | undefined): number | null {
  if (raw === undefined || raw === null || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  // Garmin can encode RPE on a 10–100 scale (10 => 1/10, 100 => 10/10).
  // Some paths may already expose a direct 1–10 value, so preserve sub-10 inputs.
  const scaled = raw >= 10 ? Math.round(raw / 10) : Math.round(raw);
  return Math.min(10, Math.max(1, scaled));
}

/**
 * Ressenti Garmin (directWorkoutFeel) : 0 / 25 / 50 / 75 / 100.
 * Libellés alignés sur l'app Garmin Connect.
 */
export function garminFeelLabel(raw: number | null | undefined): string | null {
  if (raw === undefined || raw === null || !Number.isFinite(raw)) {
    return null;
  }
  if (raw <= 12) {
    return 'Très mal';
  }
  if (raw <= 37) {
    return 'Mal';
  }
  if (raw <= 62) {
    return 'Correct';
  }
  if (raw <= 87) {
    return 'Bien';
  }
  return 'Très bien';
}
