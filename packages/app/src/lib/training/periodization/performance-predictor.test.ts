import { describe, expect, it } from 'vitest';
import {
  estimateFtp,
  estimateRunThresholdPace,
  fmtPaceSecPerKm,
  predictionToRaceGoalDefaults,
  predictRunRaces,
  type RunPrediction,
} from './performance-predictor';
import type {
  PowerCurvePoint,
  RecordEntry,
  RunBestCategory,
} from '@sharpit/app/lib/training/records/record-types';

function entry(value: number): RecordEntry {
  return {
    rank: 1,
    value,
    displayValue: '',
    sublabel: null,
    activityId: null,
    date: '2026-01-01',
    title: null,
  };
}

function runBest(meters: number, seconds: number, label: string): RunBestCategory {
  return { meters, label, entries: [entry(seconds)] };
}

function power(seconds: number, watts: number): PowerCurvePoint {
  return { seconds, label: '', watts, activityId: null, date: '2026-01-01', title: null };
}

describe('predictionToRaceGoalDefaults', () => {
  it('préremplit un objectif course à partir d’une prédiction', () => {
    const prediction: RunPrediction = {
      meters: 10000,
      label: '10 km',
      seconds: 2535,
      displayTime: '42:15',
      paceSecPerKm: 253,
      pace: '4:13/km',
      referenceLabel: '10 km',
      confidence: 'high',
    };

    expect(predictionToRaceGoalDefaults(prediction)).toEqual({
      title: '10 km · 42:15',
      kind: 'RACE',
      raceFormat: '10 km',
      targetPerformance: '42:15',
      notes: 'Projection SharpIt · 4:13/km · base 10 km',
      priority: 'B',
    });
  });
});

describe('predictRunRaces', () => {
  it('renvoie une liste vide sans référence', () => {
    expect(predictRunRaces([])).toEqual([]);
  });

  it('prédit un marathon plus lent que la référence 10k (Riegel)', () => {
    // 10 km en 40:00 (2400 s) → marathon attendu > 40 min, allure plus lente.
    const preds = predictRunRaces([runBest(10000, 2400, '10 km')]);
    const marathon = preds.find((p) => p.meters === 42195)!;
    const ten = preds.find((p) => p.meters === 10000)!;
    expect(marathon.seconds).toBeGreaterThan(ten.seconds);
    expect(marathon.paceSecPerKm).toBeGreaterThan(ten.paceSecPerKm);
  });

  it('redonne ~la référence pour la même distance', () => {
    const preds = predictRunRaces([runBest(10000, 2400, '10 km')]);
    const ten = preds.find((p) => p.meters === 10000)!;
    expect(ten.seconds).toBeCloseTo(2400, -1);
    expect(ten.confidence).toBe('high');
  });
});

describe('estimateRunThresholdPace', () => {
  it('renvoie null sans référence', () => {
    expect(estimateRunThresholdPace([])).toBeNull();
  });

  it('renvoie une allure plausible (s/km positive)', () => {
    const pace = estimateRunThresholdPace([runBest(10000, 2400, '10 km')]);
    expect(pace).not.toBeNull();
    expect(pace!).toBeGreaterThan(180);
    expect(pace!).toBeLessThan(600);
  });

  it("n'est pas tirée vers le bas par un long run facile proche de 15 km", () => {
    const pace = estimateRunThresholdPace(
      [runBest(10000, 2781, '10 km'), runBest(21097, 5958, 'Semi')],
      [{ meters: 15064.88, seconds: 4793 }],
    );
    expect(pace).not.toBeNull();
    expect(pace!).toBeLessThan(300);
    expect(fmtPaceSecPerKm(pace!)).toBe('4:37/km');
  });

  it("n'est pas dégradée par un 10 km rapide juste sous la bande", () => {
    // Le 10 km est hors bande (< 10,5 km) mais à moins de 15 % du 11,14 km.
    // Dédupliquer avant de filtrer le faisait éliminer la seule bonne référence
    // de la bande, ne laissant que la sortie longue lente.
    const efforts = [
      { meters: 11140, seconds: 3354 }, // 5:01/km
      { meters: 13010, seconds: 4568 }, // 5:51/km, sortie longue
    ];
    const bests = [runBest(10000, 2953, '10 km')]; // 4:55/km

    const withoutBests = estimateRunThresholdPace([], efforts);
    const withBests = estimateRunThresholdPace(bests, efforts);

    expect(fmtPaceSecPerKm(withoutBests!)).toBe('5:06/km');
    // Ajouter une référence plus rapide ne doit jamais ralentir l'estimation.
    expect(withBests!).toBeLessThanOrEqual(withoutBests!);
  });
});

describe('estimateFtp', () => {
  it('renvoie null sans point exploitable', () => {
    expect(estimateFtp([])).toBeNull();
  });

  it('applique le facteur 0.95 au meilleur 20 min', () => {
    const ftp = estimateFtp([power(1200, 300)]);
    expect(ftp).toEqual({
      watts: 285,
      source: 'meilleur 20 min',
      effort: { watts: 300, seconds: 1200, date: '2026-01-01', activityId: null },
    });
  });

  it("préfère le meilleur 60 min s'il existe", () => {
    const ftp = estimateFtp([power(3600, 250), power(1200, 300)]);
    expect(ftp?.source).toBe('meilleur 60 min');
  });
});

describe('fmtPaceSecPerKm', () => {
  it('formate min:ss/km', () => {
    expect(fmtPaceSecPerKm(245)).toBe('4:05/km');
  });
});
