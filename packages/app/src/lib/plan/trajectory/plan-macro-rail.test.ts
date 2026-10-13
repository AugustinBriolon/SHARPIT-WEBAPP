import { describe, expect, it } from 'vitest';
import { buildMacroPhaseRail } from '@sharpit/app/lib/plan/trajectory/plan-macro-rail';

const PLAN = {
  raceDate: '2026-10-11',
  weeks: [
    { weekStart: '2026-08-03', phase: 'BASE' as const, isDeload: false, focus: 'Aerobic' },
    { weekStart: '2026-08-10', phase: 'BASE' as const, isDeload: false, focus: 'Aerobic' },
    { weekStart: '2026-08-17', phase: 'BUILD' as const, isDeload: false, focus: 'Seuil' },
    { weekStart: '2026-08-24', phase: 'BUILD' as const, isDeload: false, focus: 'Seuil' },
    {
      weekStart: '2026-08-31',
      phase: 'PEAK' as const,
      isDeload: false,
      focus: 'Spécificité course',
    },
    { weekStart: '2026-09-07', phase: 'PEAK' as const, isDeload: true, focus: 'Récupération' },
    { weekStart: '2026-09-14', phase: 'TAPER' as const, isDeload: false, focus: 'Affûtage' },
  ],
};

describe('buildMacroPhaseRail', () => {
  it('is absent without a plan or when the week is outside it', () => {
    expect(buildMacroPhaseRail(null, new Date(2026, 8, 2))).toBeNull();
    expect(buildMacroPhaseRail(PLAN, new Date(2026, 6, 1))).toBeNull();
  });

  it('collapses consecutive weeks into phase runs and marks the current one', () => {
    const rail = buildMacroPhaseRail(PLAN, new Date(2026, 8, 4));
    expect(rail).toMatchObject({
      runs: [
        { phase: 'BASE', label: 'Base', current: false },
        { phase: 'BUILD', label: 'Développement', current: false },
        { phase: 'PEAK', label: 'Spécifique', current: true },
        { phase: 'TAPER', label: 'Affûtage', current: false },
      ],
      weekInRun: 1,
      focus: 'Spécificité course',
      isDeload: false,
      quality: 'RACE_PACE',
      qualityLabel: 'Allure spécifique',
    });
  });

  it('counts the week inside the current run', () => {
    const rail = buildMacroPhaseRail(PLAN, new Date(2026, 8, 9));
    expect(rail?.weekInRun).toBe(2);
    expect(rail?.isDeload).toBe(true);
    expect(rail?.focus).toBe('Récupération');
    expect(rail?.quality).toBe('DELOAD');
    expect(rail?.qualityLabel).toBe('Semaine facile');
  });
});
