/**
 * Practiced sports — endurance-first catalog for onboarding + settings.
 * See docs/superpowers/specs/2026-09-01-practiced-sports-design.md
 */

export const CORE_PRACTICED_SPORTS = ['run', 'bike', 'swim', 'triathlon'] as const;
export const COMPLEMENTARY_PRACTICED_SPORTS = ['strength', 'mobility', 'stretching'] as const;

export const PRACTICED_SPORTS = [
  ...CORE_PRACTICED_SPORTS,
  ...COMPLEMENTARY_PRACTICED_SPORTS,
] as const;

export type CorePracticedSportId = (typeof CORE_PRACTICED_SPORTS)[number];
export type ComplementaryPracticedSportId = (typeof COMPLEMENTARY_PRACTICED_SPORTS)[number];
export type PracticedSportId = (typeof PRACTICED_SPORTS)[number];

export type AthletePracticedSports = {
  version: 1;
  sports: PracticedSportId[];
};

/** Existing athletes with null/empty stored value — all core, no complements. */
export const DEFAULT_CORE_PRACTICED_SPORTS: readonly CorePracticedSportId[] = [
  'run',
  'bike',
  'swim',
  'triathlon',
];

export const EMPTY_ATHLETE_PRACTICED_SPORTS: AthletePracticedSports = {
  version: 1,
  sports: [],
};

export const PRACTICED_SPORT_LABELS: Record<PracticedSportId, string> = {
  run: 'Course',
  bike: 'Vélo',
  swim: 'Natation',
  triathlon: 'Triathlon',
  strength: 'Musculation',
  mobility: 'Mobilité',
  stretching: 'Étirements',
};

const CORE_SET = new Set<string>(CORE_PRACTICED_SPORTS);

export function isPracticedSportId(value: unknown): value is PracticedSportId {
  return typeof value === 'string' && (PRACTICED_SPORTS as readonly string[]).includes(value);
}

export function isCorePracticedSportId(value: unknown): value is CorePracticedSportId {
  return typeof value === 'string' && CORE_SET.has(value);
}

function uniqueOrdered(sports: Iterable<PracticedSportId>): PracticedSportId[] {
  const set = new Set(sports);
  return PRACTICED_SPORTS.filter((id) => set.has(id));
}

/**
 * Toggle one practiced sport independently.
 * Triathlon is a separate intent: selecting it does not force run/bike/swim,
 * and completing the three legs does not auto-check triathlon.
 */
export function togglePracticedSport(
  current: readonly PracticedSportId[],
  id: PracticedSportId,
  enabled: boolean,
): PracticedSportId[] {
  const next = new Set(current);
  if (enabled) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return uniqueOrdered(next);
}

export function hasCorePracticedSport(sports: readonly PracticedSportId[]): boolean {
  return sports.some((id) => isCorePracticedSportId(id));
}

/**
 * Read-path normalize. Null / invalid / empty → all core sports
 * (existing athletes must not be blocked; see design note). A complement-only selection
 * (strength alone) is a real profile and stays as saved — ADR-086.
 */
export function normalizeAthletePracticedSports(raw: unknown): AthletePracticedSports {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, sports: [...DEFAULT_CORE_PRACTICED_SPORTS] };
  }

  const record = raw as { version?: unknown; sports?: unknown };
  if (!Array.isArray(record.sports)) {
    return { version: 1, sports: [...DEFAULT_CORE_PRACTICED_SPORTS] };
  }

  const sports = uniqueOrdered(
    record.sports.filter((value): value is PracticedSportId => isPracticedSportId(value)),
  );

  if (sports.length === 0) {
    return { version: 1, sports: [...DEFAULT_CORE_PRACTICED_SPORTS] };
  }

  return { version: 1, sports };
}

/**
 * Persist shape — does not apply the "existing user" default.
 * Empty / complementary-only stays as sent so validation can reject it.
 */
export function sanitizePracticedSportsForPersist(raw: unknown): AthletePracticedSports | null {
  if (raw === null) {
    return null;
  }
  if (!raw || typeof raw !== 'object') {
    return EMPTY_ATHLETE_PRACTICED_SPORTS;
  }
  const record = raw as { sports?: unknown };
  if (!Array.isArray(record.sports)) {
    return EMPTY_ATHLETE_PRACTICED_SPORTS;
  }
  return {
    version: 1,
    sports: uniqueOrdered(
      record.sports.filter((value): value is PracticedSportId => isPracticedSportId(value)),
    ),
  };
}
