/**
 * When the day's last coffee was noted, read against the night after it (ADR-139).
 *
 * Caffeine's half-life is about five hours; sleep hygiene guidance keeps it more than eight hours
 * before bed. So the journal analysis compares the nights after a late coffee with the nights after
 * an early one — the athlete's question « 10 h ou 16 h, est-ce la même chose pour mon sommeil ? ».
 * A day without caffeine, or whose coffee has no time, says nothing either way: it is not « no ».
 */

/** Derived, never toggled: set from the caffeine's time, not from a tap. */
export const LATE_COFFEE_FACTOR_ID = 'late_coffee';
export const LATE_COFFEE_LABEL = 'Café tardif';

/** A coffee closer to bedtime than this is late. */
export const CAFFEINE_CLEAR_MINUTES = 8 * 60;
/** Without that night's bedtime, a coffee from this time on is late. */
export const LATE_COFFEE_FALLBACK_MINUTE = 14 * 60;

/** A bedtime as minutes after the day's midnight: 00:45 is 24:45, after the evening. */
function bedtimeAfterMidnight(bedtimeMinute: number): number {
  return bedtimeMinute < 12 * 60 ? bedtimeMinute + 24 * 60 : bedtimeMinute;
}

export function lateCoffeeFactor(input: {
  caffeineMg: number | null;
  /** The last coffee, minutes after the day's local midnight; null when unknown. */
  lastCoffeeMinute: number | null;
  /** Bedtime of the night that follows the day, minutes after midnight; null when unknown. */
  nextBedtimeMinute: number | null;
}): 'yes' | 'no' | null {
  if (!input.caffeineMg || input.caffeineMg <= 0 || input.lastCoffeeMinute === null) {
    return null;
  }
  if (input.nextBedtimeMinute === null) {
    return input.lastCoffeeMinute >= LATE_COFFEE_FALLBACK_MINUTE ? 'yes' : 'no';
  }
  const beforeBed = bedtimeAfterMidnight(input.nextBedtimeMinute) - input.lastCoffeeMinute;
  return beforeBed < CAFFEINE_CLEAR_MINUTES ? 'yes' : 'no';
}
