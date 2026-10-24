import { describe, expect, it } from 'vitest';
import {
  legDisplayDurationSec,
  legKindLabel,
  mapGarminChildTypeToKind,
  totalTransitionSec,
  type MultisportLeg,
} from '@sharpit/app/lib/activity/multisport';

describe('mapGarminChildTypeToKind', () => {
  it('mappe les types Garmin multisport', () => {
    expect(mapGarminChildTypeToKind('open_water_swimming')).toBe('swim');
    expect(mapGarminChildTypeToKind('lap_swimming')).toBe('swim');
    expect(mapGarminChildTypeToKind('cycling')).toBe('bike');
    expect(mapGarminChildTypeToKind('running')).toBe('run');
    expect(mapGarminChildTypeToKind('transition_v2')).toBe('transition');
  });
});

describe('legKindLabel', () => {
  it('nomme les transitions T1 et T2', () => {
    expect(legKindLabel('transition', 1)).toBe('T1');
    expect(legKindLabel('transition', 2)).toBe('T2');
    expect(legKindLabel('swim', null)).toBe('Natation');
    expect(legKindLabel('bike', null)).toBe('Vélo');
    expect(legKindLabel('run', null)).toBe('Course');
  });
});

describe('legDisplayDurationSec', () => {
  it('préfère le temps en mouvement pour les transitions', () => {
    const t1: MultisportLeg = {
      kind: 'transition',
      label: 'T1',
      durationSec: 136,
      movingDurationSec: 80,
      distanceM: null,
      avgHr: null,
      avgSpeedMs: null,
      elevationM: null,
      calories: null,
      garminActivityId: '1',
      transitionIndex: 1,
    };
    expect(legDisplayDurationSec(t1)).toBe(80);
    expect(
      totalTransitionSec([t1, { ...t1, label: 'T2', movingDurationSec: 73, durationSec: 198 }]),
    ).toBe(153);
  });
});
