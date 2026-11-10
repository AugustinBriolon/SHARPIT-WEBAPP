/**
 * Weekly load an athlete with no training history may be handed: the plan gate's ceiling is a
 * multiple of the recent load, which is zero for them, so nothing else bounds a first week.
 *
 * shortcut: one hour of steady endurance (IF ≈ 0.75) is about 56 TSS, rounded up and counted
 * once per wanted session; replace with a measured baseline once first weeks can be observed.
 */
export const COLD_START_LOAD_PER_SESSION = 60;
const COLD_START_DEFAULT_SESSIONS = 3;

export function coldStartWeeklyLoad(sessionsPerWeek: number | null | undefined): number {
  return COLD_START_LOAD_PER_SESSION * (sessionsPerWeek ?? COLD_START_DEFAULT_SESSIONS);
}
