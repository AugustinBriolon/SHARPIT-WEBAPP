import { describe, expect, it } from 'vitest';
import {
  buildCompletedSessionMetrics,
  type CompletedSessionMetricSource,
} from './completed-session-metrics';

function source(
  partial: Partial<CompletedSessionMetricSource> & Pick<CompletedSessionMetricSource, 'type'>,
): CompletedSessionMetricSource {
  return {
    duration: null,
    load: null,
    rpe: null,
    runMetrics: null,
    bikeMetrics: null,
    swimMetrics: null,
    hikeMetrics: null,
    strengthSets: [],
    ...partial,
  };
}

describe('buildCompletedSessionMetrics', () => {
  it('builds distance, duration, and pace for a run', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'RUN',
        duration: 1690,
        runMetrics: { distanceM: 5200 },
        load: 45,
      }),
    );

    expect(metrics).toEqual([
      { label: 'Distance', value: '5.20', unit: 'km' },
      { label: 'Durée', value: '28:10', unit: 'min' },
      { label: 'Allure', value: '5:25', unit: '/km' },
    ]);
  });

  it('uses meters for short distances', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'RUN',
        duration: 300,
        runMetrics: { distanceM: 800 },
      }),
    );

    expect(metrics[0]).toEqual({ label: 'Distance', value: '800', unit: 'm' });
  });

  it('builds bike duration, power, and RPE (no TSS)', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'BIKE',
        duration: 3600,
        bikeMetrics: { tss: 72.4, avgPower: 188 },
        load: 70,
        rpe: 6,
      }),
    );

    expect(metrics).toEqual([
      { label: 'Durée', value: '1:00:00', unit: 'h' },
      { label: 'Puissance', value: '188', unit: 'W' },
      { label: 'RPE', value: '6', unit: '' },
    ]);
  });

  it('builds swim distance, pace, then duration', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'SWIM',
        duration: 1800,
        swimMetrics: { distanceM: 1500 },
        load: 40,
      }),
    );

    expect(metrics).toEqual([
      { label: 'Distance', value: '1.50', unit: 'km' },
      { label: 'Allure', value: '2:00', unit: '/100m' },
      { label: 'Durée', value: '30:00', unit: 'min' },
    ]);
  });

  it('prefers hike pace then elevation when slots remain', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'HIKE',
        duration: 7200,
        hikeMetrics: { distanceM: 12_000, elevationM: 850 },
      }),
    );

    expect(metrics).toEqual([
      { label: 'Distance', value: '12.00', unit: 'km' },
      { label: 'Durée', value: '2:00:00', unit: 'h' },
      { label: 'Allure', value: '10:00', unit: '/km' },
    ]);
  });

  it('falls back to hike elevation when pace cannot be derived', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'HIKE',
        duration: 3600,
        hikeMetrics: { distanceM: null, elevationM: 420 },
      }),
    );

    expect(metrics).toEqual([
      { label: 'Durée', value: '1:00:00', unit: 'h' },
      { label: 'D+', value: '420', unit: 'm' },
    ]);
  });

  it('builds strength duration, kilos lifted, and exercise count', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'STRENGTH',
        duration: 2700,
        rpe: 7,
        load: 35,
        strengthSets: [
          { exercise: 'Squat', sets: 3, reps: 10, weightKg: 60 },
          { exercise: 'Press', sets: 2, reps: 8, weightKg: 22.5 },
          { exercise: 'Squat', sets: 1, reps: 5, weightKg: null },
        ],
      }),
    );

    // 3×10×60 + 2×8×22.5 = 2160; the set without a load adds nothing. RPE gives its place.
    expect(metrics).toEqual([
      { label: 'Durée', value: '45:00', unit: 'min' },
      { label: 'Volume', value: '2160', unit: 'kg' },
      { label: 'Exercices', value: '2', unit: 'exos' },
    ]);
  });

  it('still surfaces exercise count when strength has no load', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'STRENGTH',
        duration: 1800,
        rpe: 6,
        strengthSets: [{ exercise: 'Squat' }, { exercise: 'Press' }],
      }),
    );

    expect(metrics).toEqual([
      { label: 'Durée', value: '30:00', unit: 'min' },
      { label: 'Exercices', value: '2', unit: 'exos' },
      { label: 'RPE', value: '6', unit: '' },
    ]);
  });

  it('omits empty slots rather than inventing values', () => {
    const metrics = buildCompletedSessionMetrics(
      source({
        type: 'RUN',
        duration: 1200,
        runMetrics: { distanceM: null },
      }),
    );

    expect(metrics).toEqual([{ label: 'Durée', value: '20:00', unit: 'min' }]);
  });
});
