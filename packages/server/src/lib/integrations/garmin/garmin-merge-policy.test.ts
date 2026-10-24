import { describe, expect, it } from 'vitest';
import { resolveSourcePrefs } from '@sharpit/app/lib/integrations/source-prefs';
import { garminLeadsActivities, garminMergePatch } from './garmin-merge-policy';

function prefsWithPrimary(primary: 'garmin' | 'strava' | null) {
  const prefs = resolveSourcePrefs(null, ['garmin', 'strava']);
  prefs.classes.activities.primary = primary;
  return prefs;
}

const ENRICHMENT = {
  garminId: '42',
  source: 'garmin+strava',
  title: 'Course à pied matinale',
  duration: 3600,
  load: 80,
  rpe: 6,
  feeling: 'good',
  notes: 'Montre',
};

describe('garminLeadsActivities', () => {
  it('leads when it is the primary or when no primary is set', () => {
    expect(garminLeadsActivities(prefsWithPrimary('garmin'))).toBe(true);
    expect(garminLeadsActivities(prefsWithPrimary(null))).toBe(true);
    expect(garminLeadsActivities(prefsWithPrimary('strava'))).toBe(false);
  });
});

describe('garminMergePatch', () => {
  it('leading, replaces the measures but keeps what the athlete wrote', () => {
    const patch = garminMergePatch(
      { title: 'Footing du lac', duration: 3500, load: 70, rpe: 8, feeling: null, notes: null },
      ENRICHMENT,
      true,
    );
    expect(patch).toMatchObject({ garminId: '42', duration: 3600, load: 80 });
    expect(patch).not.toHaveProperty('title');
    expect(patch).not.toHaveProperty('rpe');
    expect(patch).toMatchObject({ feeling: 'good', notes: 'Montre' });
  });

  it('behind another primary, only fills the blanks', () => {
    const patch = garminMergePatch(
      { title: 'Footing du lac', duration: 3500, load: null, rpe: null },
      ENRICHMENT,
      false,
    );
    expect(patch).toMatchObject({ garminId: '42', source: 'garmin+strava', load: 80, rpe: 6 });
    expect(patch).not.toHaveProperty('duration');
    expect(patch).not.toHaveProperty('title');
  });
});
