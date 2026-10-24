/**
 * Garmin's Personal API is for one person's own data, not a multi-user app, so the key form
 * is open only to the athletes listed in `GARMIN_PERSONAL_KEY_ATHLETES` (comma-separated ids).
 * shortcut: env allowlist, replace with Garmin OAuth once the Startup tier is approved.
 */
export function canUseGarminPersonalKey(athleteId: string): boolean {
  return (process.env.GARMIN_PERSONAL_KEY_ATHLETES ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(athleteId);
}
