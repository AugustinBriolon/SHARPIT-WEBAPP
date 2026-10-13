import { describe, expect, it } from 'vitest';
import { deriveWeekQuality, weekQualityLabelFr } from './week-quality';

describe('deriveWeekQuality', () => {
  it('maps focus keywords to qualities', () => {
    expect(deriveWeekQuality({ focus: 'Séances seuil et tempo' })).toBe('THRESHOLD');
    expect(deriveWeekQuality({ focus: 'VMA courte' })).toBe('VO2');
    expect(deriveWeekQuality({ focus: 'Force en côtes' })).toBe('STRENGTH_HILLS');
    expect(deriveWeekQuality({ focus: 'Reprise progressive' })).toBe('RETURN');
  });

  it('honours deload and phase defaults', () => {
    expect(deriveWeekQuality({ focus: 'Volume', isDeload: true })).toBe('DELOAD');
    expect(deriveWeekQuality({ planPhase: 'TAPER' })).toBe('TAPER');
    expect(deriveWeekQuality({ planPhase: 'BASE' })).toBe('AEROBIC_BASE');
  });

  it('exposes French labels', () => {
    expect(weekQualityLabelFr('THRESHOLD')).toBe('Seuil');
  });
});
