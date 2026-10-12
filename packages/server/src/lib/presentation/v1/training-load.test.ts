import { describe, expect, it } from 'vitest';
import {
  projectV1TrainingLoad,
  TRAINING_LOAD_WEEKS,
} from '@sharpit/server/lib/presentation/v1/training-load';

function point(date: string, ctl: number) {
  return { date, label: date, tss: 50, ctl, atl: ctl + 10, tsb: -10 };
}

describe('projectV1TrainingLoad', () => {
  const pmc = [point('2026-07-01', 30), point('2026-09-20', 48), point('2026-09-29', 52)];
  const stress = [
    { load: 80, date: new Date('2026-09-29T12:00:00.000Z') },
    { load: 60, date: new Date('2026-09-23T12:00:00.000Z') },
    { load: 40, date: new Date('2026-09-22T12:00:00.000Z') },
  ];

  it('keeps the last six weeks of the fitness curve, as plain numbers', () => {
    const load = projectV1TrainingLoad('2026-09-29', pmc, stress);

    expect(load.days.map((day) => day.date)).toEqual(['2026-09-20', '2026-09-29']);
    expect(load.days.at(-1)).toEqual({ date: '2026-09-29', tss: 50, ctl: 52, atl: 62, tsb: -10 });
    expect(load.calibration).toEqual({
      status: 'calibrating',
      daysWithLoad: 3,
      daysNeeded: 14,
    });
  });

  it('marks calibration ready once fourteen load days exist in the CTL window', () => {
    const many = Array.from({ length: 14 }, (_, index) => ({
      load: 50,
      date: new Date(Date.UTC(2026, 8, 16 + index, 12)),
    }));
    const load = projectV1TrainingLoad('2026-09-29', pmc, many);
    expect(load.calibration.status).toBe('ready');
    expect(load.calibration.daysWithLoad).toBe(14);
  });

  it('sums each rolling week ending on the reference day, the current one last', () => {
    const { weeks } = projectV1TrainingLoad('2026-09-29', pmc, stress);

    expect(weeks).toHaveLength(TRAINING_LOAD_WEEKS);
    expect(weeks.at(-1)).toEqual({ weekEnd: '2026-09-29', tss: 140 });
    expect(weeks.at(-2)).toEqual({ weekEnd: '2026-09-22', tss: 40 });
  });
});
