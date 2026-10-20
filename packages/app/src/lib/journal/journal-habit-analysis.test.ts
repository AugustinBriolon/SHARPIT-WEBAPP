import { describe, expect, it } from 'vitest';
import {
  applyPlausibilityToEffect,
  buildJournalHabitFindings,
  collapseRedundantRecoveryFindings,
  compileJournalHabitFindings,
  compareFactorOutcome,
  dropContradictoryFactorFindings,
  median,
  NET_FALSE_DISCOVERY_RATE,
  outcomeLagDays,
  scoreObservationConfidence,
  shiftTrainingDayId,
  type FactorOutcomeEffect,
  type JournalAnalysisDay,
  type JournalHabitFinding,
} from '@sharpit/app/lib/journal/journal-habit-analysis';

function day(
  id: string,
  factor: 'yes' | 'no' | null,
  sleep: number | null,
  {
    recovery = 60,
    factorId = 'device_in_bed',
  }: { recovery?: number | null; factorId?: string } = {},
): JournalAnalysisDay {
  return {
    trainingDayId: id,
    factors: factor === null ? {} : { [factorId]: factor },
    sleepMinutes: sleep,
    recoveryScore: recovery,
    bodyBattery: recovery,
  };
}

describe('journal-habit-analysis', () => {
  it('uses median, lag 0 for the night just noted and +1 for a habit of the day', () => {
    expect(median([10, 30, 20])).toBe(20);
    expect(outcomeLagDays('device_in_bed')).toBe(0);
    expect(outcomeLagDays('late_meal')).toBe(0);
    expect(outcomeLagDays('shared_bed')).toBe(0);
    expect(outcomeLagDays('melatonin')).toBe(0);
    expect(outcomeLagDays('alcohol')).toBe(1);
    // A supplement or a cold shower can only show on the next morning.
    expect(outcomeLagDays('omega3')).toBe(1);
    expect(outcomeLagDays('cold_shower')).toBe(1);
    expect(outcomeLagDays('fever')).toBe(0);
  });

  it('compares median sleep with vs without habit (association)', () => {
    const days = [
      day('2026-09-01', 'yes', 360),
      day('2026-09-02', 'yes', 350),
      day('2026-09-03', 'yes', 370),
      day('2026-09-04', 'yes', 340),
      day('2026-09-05', 'yes', 355),
      day('2026-09-06', 'yes', 365),
      day('2026-09-07', 'no', 480),
      day('2026-09-08', 'no', 470),
      day('2026-09-09', 'no', 490),
      day('2026-09-10', 'no', 460),
      day('2026-09-11', 'no', 475),
      day('2026-09-12', 'no', 485),
    ];
    const result = compareFactorOutcome(days, 'device_in_bed', 'sleepMinutes');
    expect(result).not.toBeNull();
    expect(result!.medianYes).toBeLessThan(result!.medianNo);
    expect(result!.polarity).toBe('minus');
    expect(result!.nYes).toBe(6);
    expect(result!.nNo).toBe(6);
    expect(result!.confidence).toBe('high');
  });

  it('applies alcohol lag +1 against next-day sleep', () => {
    const days: JournalAnalysisDay[] = [
      {
        trainingDayId: '2026-09-01',
        factors: { alcohol: 'yes' },
        sleepMinutes: 500,
        recoveryScore: 80,
        bodyBattery: 80,
      },
      {
        trainingDayId: '2026-09-02',
        factors: { alcohol: 'no' },
        sleepMinutes: 340,
        recoveryScore: 40,
        bodyBattery: 40,
      },
      {
        trainingDayId: '2026-09-03',
        factors: { alcohol: 'yes' },
        sleepMinutes: 490,
        recoveryScore: 78,
        bodyBattery: 78,
      },
      {
        trainingDayId: '2026-09-04',
        factors: { alcohol: 'no' },
        sleepMinutes: 350,
        recoveryScore: 42,
        bodyBattery: 42,
      },
      {
        trainingDayId: '2026-09-05',
        factors: { alcohol: 'yes' },
        sleepMinutes: 480,
        recoveryScore: 76,
        bodyBattery: 76,
      },
      {
        trainingDayId: '2026-09-06',
        factors: { alcohol: 'no' },
        sleepMinutes: 360,
        recoveryScore: 44,
        bodyBattery: 44,
      },
      {
        trainingDayId: '2026-09-07',
        factors: { alcohol: 'yes' },
        sleepMinutes: 470,
        recoveryScore: 74,
        bodyBattery: 74,
      },
      {
        trainingDayId: '2026-09-08',
        factors: { alcohol: 'no' },
        sleepMinutes: 330,
        recoveryScore: 40,
        bodyBattery: 40,
      },
      {
        trainingDayId: '2026-09-09',
        factors: { alcohol: 'yes' },
        sleepMinutes: 460,
        recoveryScore: 72,
        bodyBattery: 72,
      },
      {
        trainingDayId: '2026-09-10',
        factors: { alcohol: 'no' },
        sleepMinutes: 345,
        recoveryScore: 41,
        bodyBattery: 41,
      },
    ];
    // Alcohol yes on odd evenings → next morning sleep is low (even days).
    const result = compareFactorOutcome(days, 'alcohol', 'sleepMinutes');
    expect(shiftTrainingDayId('2026-09-01', 1)).toBe('2026-09-02');
    expect(result).not.toBeNull();
    expect(result!.lagDays).toBe(1);
    expect(result!.medianYes).toBeLessThan(result!.medianNo);
  });

  it('scores high confidence only with enough samples and clear gap', () => {
    expect(
      scoreObservationConfidence({
        nYes: 2,
        nNo: 2,
        absDelta: 50,
        outcome: 'sleepMinutes',
      }),
    ).toBe('none');

    expect(
      scoreObservationConfidence({
        nYes: 3,
        nNo: 3,
        absDelta: 90,
        outcome: 'sleepMinutes',
      }),
    ).toBe('none');

    expect(
      scoreObservationConfidence({
        nYes: 6,
        nNo: 6,
        absDelta: 90,
        outcome: 'sleepMinutes',
      }),
    ).toBe('high');
  });

  it('emits multiple outcomes, skips constants, collapses recovery/BB redundancy', () => {
    const days: JournalAnalysisDay[] = [];
    for (let i = 0; i < 12; i += 1) {
      const screen = i < 6 ? 'yes' : 'no';
      days.push({
        trainingDayId: `2026-09-${String(i + 1).padStart(2, '0')}`,
        factors: {
          device_in_bed: screen,
          creatine: 'yes',
          alcohol: 'no',
        },
        sleepMinutes: screen === 'yes' ? 340 + i : 480 + i,
        recoveryScore: screen === 'yes' ? 40 + i : 75 + i,
        bodyBattery: screen === 'yes' ? 41 + i : 76 + i,
      });
    }

    const findings = buildJournalHabitFindings(days);
    expect(findings.every((f) => f.kind === 'effect')).toBe(true);
    expect(findings.some((f) => f.factorId === 'creatine')).toBe(false);
    expect(findings.some((f) => f.factorId === 'alcohol')).toBe(false);

    const screenFindings = findings.filter((f) => f.factorId === 'device_in_bed');
    expect(screenFindings.some((f) => f.outcome === 'sleepMinutes')).toBe(true);
    const recoveryLike = screenFindings.filter(
      (f) => f.outcome === 'recoveryScore' || f.outcome === 'bodyBattery',
    );
    expect(recoveryLike.length).toBeLessThanOrEqual(1);

    const redundant: JournalHabitFinding[] = [
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'device_in_bed',
        outcome: 'recoveryScore',
        nYes: 5,
        nNo: 5,
        medianYes: 40,
        medianNo: 70,
        absDelta: 30,
        polarity: 'minus',
        confidence: 'high',
        lagDays: 0,
      },
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'device_in_bed',
        outcome: 'bodyBattery',
        nYes: 5,
        nNo: 5,
        medianYes: 42,
        medianNo: 68,
        absDelta: 26,
        polarity: 'minus',
        confidence: 'high',
        lagDays: 0,
      },
    ];
    expect(collapseRedundantRecoveryFindings(redundant)).toHaveLength(1);
  });

  it('compiles sleep + recovery for the same habit into one row', () => {
    const findings: JournalHabitFinding[] = [
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'device_in_bed',
        outcome: 'sleepMinutes',
        nYes: 5,
        nNo: 5,
        medianYes: 360,
        medianNo: 470,
        absDelta: 110,
        polarity: 'minus',
        confidence: 'high',
        lagDays: 0,
      },
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'device_in_bed',
        outcome: 'recoveryScore',
        nYes: 5,
        nNo: 5,
        medianYes: 40,
        medianNo: 70,
        absDelta: 30,
        polarity: 'minus',
        confidence: 'high',
        lagDays: 0,
      },
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'yoga',
        outcome: 'recoveryScore',
        nYes: 5,
        nNo: 5,
        medianYes: 75,
        medianNo: 55,
        absDelta: 20,
        polarity: 'plus',
        confidence: 'high',
        lagDays: 0,
      },
    ];

    const compiled = compileJournalHabitFindings(findings);
    expect(compiled).toHaveLength(2);
    const screen = compiled.find((item) => item.factorId === 'device_in_bed');
    expect(screen?.effects).toHaveLength(2);
    expect(screen?.polarity).toBe('minus');
    expect(compiled.some((item) => item.factorId === 'yoga' && item.polarity === 'plus')).toBe(
      true,
    );
  });

  it('keeps the per-day values behind each median', () => {
    const days = [
      day('2026-09-01', 'yes', 360),
      day('2026-09-02', 'yes', 350),
      day('2026-09-03', 'yes', 370),
      day('2026-09-04', 'no', 480),
      day('2026-09-05', 'no', 470),
      day('2026-09-06', 'no', 490),
    ];

    const effect = compareFactorOutcome(days, 'device_in_bed', 'sleepMinutes');

    expect(effect?.yesValues).toEqual([360, 350, 370]);
    expect(effect?.noValues).toEqual([480, 470, 490]);
    expect(effect?.medianYes).toBe(360);
  });

  it('suppresses short-sample probiotic sleep contrasts via plausibility', () => {
    const base: FactorOutcomeEffect = {
      factorId: 'probiotic',
      outcome: 'sleepMinutes',
      nYes: 4,
      nNo: 3,
      medianYes: 360,
      medianNo: 416,
      yesValues: [360, 350, 370, 355],
      noValues: [400, 416, 430],
      absDelta: 56,
      polarity: 'minus',
      confidence: 'medium',
      lagDays: 0,
      pValue: 0.05,
    };
    expect(applyPlausibilityToEffect(base)).toBeNull();

    const solid = applyPlausibilityToEffect({
      ...base,
      nYes: 6,
      nNo: 6,
      confidence: 'high',
    });
    expect(solid?.confidence).toBe('medium');
  });

  it('drops a habit that both lifts and drags outcomes', () => {
    const findings: JournalHabitFinding[] = [
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'probiotic',
        outcome: 'sleepMinutes',
        nYes: 6,
        nNo: 6,
        medianYes: 360,
        medianNo: 416,
        absDelta: 56,
        polarity: 'minus',
        confidence: 'medium',
        lagDays: 0,
      },
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'probiotic',
        outcome: 'recoveryScore',
        nYes: 6,
        nNo: 6,
        medianYes: 70,
        medianNo: 31,
        absDelta: 39,
        polarity: 'plus',
        confidence: 'medium',
        lagDays: 0,
      },
      {
        kind: 'effect',
        yesValues: [],
        noValues: [],
        factorId: 'late_meal',
        outcome: 'sleepMinutes',
        nYes: 6,
        nNo: 6,
        medianYes: 400,
        medianNo: 460,
        absDelta: 60,
        polarity: 'minus',
        confidence: 'high',
        lagDays: 0,
      },
    ];

    const { kept, incoherentFactorIds } = dropContradictoryFactorFindings(findings);
    expect(incoherentFactorIds).toEqual(['probiotic']);
    expect(kept.map((f) => f.factorId)).toEqual(['late_meal']);
  });
});

/** 40 days from 2026-09-01; `build(i)` gives each day its factors and morning recovery. */
function series(
  build: (i: number) => { factors: Record<string, 'yes' | 'no'>; recovery: number },
): JournalAnalysisDay[] {
  return Array.from({ length: 40 }, (_, i) => {
    const { factors, recovery } = build(i);
    return {
      trainingDayId: shiftTrainingDayId('2026-09-01', i)!,
      factors,
      sleepMinutes: null,
      recoveryScore: recovery,
      bodyBattery: null,
    };
  });
}

describe('journal habit analysis — confounders', () => {
  it('does not blame a cold shower taken after the hard sessions that lower recovery', () => {
    // Hard session every third day; the cold shower follows it; the next morning reads low.
    const hard = (i: number) => i % 3 === 0;
    const days = series((i) => ({
      factors: { cold_shower: hard(i) ? 'yes' : 'no' },
      recovery: hard(i - 1) ? 45 + (i % 4) : 70 + (i % 5),
    }));
    const loadByDay = new Map(
      days.filter((_, i) => hard(i)).map((day) => [day.trainingDayId, 150]),
    );

    const naive = buildJournalHabitFindings(days);
    expect(naive.some((f) => f.factorId === 'cold_shower' && f.polarity === 'minus')).toBe(true);

    const adjusted = buildJournalHabitFindings(days, { loadByDay });
    expect(adjusted.some((f) => f.factorId === 'cold_shower')).toBe(false);
  });

  it('reads one row for supplements always taken together, never as the lever', () => {
    // Four supplements on the same 33 days; recovery is simply lower on those days.
    const taken = (i: number) => i % 6 !== 0;
    const days = series((i) => {
      const state = taken(i) ? 'yes' : 'no';
      return {
        factors: { omega3: state, collagen: state, vitamin_d: state, multivitamin: state },
        recovery: taken(i - 1) ? 52 + (i % 5) : 75 + (i % 4),
      };
    });

    const findings = buildJournalHabitFindings(days);
    const rows = compileJournalHabitFindings(findings);
    expect(rows).toHaveLength(findings.length > 0 ? 1 : 0);
    for (const row of rows) {
      expect([row.factorId, ...row.companionFactorIds].sort()).toEqual([
        'collagen',
        'multivitamin',
        'omega3',
        'vitamin_d',
      ]);
    }
  });

  it('keeps chance gaps out of the net associations when many habits are tested', () => {
    // Twelve habits and recovery drawn independently (mulberry32): every gap is chance. Under
    // that null the false-discovery bar caps runs showing any net row at its rate.
    const habits = [
      'yoga',
      'sauna',
      'mobility',
      'meditation',
      'easy_walk',
      'massage',
      'ice_bath',
      'cold_shower',
      'late_meal',
      'device_in_bed',
      'night_work',
      'shared_bed',
    ];
    const runs = 200;
    let runsWithNet = 0;
    for (let seed = 1; seed <= runs; seed += 1) {
      let state = seed * 2654435761;
      const random = () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const days = series(() => ({
        factors: Object.fromEntries(habits.map((id) => [id, random() > 0.5 ? 'yes' : 'no'])),
        recovery: 50 + Math.round(random() * 30),
      }));
      if (buildJournalHabitFindings(days).some((f) => f.confidence === 'high')) {
        runsWithNet += 1;
      }
    }
    expect(runsWithNet / runs).toBeLessThanOrEqual(NET_FALSE_DISCOVERY_RATE);
  });
});
