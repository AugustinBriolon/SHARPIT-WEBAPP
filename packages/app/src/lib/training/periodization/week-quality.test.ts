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

  // ADR-133: the base phase carries one short quality session a week.
  it('reads the base focus, with or without long-session milestones, as a threshold week', () => {
    const base =
      'Volume aérobie, endurance fondamentale, une séance tempo ou seuil courte par semaine';
    const withMilestones = `${base} · Sortie longue vélo jusqu'à 3 h 30, course longue jusqu'à 1 h 45`;
    expect(deriveWeekQuality({ focus: base, planPhase: 'BASE' })).toBe('THRESHOLD');
    expect(deriveWeekQuality({ focus: withMilestones, planPhase: 'BASE' })).toBe('THRESHOLD');
    expect(deriveWeekQuality({ focus: base, planPhase: 'BASE', isDeload: true })).toBe('DELOAD');
  });
});
