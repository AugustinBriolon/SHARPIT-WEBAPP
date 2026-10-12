import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import type { RaceMoment } from '@sharpit/app/lib/goals/race-moment';
import { RaceBand } from './carnet-race';

const swim: MultisportLeg = {
  kind: 'swim',
  label: 'Natation',
  durationSec: 1500,
  movingDurationSec: null,
  distanceM: 1500,
  avgHr: null,
  avgSpeedMs: null,
  elevationM: null,
  calories: null,
  garminActivityId: null,
  transitionIndex: null,
};

function race(overrides: Partial<RaceMoment>): RaceMoment {
  return {
    goalId: 'g',
    title: 'Triathlon de Lorient',
    raceFormat: 'Triathlon M',
    targetPerformance: '2h30',
    targetDate: '2026-10-12',
    phase: 'raceDay',
    activity: null,
    ...overrides,
  };
}

describe('RaceBand', () => {
  it('on race day before the finish, names the goal, its format and its target', () => {
    const html = renderToStaticMarkup(createElement(RaceBand, { race: race({}) }));
    expect(html).toContain('Jour J');
    expect(html).toContain('Triathlon de Lorient');
    expect(html).toContain('Triathlon M · objectif 2h30');
  });

  it('after the race, says the result on one line and invites a look back at the séance', () => {
    const html = renderToStaticMarkup(
      createElement(RaceBand, {
        race: race({
          phase: 'postRace',
          targetPerformance: 'sub 2h30',
          activity: { id: 'act-1', title: null, durationSec: 8808, legs: [swim] },
        }),
      }),
    );
    expect(html).toContain('Course terminée');
    expect(html).toContain('2:26:48 · objectif sub 2h30');
    expect(html).toContain('aria-label="Répartition du temps : Natation 25:00"');
    expect(html).not.toContain('Les étapes');
    expect(html).toContain('href="/seances/act-1"');
    expect(html).toContain('Reviens sur ta course : ce qui a marché, où tu peux progresser');
    expect(html).not.toContain('Voir la séance');
  });

  it('on race day with the race already in, keeps the full figures', () => {
    const html = renderToStaticMarkup(
      createElement(RaceBand, {
        race: race({ activity: { id: 'act-1', title: null, durationSec: 9000, legs: [swim] } }),
      }),
    );
    expect(html).toContain('Jour J');
    expect(html).toContain('Temps final');
    expect(html).toContain('Voir la séance');
  });
});
