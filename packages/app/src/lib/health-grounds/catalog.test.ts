import { describe, expect, it } from 'vitest';
import { formatHealthGroundsForCoach, HEALTH_GROUND_CATALOG, HEALTH_GROUND_KEYS } from './catalog';

describe('health ground catalog', () => {
  it('has one entry per key, each with a source and stages that carry rules', () => {
    expect(HEALTH_GROUND_CATALOG.map((entry) => entry.key)).toEqual([...HEALTH_GROUND_KEYS]);
    for (const entry of HEALTH_GROUND_CATALOG) {
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.stages.length).toBeGreaterThan(0);
      expect(new Set(entry.stages.map((stage) => stage.id)).size).toBe(entry.stages.length);
      for (const stage of entry.stages) {
        expect(stage.rules.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('formatHealthGroundsForCoach', () => {
  it('caps impact after a vertebral fracture and asks for a medical go-ahead', () => {
    const lines = formatHealthGroundsForCoach([
      { key: 'osteoporosis', stage: 'vertebral_fracture' },
    ]);
    expect(lines[0]).toBe('Ostéoporose / ostéopénie (Avec fracture vertébrale) :');
    expect(lines.join('\n')).toContain('marche rapide');
    expect(lines.at(-1)).toContain('Avis médical à obtenir');
  });

  it('writes no phase rule for a regular cycle and no clearance line', () => {
    const lines = formatHealthGroundsForCoach([{ key: 'menstrual_cycle', stage: 'regular' }]);
    expect(lines.join('\n')).toContain('Aucune règle par phase');
    expect(lines.join('\n')).not.toContain('Avis médical');
  });

  it('drops unknown keys or stages rather than guessing', () => {
    expect(
      formatHealthGroundsForCoach([
        { key: 'osteoporosis', stage: 'made_up' },
        { key: 'scurvy', stage: 'declared' },
      ]),
    ).toEqual([]);
  });

  it('carries the athlete’s words for « other »', () => {
    const lines = formatHealthGroundsForCoach([
      { key: 'other', stage: 'declared', details: '⟦Asthme d’effort⟧' },
    ]);
    expect(lines[0]).toBe('Autre (Déclaré) — ⟦Asthme d’effort⟧ :');
  });
});
