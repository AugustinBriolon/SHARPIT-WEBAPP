import { describe, expect, it } from 'vitest';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import { legPaceText, raceFormatLine, raceLegViews, raceResultLine } from './carnet-race-legs';

function leg(overrides: Partial<MultisportLeg>): MultisportLeg {
  return {
    kind: 'run',
    label: '',
    durationSec: 0,
    movingDurationSec: null,
    distanceM: null,
    avgHr: null,
    avgSpeedMs: null,
    elevationM: null,
    calories: null,
    garminActivityId: null,
    transitionIndex: null,
    ...overrides,
  };
}

describe('legPaceText', () => {
  it('reads each sport in its own unit', () => {
    expect(legPaceText(leg({ kind: 'swim', durationSec: 1800, distanceM: 1500 }))).toBe(
      '2:00/100m',
    );
    expect(legPaceText(leg({ kind: 'run', durationSec: 3000, distanceM: 10000 }))).toBe("5'00/km");
    expect(legPaceText(leg({ kind: 'bike', durationSec: 3600, avgSpeedMs: 10 }))).toBe('36,0 km/h');
  });

  it('says nothing for a transition or a leg without distance', () => {
    expect(legPaceText(leg({ kind: 'transition', durationSec: 90, distanceM: 200 }))).toBeNull();
    expect(legPaceText(leg({ kind: 'run', durationSec: 600 }))).toBeNull();
  });
});

describe('raceLegViews', () => {
  it('sizes each leg by its share of the race and names transitions T1 / T2', () => {
    const views = raceLegViews([
      leg({ kind: 'swim', durationSec: 300 }),
      leg({ kind: 'transition', durationSec: 400, movingDurationSec: 100, transitionIndex: 1 }),
      leg({ kind: 'bike', durationSec: 600 }),
      leg({ kind: 'transition', durationSec: 100, transitionIndex: 2 }),
    ]);

    expect(views.map((v) => v.label)).toEqual(['Natation', 'T1', 'Vélo', 'T2']);
    // T1 counts its moving time (100 s), not the zone time: the race is 1100 s.
    expect(views.map((v) => v.durationSec)).toEqual([300, 100, 600, 100]);
    expect(views.map((v) => v.share)).toEqual([300, 100, 600, 100].map((s) => s / 1100));
    expect(views[1]?.color).toBeNull();
    expect(views[0]?.color).not.toBeNull();
  });

  it('draws nothing wide when the race has no time', () => {
    expect(raceLegViews([leg({ durationSec: 0 })])[0]?.share).toBe(0);
  });
});

describe('raceFormatLine', () => {
  it('joins the format and the target, skipping what is missing', () => {
    expect(raceFormatLine('Triathlon M', '2h30')).toBe('Triathlon M · objectif 2h30');
    expect(raceFormatLine(null, '2h30')).toBe('objectif 2h30');
    expect(raceFormatLine(' ', null)).toBeNull();
  });
});

describe('raceResultLine', () => {
  it('puts the final time beside the target', () => {
    expect(raceResultLine(8808, 'sub 2h30')).toBe('2:26:48 · objectif sub 2h30');
    expect(raceResultLine(8808, null)).toBe('2:26:48');
    expect(raceResultLine(null, ' ')).toBeNull();
  });
});
