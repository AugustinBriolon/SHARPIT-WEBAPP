import { describe, expect, it } from 'vitest';
import {
  bySeverityDesc,
  catalogGroupsForRegion,
  describeZone,
  exerciseZoneConflict,
  formatSensitiveZoneRules,
  sensitiveZonesFrom,
  sportZoneConflicts,
  unmappedSensitiveZones,
  type SensitiveZone,
} from './sensitive-zones';
import { COMMON_BODY_PARTS } from './physical';

describe('catalogGroupsForRegion', () => {
  it('knows every body part offered at declaration', () => {
    const unknown = COMMON_BODY_PARTS.filter((part) => catalogGroupsForRegion(part).length === 0);
    expect(unknown).toEqual([]);
    expect(catalogGroupsForRegion('Coude')).toEqual(['lower arms']);
    expect(catalogGroupsForRegion('Cou')).toEqual(['neck']);
  });

  it('maps the regions the athlete actually writes', () => {
    expect(catalogGroupsForRegion('Ischio')).toEqual(['upper legs']);
    expect(catalogGroupsForRegion('Pied')).toEqual(['lower legs']);
    expect(catalogGroupsForRegion('Bassin')).toEqual(['waist']);
    expect(catalogGroupsForRegion('Épaule')).toEqual(['shoulders']);
  });

  it('covers both thigh and calf work for a knee', () => {
    expect(catalogGroupsForRegion('Genou')).toEqual(['upper legs', 'lower legs']);
  });

  it('never guesses an unknown region', () => {
    expect(catalogGroupsForRegion('Mâchoire')).toEqual([]);
    expect(catalogGroupsForRegion(null)).toEqual([]);
  });
});

describe('sensitiveZonesFrom', () => {
  it('keeps pains and injuries that still constrain training', () => {
    const zones = sensitiveZonesFrom([
      { type: 'PAIN', label: 'Nerf sciatique', bodyRegion: 'Ischio', side: 'LEFT', severity: 1 },
      { type: 'INJURY', label: 'Fracture', bodyRegion: 'Pied', side: 'NA', severity: 6 },
    ]);

    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ region: 'Ischio', side: 'LEFT', groups: ['upper legs'] });
    expect(zones[1]?.side).toBeNull();
  });

  it('leaves posture and mobility work out — they are not a load restriction', () => {
    expect(
      sensitiveZonesFrom([
        { type: 'POSTURE_ISSUE', label: 'Bassin rétroversé', bodyRegion: 'Bassin' },
        { category: 'MOBILITY', title: 'Chevilles raides', bodyPart: 'Cheville' },
      ]),
    ).toEqual([]);
  });

  it('drops resolved conditions and those declared not to affect training', () => {
    expect(
      sensitiveZonesFrom([
        { type: 'PAIN', label: 'Ancienne douleur', bodyRegion: 'Genou', status: 'RESOLVED' },
        { type: 'PAIN', label: 'Gêne', bodyRegion: 'Genou', affectsTraining: false },
      ]),
    ).toEqual([]);
  });

  it('accepts the legacy note shape too', () => {
    expect(
      sensitiveZonesFrom([{ category: 'PAIN', title: 'Tendon', bodyPart: 'Genou' }]),
    ).toHaveLength(1);
  });
});

describe('exerciseZoneConflict', () => {
  const zones: SensitiveZone[] = [
    {
      label: 'Nerf sciatique',
      region: 'Ischio',
      side: 'LEFT',
      severity: 1,
      groups: ['upper legs'],
    },
  ];

  it('flags an exercise loading the protected group', () => {
    expect(exerciseZoneConflict({ groups: ['upper legs'], loads: true }, zones)?.label).toBe(
      'Nerf sciatique',
    );
  });

  it('lets everything else through', () => {
    expect(exerciseZoneConflict({ groups: ['shoulders'], loads: true }, zones)).toBeNull();
    expect(exerciseZoneConflict(null, zones)).toBeNull();
    expect(exerciseZoneConflict({ groups: ['upper legs'], loads: true }, [])).toBeNull();
  });

  it('never flags mobility work on the zone — that is the prehab, not the injury', () => {
    expect(exerciseZoneConflict({ groups: ['upper legs'], loads: false }, zones)).toBeNull();
    expect(exerciseZoneConflict({ groups: [], loads: true }, zones)).toBeNull();
  });
});

describe('sportZoneConflicts', () => {
  const ischio: SensitiveZone = {
    label: 'Nerf sciatique',
    region: 'Ischio',
    side: 'LEFT',
    severity: 4,
    groups: ['upper legs'],
  };
  const epaule: SensitiveZone = {
    label: 'Coiffe',
    region: 'Épaule',
    side: null,
    severity: 2,
    groups: ['shoulders'],
  };

  it('flags the endurance sports that load the zone', () => {
    expect(sportZoneConflicts('RUN', [ischio])).toEqual([ischio]);
    expect(sportZoneConflicts('BIKE', [ischio])).toEqual([ischio]);
  });

  it('leaves a sport that loads elsewhere alone', () => {
    expect(sportZoneConflicts('SWIM', [ischio])).toEqual([]);
    expect(sportZoneConflicts('RUN', [epaule])).toEqual([]);
  });

  it('says nothing for strength — that is judged exercise by exercise', () => {
    expect(sportZoneConflicts('STRENGTH', [ischio])).toEqual([]);
    expect(sportZoneConflicts(null, [ischio])).toEqual([]);
  });

  it('returns every matching zone, not just the first', () => {
    expect(sportZoneConflicts('SWIM', [epaule, { ...epaule, label: 'Autre épaule' }])).toHaveLength(
      2,
    );
  });
});

describe('describeZone', () => {
  it('names the side and the severity the athlete declared', () => {
    expect(
      describeZone({
        label: 'Nerf sciatique',
        region: 'Ischio',
        side: 'LEFT',
        severity: 4,
        groups: ['upper legs'],
      }),
    ).toBe('Nerf sciatique (gauche, sévérité 4/10)');
  });

  it('falls back to the bare label when neither is known', () => {
    expect(
      describeZone({ label: 'Gêne', region: 'Dos', side: null, severity: null, groups: ['back'] }),
    ).toBe('Gêne');
  });
});

describe('unmappedSensitiveZones', () => {
  it('surfaces the zones no automatic check can cover', () => {
    const unknown: SensitiveZone = {
      label: 'Mâchoire',
      region: 'Mâchoire',
      side: null,
      severity: 3,
      groups: [],
    };
    const known: SensitiveZone = {
      label: 'Nerf sciatique',
      region: 'Ischio',
      side: null,
      severity: 3,
      groups: ['upper legs'],
    };

    expect(unmappedSensitiveZones([unknown, known])).toEqual([unknown]);
  });
});

describe('bySeverityDesc', () => {
  it('puts the worst first, and treats an unknown severity as lowest', () => {
    const zone = (severity: number | null): SensitiveZone => ({
      label: `z${severity}`,
      region: 'Ischio',
      side: null,
      severity,
      groups: ['upper legs'],
    });

    expect([zone(1), zone(8), zone(null)].sort(bySeverityDesc).map((z) => z.severity)).toEqual([
      8,
      1,
      null,
    ]);
  });
});

describe('formatSensitiveZoneRules', () => {
  it('says nothing when there is nothing to protect', () => {
    expect(formatSensitiveZoneRules([])).toBe('');
  });

  it('names the zone, the side and the severity', () => {
    const block = formatSensitiveZoneRules([
      {
        label: 'Nerf sciatique',
        region: 'Ischio',
        side: 'LEFT',
        severity: 1,
        groups: ['upper legs'],
      },
    ]);

    expect(block).toContain('Nerf sciatique — zone Ischio (gauche), sévérité 1/10');
    expect(block).toContain('Renforce AUTOUR');
  });
});
