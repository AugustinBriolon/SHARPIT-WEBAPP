import { ActivityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CORE_PRACTICED_SPORTS,
  coachActivityTypesForPracticed,
  equipmentSportsForPracticed,
  formatPracticedSportsForCoach,
  hasCorePracticedSport,
  isCoachActivityTypeAllowed,
  normalizeAthletePracticedSports,
  performanceSportsForPracticed,
  periodSportOptionsForPracticed,
  togglePracticedSport,
  travelDisciplinesForPracticed,
  type PracticedSportId,
} from '@sharpit/app/lib/practiced-sports/index';

describe('togglePracticedSport — independent selection', () => {
  it('checking triathlon does not add run, bike or swim', () => {
    expect(togglePracticedSport([], 'triathlon', true)).toEqual(['triathlon']);
  });

  it('unchecking run leaves triathlon alone', () => {
    const start: PracticedSportId[] = ['run', 'bike', 'swim', 'triathlon'];
    const next = togglePracticedSport(start, 'run', false);
    expect(next.includes('triathlon')).toBe(true);
    expect(next.includes('run')).toBe(false);
    expect(next.includes('bike')).toBe(true);
    expect(next.includes('swim')).toBe(true);
  });

  it('checking all three legs does not auto-check triathlon', () => {
    let sports: PracticedSportId[] = [];
    sports = togglePracticedSport(sports, 'run', true);
    sports = togglePracticedSport(sports, 'bike', true);
    sports = togglePracticedSport(sports, 'swim', true);
    expect(sports.includes('triathlon')).toBe(false);
    expect(sports.sort()).toEqual(['bike', 'run', 'swim'].sort());
  });

  it('toggling complementary sports does not affect triathlon', () => {
    const start: PracticedSportId[] = ['run'];
    const withStrength = togglePracticedSport(start, 'strength', true);
    expect(withStrength.sort()).toEqual(['run', 'strength'].sort());
    const withMobility = togglePracticedSport(withStrength, 'mobility', true);
    expect(withMobility.includes('triathlon')).toBe(false);
  });
});

describe('hasCorePracticedSport — validation', () => {
  it('rejects empty and complementary-only selections', () => {
    expect(hasCorePracticedSport([])).toBe(false);
    expect(hasCorePracticedSport(['strength', 'mobility', 'stretching'])).toBe(false);
  });

  it('accepts any single core endurance sport including triathlon', () => {
    expect(hasCorePracticedSport(['run'])).toBe(true);
    expect(hasCorePracticedSport(['bike'])).toBe(true);
    expect(hasCorePracticedSport(['swim'])).toBe(true);
    expect(hasCorePracticedSport(['triathlon'])).toBe(true);
  });
});

describe('normalizeAthletePracticedSports — existing users', () => {
  it('defaults null/invalid to all core sports so existing athletes are not blocked', () => {
    expect(normalizeAthletePracticedSports(null).sports).toEqual([
      ...DEFAULT_CORE_PRACTICED_SPORTS,
    ]);
    expect(normalizeAthletePracticedSports(undefined).sports).toEqual([
      ...DEFAULT_CORE_PRACTICED_SPORTS,
    ]);
    expect(normalizeAthletePracticedSports({ version: 1, sports: [] }).sports).toEqual([
      ...DEFAULT_CORE_PRACTICED_SPORTS,
    ]);
  });

  it('keeps a valid stored selection and drops unknown ids', () => {
    const normalized = normalizeAthletePracticedSports({
      version: 1,
      sports: ['run', 'strength', 'hike', 'autre'],
    });
    expect(normalized.sports).toEqual(['run', 'strength']);
  });

  it('keeps a strength-only athlete as saved', () => {
    expect(normalizeAthletePracticedSports({ version: 1, sports: ['strength'] }).sports).toEqual([
      'strength',
    ]);
  });
});

describe('equipmentSportsForPracticed', () => {
  it('maps triathlon to run+bike+swim equipment tabs', () => {
    expect(equipmentSportsForPracticed(['triathlon'])).toEqual(['RUN', 'BIKE', 'SWIM']);
  });

  it('shows strength venue tab only when strength is practiced', () => {
    expect(equipmentSportsForPracticed(['run'])).toEqual(['RUN']);
    expect(equipmentSportsForPracticed(['run', 'strength'])).toEqual(['RUN', 'STRENGTH']);
  });

  it('maps mobility or stretching to the MOBILITY tab', () => {
    expect(equipmentSportsForPracticed(['run', 'mobility'])).toEqual(['RUN', 'MOBILITY']);
    expect(equipmentSportsForPracticed(['run', 'stretching'])).toEqual(['RUN', 'MOBILITY']);
    expect(equipmentSportsForPracticed(['run', 'mobility', 'stretching'])).toEqual([
      'RUN',
      'MOBILITY',
    ]);
  });
});

describe('intention / goals filtering', () => {
  it('offers only run for a run-only athlete in performance goals', () => {
    expect(performanceSportsForPracticed(['run'])).toEqual([ActivityType.RUN]);
  });

  it('offers run+bike+swim when triathlon is practiced', () => {
    expect(performanceSportsForPracticed(['triathlon'])).toEqual([
      ActivityType.RUN,
      ActivityType.BIKE,
      ActivityType.SWIM,
    ]);
  });

  it('filters period sport options to practiced sports and keeps ALL', () => {
    expect(periodSportOptionsForPracticed(['run', 'strength'])).toEqual([
      'ALL',
      ActivityType.RUN,
      ActivityType.STRENGTH,
    ]);
  });

  it('does not offer bike/swim when only run is practiced', () => {
    const options = periodSportOptionsForPracticed(['run']);
    expect(options).toEqual(['ALL', ActivityType.RUN]);
    expect(options).not.toContain(ActivityType.BIKE);
    expect(options).not.toContain(ActivityType.SWIM);
  });
});

describe('coach / twin proposal filtering', () => {
  it('offers RUN and preventive STRENGTH for a run-only athlete', () => {
    expect(coachActivityTypesForPracticed(['run'])).toEqual([
      ActivityType.RUN,
      ActivityType.STRENGTH,
    ]);
    expect(isCoachActivityTypeAllowed('BIKE', ['run'])).toBe(false);
    expect(isCoachActivityTypeAllowed('STRENGTH', ['run'])).toBe(true);
  });

  it('expands triathlon to run+bike+swim plus preventive STRENGTH', () => {
    expect(coachActivityTypesForPracticed(['triathlon'])).toEqual([
      ActivityType.RUN,
      ActivityType.BIKE,
      ActivityType.SWIM,
      ActivityType.STRENGTH,
    ]);
  });

  it('null normalize → all core, so coach allowlist is run+bike+swim+strength', () => {
    const { sports } = normalizeAthletePracticedSports(null);
    expect(sports).toEqual([...DEFAULT_CORE_PRACTICED_SPORTS]);
    expect(coachActivityTypesForPracticed(sports)).toEqual([
      ActivityType.RUN,
      ActivityType.BIKE,
      ActivityType.SWIM,
      ActivityType.STRENGTH,
    ]);
  });

  it('unlocks STRENGTH when complementary strength/mobility/stretching is practiced', () => {
    expect(coachActivityTypesForPracticed(['run', 'strength'])).toEqual([
      ActivityType.RUN,
      ActivityType.STRENGTH,
    ]);
    expect(coachActivityTypesForPracticed(['run', 'mobility'])).toEqual([
      ActivityType.RUN,
      ActivityType.STRENGTH,
    ]);
    expect(coachActivityTypesForPracticed(['run', 'stretching'])).toEqual([
      ActivityType.RUN,
      ActivityType.STRENGTH,
    ]);
  });

  it('maps travel disciplines from practiced sports (triathlon + mobility)', () => {
    expect(travelDisciplinesForPracticed(['triathlon', 'mobility'])).toEqual([
      'RUN',
      'BIKE',
      'SWIM',
      'MOBILITY',
    ]);
    expect(travelDisciplinesForPracticed(['run'])).toEqual(['RUN']);
  });

  it('formats a coach prompt that forbids non-practiced sports and preserves history', () => {
    const text = formatPracticedSportsForCoach(['run']);
    expect(text).toContain('## Sports pratiqués');
    expect(text).toContain('Course');
    expect(text).toContain('IMPÉRATIF');
    expect(text).toContain('historique');
    expect(text).toContain('STRENGTH');
    expect(text).not.toContain('Vélo');
  });
});
