import { describe, expect, it } from 'vitest';
import { formatZoneTrainingRules, type TrainingZone } from './zone-training-rules';

const NOW = new Date('2026-10-05T12:00:00Z');

const zone = (overrides: Partial<TrainingZone>): TrainingZone => ({
  title: 'Nerf sciatique',
  bodyPart: 'Ischio',
  side: 'LEFT',
  category: 'PAIN',
  status: 'ACTIVE',
  severity: 4,
  affectsTraining: true,
  resolvedAt: null,
  ...overrides,
});

describe('formatZoneTrainingRules', () => {
  it('stays empty when no declared zone touches training', () => {
    expect(formatZoneTrainingRules([], NOW)).toBe('');
    expect(formatZoneTrainingRules([zone({ affectsTraining: false })], NOW)).toBe('');
  });

  it('writes one block per strategy', () => {
    const text = formatZoneTrainingRules(
      [
        zone({}),
        zone({ title: 'Tendon du biceps fémoral', bodyPart: 'Genou', side: 'NA', severity: 0 }),
        zone({
          title: 'Épaules enroulées',
          bodyPart: 'Épaule',
          side: 'BILATERAL',
          category: 'POSTURE',
          description: 'Pectoraux plus forts que le dos',
        }),
        zone({
          title: 'Tendinite d’Achille',
          bodyPart: 'Achille',
          status: 'RESOLVED',
          resolvedAt: new Date('2026-09-20T00:00:00Z'),
        }),
      ],
      NOW,
    );
    expect(text).toContain('## Zones sensibles à protéger');
    expect(text).toContain('- Nerf sciatique — zone Ischio (gauche), sévérité 4/10');
    expect(text).toContain('## Zones en reprise progressive\n- Tendon du biceps fémoral');
    expect(text).toContain('## Zones à corriger');
    expect(text).toContain(
      'Épaules enroulées — zone Épaule (des deux côtés), sévérité 4/10 : Pectoraux',
    );
    expect(text).toContain(
      '- Tendinite d’Achille — zone Achille (gauche), résolue le 20 septembre',
    );
  });
});
