/**
 * What a race asks of the weeks before it. The macro-plan climbs toward these figures instead
 * of carrying the athlete's current load to race day (ADR-133).
 *
 * Only formats with a sourced figure are listed; any other race keeps the load-relative plan.
 */
export interface RaceDemands {
  /** Weekly training hours of the heaviest weeks, at the end of the specific phase. */
  peakWeeklyHours: number;
  /** Longest ride and run to have done before the taper, in hours. */
  longRideHours: number;
  longRunHours: number;
}

/**
 * Full-distance triathlon, age-group finisher around 12 h: 10–16 h a week at peak, the long ride
 * built to 5–6 h over the last 6–8 weeks, the long run capped at 2.5–3 h (220 Triathlon, Purple
 * Patch, Triathlete). The middle of each range is taken, the low end for the long sessions.
 * shortcut: one figure per format, whatever the target time or the athlete's own ceiling; read
 * the declared weekly hours once the profile holds them.
 */
const FULL_DISTANCE_TRIATHLON: RaceDemands = {
  peakWeeklyHours: 13,
  longRideHours: 5,
  longRunHours: 2.5,
};

/** `raceFormat` as goals store it (« Triathlon XXL », « Ironman », « Trail · 42 km »). */
export function raceDemandsFor(raceFormat: string | null | undefined): RaceDemands | null {
  // « Ironman 70.3 » is the half distance: only the bare name is the full one.
  return /triathlon\s+xxl\b|\bironman\b(?!\s*70)/i.test(raceFormat ?? '')
    ? FULL_DISTANCE_TRIATHLON
    : null;
}
