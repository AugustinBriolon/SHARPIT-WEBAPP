import { describe, expect, it } from 'vitest';
import {
  formatZoneWorseningConduct,
  zoneWorseningConduct,
  type WorseningZone,
} from './zone-worsening-conduct';

const NOW = new Date('2026-10-20T12:00:00Z');

/** Readings newest first, one every three days. */
function readings(...severities: number[]) {
  return severities.map((severity, i) => ({
    date: new Date(NOW.getTime() - i * 3 * 86_400_000),
    severity,
  }));
}

const knee = (overrides: Partial<WorseningZone> = {}): WorseningZone => ({
  title: 'Tendinite rotulienne',
  bodyPart: 'Genou',
  category: 'PAIN',
  status: 'ACTIVE',
  severity: 5,
  affectsTraining: true,
  resolvedAt: null,
  startDate: new Date('2026-10-12'),
  checkins: readings(5, 4, 3),
  ...overrides,
});

describe('zoneWorseningConduct', () => {
  it('cuts the sports that load a worsening knee and adds support from the taxonomy', () => {
    const conduct = zoneWorseningConduct(knee(), NOW);
    expect(conduct?.reduceSports).toEqual(['course', 'vélo']);
    expect(conduct?.supportExercises).toContain('Chaise');
    expect(conduct?.supportExercises).toContain('Glute Bridge');
    expect(conduct?.referral).toBeNull();
  });

  it('refers on a high severity, a zone that stops training, or one open three weeks', () => {
    expect(zoneWorseningConduct(knee({ severity: 7 }), NOW)?.referral).toBe('sévérité 7/10');
    expect(zoneWorseningConduct(knee({ functionalImpact: 'STOPPED' }), NOW)?.referral).toBe(
      'elle empêche de s’entraîner',
    );
    expect(zoneWorseningConduct(knee({ startDate: new Date('2026-09-20') }), NOW)?.referral).toBe(
      'ouverte depuis 30 jours',
    );
  });

  it('decides nothing for a zone that is stable or improving', () => {
    expect(zoneWorseningConduct(knee({ checkins: readings(4, 4, 4) }), NOW)).toBeNull();
    expect(zoneWorseningConduct(knee({ checkins: readings(2, 4, 5) }), NOW)).toBeNull();
  });
});

describe('formatZoneWorseningConduct', () => {
  it('writes one imperative line per worsening zone, and nothing otherwise', () => {
    const text = formatZoneWorseningConduct([knee()], NOW);
    expect(text).toContain('## Zones en aggravation : conduite à tenir (décidée par SHARPIT)');
    expect(text).toContain('- Tendinite rotulienne : réduis d’abord course et vélo');
    expect(text).toContain('si elle s’aggrave encore à la prochaine mesure');
    expect(formatZoneWorseningConduct([knee({ checkins: readings(3, 3) })], NOW)).toBe('');
  });
});
