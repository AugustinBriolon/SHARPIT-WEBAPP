import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import type { RaceAnalysis } from '@sharpit/app/lib/activity/race-analysis-types';
import { RaceReading } from './carnet-race-analysis';

const bike: MultisportLeg = {
  kind: 'bike',
  label: 'Vélo',
  durationSec: 11516,
  movingDurationSec: null,
  distanceM: 90000,
  avgHr: 140,
  avgSpeedMs: null,
  elevationM: null,
  calories: null,
  garminActivityId: null,
  transitionIndex: null,
  sourceActivityId: 'bike-row',
};

const analysis: RaceAnalysis = {
  target: { label: 'Sub 5h30', seconds: 19800 },
  total: { seconds: 20403, deltaSec: 603 },
  legs: [
    {
      kind: 'bike',
      label: 'Vélo',
      durationSec: 11516,
      distanceM: 90000,
      sourceActivityId: 'bike-row',
      avgHr: 140,
      hrZonesSec: [600, 6000, 4000, 900, 16],
      pacing: { unit: 'kmh', firstHalf: 29.1, secondHalf: 27.2, changePct: 6.5 },
    },
  ],
  runHrDriftPct: 7.8,
  load: { tss: 312, recoveryHours: 48 },
};

const goal = { title: 'Half IronMan Versailles', raceFormat: 'L', targetPerformance: 'Sub 5h30' };

function render(props: Partial<Parameters<typeof RaceReading>[0]>): string {
  return renderToStaticMarkup(
    createElement(RaceReading, { goal, durationSec: 20403, legs: [bike], analysis, ...props }),
  );
}

describe('RaceReading', () => {
  it('reads the race against its goal, then zones, effort and load', () => {
    const html = render({});
    for (const label of [
      'Par rapport à l&#x27;objectif',
      'Zones cardiaques par étape',
      'Gestion de l&#x27;effort',
      'Charge et récupération',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('5:40:03');
    expect(html).toContain('10:03 au-dessus de l&#x27;objectif');
    expect(html).toContain('ralenti en 2e moitié');
    expect(html).toContain('aria-label="Vélo : Z1 5 %, Z2 52 %, Z3 35 %, Z4 8 %, Z5 0 %"');
  });

  it('opens each leg on its own séance', () => {
    expect(render({})).toContain('href="/seances/bike-row"');
  });

  it('falls back to the goal figures without an analysis', () => {
    const html = render({ analysis: null });
    expect(html).toContain('La course');
    expect(html).not.toContain('Zones cardiaques par étape');
  });
});
