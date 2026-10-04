import { z } from 'zod';

/**
 * Which pushes the athlete wants (Paramètres → Notifications). Stored versioned on
 * `AthleteProfile.notificationPrefs`; null or anything unreadable means the defaults.
 *
 * `morningVerdict` goes out as soon as the night reaches the server (a sync, an Apple Health
 * upload), with a 09:30 UTC fallback; `sessionDone` once a synced activity counts for a planned
 * session. `morningTime` is stored, unused since the push follows the night rather than a clock.
 */
export type NotificationPrefs = {
  version: 1;
  morningVerdict: boolean;
  /** "HH:mm", athlete-local. Null = the default morning slot. */
  morningTime: string | null;
  weeklyReview: boolean;
  sessionReminder: boolean;
  /** « Séance comptée » after a synced activity is linked to the plan. */
  sessionDone: boolean;
  syncAlerts: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  version: 1,
  morningVerdict: true,
  morningTime: null,
  weeklyReview: true,
  sessionReminder: true,
  sessionDone: true,
  syncAlerts: true,
};

const morningTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'morningTime doit être au format HH:mm')
  .nullable();

/** PATCH body: any subset of the fields; the server merges and stores a full v1. */
export const notificationPrefsPatchSchema = z
  .object({
    version: z.literal(1),
    morningVerdict: z.boolean(),
    morningTime,
    weeklyReview: z.boolean(),
    sessionReminder: z.boolean(),
    sessionDone: z.boolean(),
    syncAlerts: z.boolean(),
  })
  .partial()
  .strict();

export type NotificationPrefsPatch = z.infer<typeof notificationPrefsPatchSchema>;

const storedSchema = notificationPrefsPatchSchema.extend({ version: z.literal(1) });

/** Stored value → full prefs; a missing field takes its default. */
export function resolveNotificationPrefs(stored: unknown): NotificationPrefs {
  const parsed = storedSchema.safeParse(stored);
  if (!parsed.success) {
    return DEFAULT_NOTIFICATION_PREFS;
  }
  return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed.data, version: 1 };
}

/** Applies a PATCH to what is stored; null resets to the defaults. */
export function mergeNotificationPrefs(
  stored: unknown,
  patch: NotificationPrefsPatch | null,
): NotificationPrefs {
  if (patch === null) {
    return DEFAULT_NOTIFICATION_PREFS;
  }
  return { ...resolveNotificationPrefs(stored), ...patch, version: 1 };
}

export function wantsMorningVerdict(stored: unknown): boolean {
  return resolveNotificationPrefs(stored).morningVerdict;
}
