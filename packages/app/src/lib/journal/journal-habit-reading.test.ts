import { describe, expect, it } from 'vitest';
import type { JournalHabitFinding } from '@sharpit/app/lib/journal/journal-habit-analysis';
import { buildJournalHabitReading } from '@sharpit/app/lib/journal/journal-habit-reading';

function finding(
  overrides: Partial<JournalHabitFinding> &
    Pick<JournalHabitFinding, 'factorId' | 'polarity' | 'confidence'>,
): JournalHabitFinding {
  return {
    kind: 'effect',
    yesValues: [],
    noValues: [],
    outcome: 'sleepMinutes',
    nYes: 6,
    nNo: 6,
    medianYes: 360,
    medianNo: 450,
    absDelta: 90,
    lagDays: 0,
    ...overrides,
  };
}

describe('buildJournalHabitReading', () => {
  it('returns empty reading when no findings', () => {
    const reading = buildJournalHabitReading([], 14);
    expect(reading.empty).toBe(true);
    expect(reading.headline).toMatch(/rien|aucune/i);
    expect(reading.priority).toBeNull();
    expect(reading.highlights).toHaveLength(0);
    expect(reading.supportsExperiment).toBe(false);
  });

  it('picks the strongest eligible high signal and celebrates lifts in strengths', () => {
    const findings = [
      finding({
        factorId: 'yoga',
        polarity: 'plus',
        confidence: 'high',
        outcome: 'recoveryScore',
        medianYes: 70,
        medianNo: 55,
        absDelta: 15,
      }),
      finding({
        factorId: 'device_in_bed',
        polarity: 'minus',
        confidence: 'high',
      }),
      finding({
        factorId: 'device_in_bed',
        polarity: 'minus',
        confidence: 'high',
        outcome: 'recoveryScore',
        medianYes: 40,
        medianNo: 70,
        absDelta: 30,
      }),
      finding({
        factorId: 'late_meal',
        polarity: 'minus',
        confidence: 'medium',
      }),
    ];
    const reading = buildJournalHabitReading(findings, 14);
    expect(reading.empty).toBe(false);
    expect(reading.netCount).toBe(2);
    expect(reading.weakCount).toBe(1);
    expect(reading.priority?.factorId).toBe('device_in_bed');
    expect(reading.priority?.title).toMatch(/sommeil et récupération/);
    expect(reading.strengths.some((item) => item.factorId === 'yoga')).toBe(true);
    expect(reading.highlights[0]?.polarity).toBe('plus');
    expect(reading.supportsExperiment).toBe(true);
    expect(reading.actionHint.toLowerCase()).toMatch(/sans|7 jours|teste/);
  });

  it('does not offer an experiment CTA on a medium-only piste', () => {
    const reading = buildJournalHabitReading(
      [
        finding({
          factorId: 'alcohol',
          polarity: 'minus',
          confidence: 'medium',
          lagDays: 1,
        }),
      ],
      10,
    );
    expect(reading.netCount).toBe(0);
    expect(reading.weakCount).toBe(1);
    expect(reading.priority?.factorId).toBe('alcohol');
    expect(reading.supportsExperiment).toBe(false);
    expect(reading.actionHint.toLowerCase()).toMatch(/fragile|noter/);
    expect(reading.headline.toLowerCase()).toMatch(/piste|fragile|confirmer/);
  });

  it('never promotes an exploratory supplement as the priority lever', () => {
    const reading = buildJournalHabitReading(
      [
        finding({
          factorId: 'probiotic',
          polarity: 'minus',
          confidence: 'high',
          absDelta: 56,
        }),
        finding({
          factorId: 'late_meal',
          polarity: 'minus',
          confidence: 'medium',
          absDelta: 45,
        }),
      ],
      7,
    );
    expect(reading.priority?.factorId).toBe('late_meal');
    expect(reading.supportsExperiment).toBe(false);
  });

  it('surfaces a favourable habit when that is all the mirror has', () => {
    const reading = buildJournalHabitReading(
      [
        finding({
          factorId: 'yoga',
          polarity: 'plus',
          confidence: 'high',
          outcome: 'recoveryScore',
          medianYes: 75,
          medianNo: 55,
          absDelta: 20,
        }),
      ],
      21,
    );
    expect(reading.priority?.factorId).toBe('yoga');
    expect(reading.priority?.polarity).toBe('plus');
    expect(reading.verdict.toLowerCase()).toMatch(/plus|tient|yoga/);
    expect(reading.supportsExperiment).toBe(true);
    expect(reading.actionHint.toLowerCase()).toMatch(/garde/);
  });

  it('names the lever and its size in the verdict, with counts in the summary', () => {
    const reading = buildJournalHabitReading(
      [
        finding({ factorId: 'alcohol', polarity: 'minus', confidence: 'high' }),
        {
          ...finding({ factorId: 'alcohol', polarity: 'minus', confidence: 'high' }),
          outcome: 'recoveryScore',
          medianYes: 41,
          medianNo: 58,
          absDelta: 17,
        },
        finding({ factorId: 'late_meal', polarity: 'minus', confidence: 'medium' }),
      ],
      48,
    );

    expect(reading.verdict).toBe(
      'Ton écart le plus net : « Alcool », 1 h 30 de sommeil et 17 points de récupération en moins.',
    );
    expect(reading.summary).toBe('48 jours analysés · 1 association nette · 1 à confirmer');
  });
});
