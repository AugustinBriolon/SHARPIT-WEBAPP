import { describe, expect, it } from 'vitest';
import {
  describeDistributionOverlap,
  formatCompiledJournalHabitFinding,
  formatJournalHabitFinding,
  formatLagLabel,
  formatMediansLine,
  formatOutcomeValue,
  formatSignedDelta,
} from '@sharpit/app/lib/journal/journal-habit-finding-copy';

describe('journal-habit-finding-copy', () => {
  it('formats an association (not causation) with median and confidence', () => {
    const copy = formatJournalHabitFinding({
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
    });
    expect(copy.title).toContain('Écran au lit');
    expect(copy.title).toContain('sommeil');
    expect(copy.detail).toContain('Médiane');
    expect(copy.detail).toContain('6 h 00');
    expect(copy.confidenceLabel).toBe('Association nette');
  });

  it('mentions lag when outcome is shifted', () => {
    const copy = formatJournalHabitFinding({
      kind: 'effect',
      yesValues: [],
      noValues: [],
      factorId: 'alcohol',
      outcome: 'sleepMinutes',
      nYes: 5,
      nNo: 5,
      medianYes: 340,
      medianNo: 460,
      absDelta: 120,
      polarity: 'minus',
      confidence: 'high',
      lagDays: 1,
    });
    expect(copy.detail).toContain('lendemain');
  });

  it('joins sleep and recovery into one title', () => {
    const copy = formatCompiledJournalHabitFinding({
      kind: 'compiled',
      companionFactorIds: [],
      factorId: 'device_in_bed',
      polarity: 'minus',
      confidence: 'high',
      effects: [
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
      ],
    });
    expect(copy.title).toBe('Écran au lit · sommeil et récupération plus bas');
    expect(copy.detail).toContain('sommeil');
    expect(copy.detail).toContain('récupération');
  });

  it('signs gaps in the outcome unit with a typographic minus', () => {
    expect(formatSignedDelta('sleepMinutes', -52)).toBe('−52′');
    expect(formatSignedDelta('sleepMinutes', 65)).toBe('+1 h 05');
    expect(formatSignedDelta('recoveryScore', 14)).toBe('+14');
    expect(formatSignedDelta('bodyBattery', -17.4)).toBe('−17');
  });

  it('shows the measurement shift in one form only', () => {
    expect(formatLagLabel(1)).toBe('mesure +1 j');
    expect(formatLagLabel(0)).toBeNull();
  });

  it('writes the overlap sentence from the days, not a canned line', () => {
    const base = {
      kind: 'effect' as const,
      factorId: 'alcohol',
      outcome: 'sleepMinutes' as const,
      nYes: 4,
      nNo: 4,
      medianYes: 372,
      medianNo: 424,
      noValues: [424, 410, 440, 430],
      absDelta: 52,
      polarity: 'minus' as const,
      confidence: 'high' as const,
      lagDays: 1,
    };

    expect(describeDistributionOverlap({ ...base, yesValues: [350, 372, 380, 430] })).toBe(
      '1 jour sur 4 avec l’habitude atteint la médiane sans : l’écart est net, mais la règle n’est pas absolue.',
    );
    expect(describeDistributionOverlap({ ...base, yesValues: [350, 372, 380, 360] })).toBe(
      'Les 4 jours avec l’habitude sont tous sous la médiane sans : l’écart est net et régulier.',
    );
    expect(formatMediansLine({ ...base, yesValues: [] })).toBe('sans 7 h 04 → avec 6 h 12');
  });
});

describe('formatOutcomeValue', () => {
  it('rounds sleep to the minute before splitting hours', () => {
    expect(formatOutcomeValue('sleepMinutes', 479.6)).toBe('8 h 00');
    expect(formatOutcomeValue('sleepMinutes', 408.2)).toBe('6 h 48');
  });
});
