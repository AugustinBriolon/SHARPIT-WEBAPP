import { describe, expect, it } from 'vitest';
import type { JournalHabitFinding } from '@sharpit/app/lib/journal/journal-habit-analysis';
import { JOURNAL_ANALYSIS_MIN_DAYS } from '@sharpit/app/lib/journal/journal-limits';
import type { HabitExperimentView } from '@sharpit/app/lib/journal/journal-habit-experiment-view';
import {
  buildTodayJournalHabitBridge,
  formatTodayHabitExperimentBridge,
  formatTodayJournalHabitBridgeCopy,
  JOURNAL_ANALYSES_HREF,
  resolveTodayJournalHabitCallout,
  todayJournalHabitBridgeFromReading,
} from '@sharpit/app/lib/journal/journal-habit-today-bridge';
import { buildJournalHabitReading } from '@sharpit/app/lib/journal/journal-habit-reading';

function runningExperiment(overrides: Partial<HabitExperimentView> = {}): HabitExperimentView {
  return {
    id: 'exp-1',
    factorId: 'device_in_bed',
    title: 'Sans « Écran au lit »',
    status: 'running',
    progressLabel: 'J3 / 7',
    segments: ['held', 'held', 'held', 'pending', 'pending', 'pending', 'pending'],
    heldLabel: '3 jours tenus',
    reviewLabel: 'relecture le mer. 16 sept.',
    verdict: null,
    verdictLabel: null,
    deltaLine: null,
    ...overrides,
  };
}

function finding(
  overrides: Partial<JournalHabitFinding> &
    Pick<JournalHabitFinding, 'factorId' | 'polarity' | 'confidence'>,
): JournalHabitFinding {
  return {
    kind: 'effect',
    yesValues: [],
    noValues: [],
    outcome: 'sleepMinutes',
    nYes: 5,
    nNo: 5,
    medianYes: 360,
    medianNo: 450,
    absDelta: 90,
    lagDays: 0,
    ...overrides,
  };
}

describe('todayJournalHabitBridge', () => {
  it('stays silent before analysis unlock', () => {
    const reading = buildJournalHabitReading(
      [
        finding({
          factorId: 'late_meal',
          polarity: 'minus',
          confidence: 'high',
        }),
      ],
      JOURNAL_ANALYSIS_MIN_DAYS - 1,
    );
    expect(todayJournalHabitBridgeFromReading(reading)).toBeNull();
  });

  it('stays silent when ready but no priority', () => {
    const reading = buildJournalHabitReading([], JOURNAL_ANALYSIS_MIN_DAYS + 2);
    expect(todayJournalHabitBridgeFromReading(reading)).toBeNull();
  });

  it('exposes provenance + complete sentence a new athlete can parse', () => {
    const findings = [
      finding({
        factorId: 'late_meal',
        polarity: 'minus',
        confidence: 'high',
      }),
      finding({
        factorId: 'late_meal',
        polarity: 'minus',
        confidence: 'high',
        outcome: 'recoveryScore',
        medianYes: 50,
        medianNo: 70,
        absDelta: 20,
      }),
    ];
    const bridge = buildTodayJournalHabitBridge(findings, 14);
    expect(bridge).not.toBeNull();
    expect(bridge?.href).toBe(JOURNAL_ANALYSES_HREF);
    expect(bridge?.sourceLabel).toBe('Depuis ton journal');
    expect(bridge?.habitLabel).toBe('Repas tardif');
    expect(bridge?.meaning).toBe(
      'Quand tu notes « Repas tardif », sommeil et récupération sont souvent plus bas.',
    );
    expect(bridge?.disclaimer).toMatch(/pas une preuve/i);
    expect(bridge?.ctaLabel).toBe('Voir l’analyse');
    expect(bridge?.confidenceNote).toBe('Association nette');
  });

  it('keeps sleep before recovery and completes the habit in the sentence', () => {
    const copy = formatTodayJournalHabitBridgeCopy({
      kind: 'compiled',
      companionFactorIds: [],
      factorId: 'device_in_bed',
      polarity: 'minus',
      confidence: 'medium',
      effects: [
        finding({
          factorId: 'device_in_bed',
          polarity: 'minus',
          confidence: 'medium',
          outcome: 'recoveryScore',
          medianYes: 50,
          medianNo: 70,
          absDelta: 20,
        }),
        finding({
          factorId: 'device_in_bed',
          polarity: 'minus',
          confidence: 'medium',
        }),
      ],
    });
    expect(copy.sourceLabel).toBe('Depuis ton journal');
    expect(copy.habitLabel).toBe('Écran au lit');
    expect(copy.meaning).toBe(
      'Quand tu notes « Écran au lit », sommeil et récupération sont souvent plus bas.',
    );
    expect(copy.confidenceNote).toBe('À confirmer');
  });
});

describe('formatTodayHabitExperimentBridge', () => {
  it('exposes glanceable habit + day track fields, not a review paragraph', () => {
    const copy = formatTodayHabitExperimentBridge(runningExperiment());
    expect(copy.sourceLabel).toBe('Test');
    expect(copy.meaning).toBe('Sans « Écran au lit »');
    expect(copy.habitLabel).toBe('Écran au lit');
    expect(copy.progressLabel).toBe('J3 / 7');
    expect(copy.heldLabel).toBe('3 jours tenus');
    expect(copy.segments).toEqual([
      'held',
      'held',
      'held',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(copy.segmentsLabel).toMatch(/relecture/);
    expect(copy.ctaLabel).toBe('Voir le test');
    expect(copy.href).toBe(JOURNAL_ANALYSES_HREF);
    expect(copy.factorId).toBe('device_in_bed');
  });
});

describe('resolveTodayJournalHabitCallout', () => {
  const bridge = buildTodayJournalHabitBridge(
    [
      finding({
        factorId: 'late_meal',
        polarity: 'minus',
        confidence: 'high',
      }),
    ],
    14,
  );

  it('prefers a running test over the association insight', () => {
    const callout = resolveTodayJournalHabitCallout(runningExperiment(), bridge);
    expect(callout?.kind).toBe('experiment');
    if (callout?.kind === 'experiment') {
      expect(callout.experiment.meaning).toBe('Sans « Écran au lit »');
    }
  });

  it('falls back to the association when no test is running', () => {
    const callout = resolveTodayJournalHabitCallout(null, bridge);
    expect(callout?.kind).toBe('association');
    if (callout?.kind === 'association') {
      expect(callout.bridge.habitLabel).toBe('Repas tardif');
    }
  });

  it('stays silent when neither test nor association is available', () => {
    expect(resolveTodayJournalHabitCallout(null, null)).toBeNull();
  });
});
