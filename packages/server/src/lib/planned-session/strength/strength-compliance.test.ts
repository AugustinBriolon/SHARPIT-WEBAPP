import { describe, expect, it } from 'vitest';
import {
  applyStrengthScoringGuards,
  computeStrengthCompliance,
  formatStrengthCompliance,
} from '@sharpit/server/lib/planned-session/strength/strength-compliance';
import type { SessionAnalysis } from '@sharpit/app/lib/validators/coach';

const PRESCRIBED = [
  { exercise: 'Pont fessier avec élastique', sets: 3, reps: 15 },
  { exercise: 'Clamshell avec élastique', sets: 3, reps: 15 },
  { exercise: 'Gainage planche', sets: 3, reps: 0, durationSec: 30 },
];

describe('computeStrengthCompliance', () => {
  it('scores a full execution at 100 regardless of how long it took', () => {
    const compliance = computeStrengthCompliance(PRESCRIBED, [
      { exercise: 'Pont fessier élastique', sets: 3, reps: 15 },
      { exercise: 'Clamshell élastique', sets: 3, reps: 15 },
      { exercise: 'Planche', sets: 3, reps: 0, durationSec: 30 },
    ]);
    expect(compliance?.score).toBe(100);
    expect(compliance?.missing).toEqual([]);
  });

  it('drops the score when an exercise is skipped', () => {
    const compliance = computeStrengthCompliance(PRESCRIBED, [
      { exercise: 'Pont fessier élastique', sets: 3, reps: 15 },
      { exercise: 'Clamshell élastique', sets: 3, reps: 15 },
    ]);
    expect(compliance?.matchedCount).toBe(2);
    expect(compliance?.missing).toEqual(['Gainage planche']);
    expect(compliance?.score).toBeLessThan(100);
    expect(compliance?.score).toBeGreaterThan(50);
  });

  it('accounts for reduced volume on a matched exercise', () => {
    const compliance = computeStrengthCompliance(
      [PRESCRIBED[0]],
      [{ exercise: 'Pont fessier élastique', sets: 1, reps: 15 }],
    );
    expect(compliance?.volumeRatio).toBeCloseTo(0.33, 1);
    expect(compliance?.score).toBeLessThan(100);
  });

  it('does not penalise extra work beyond the prescription', () => {
    const compliance = computeStrengthCompliance(
      [PRESCRIBED[0]],
      [
        { exercise: 'Pont fessier élastique', sets: 5, reps: 20 },
        { exercise: 'Squat', sets: 3, reps: 10 },
      ],
    );
    expect(compliance?.score).toBe(100);
    expect(compliance?.extra).toEqual(['Squat']);
  });

  it('measures nothing when one side is empty', () => {
    expect(computeStrengthCompliance(PRESCRIBED, [])).toBeNull();
    expect(computeStrengthCompliance([], [{ exercise: 'Squat', sets: 3, reps: 10 }])).toBeNull();
  });
});

describe('formatStrengthCompliance', () => {
  it('states coverage, volume and score without mentioning duration', () => {
    const compliance = computeStrengthCompliance(PRESCRIBED, [
      { exercise: 'Pont fessier élastique', sets: 3, reps: 15 },
    ]);
    const text = formatStrengthCompliance(compliance!);
    expect(text).toContain('1/3');
    expect(text).toContain('hors durée');
    expect(text).not.toMatch(/min\b/);
  });
});

describe('applyStrengthScoringGuards', () => {
  const analysis = (over: Partial<SessionAnalysis> = {}): SessionAnalysis => ({
    complianceScore: 70,
    verdict: 'SHORTER',
    summary: 'Séance réalisée',
    remarks: [],
    recommendation: 'Continue',
    physicalReassessments: [],
    ...over,
  });

  it('lifts a strength score up to the structural floor', () => {
    const compliance = computeStrengthCompliance(PRESCRIBED, [
      { exercise: 'Pont fessier élastique', sets: 3, reps: 15 },
      { exercise: 'Clamshell élastique', sets: 3, reps: 15 },
      { exercise: 'Planche', sets: 3, reps: 0, durationSec: 30 },
    ]);
    const guarded = applyStrengthScoringGuards(analysis(), 'STRENGTH', compliance);
    expect(guarded.complianceScore).toBe(100);
    expect(guarded.verdict).toBe('AS_PLANNED');
  });

  it('keeps a higher AI score than the structural one', () => {
    const compliance = computeStrengthCompliance(PRESCRIBED, [
      { exercise: 'Pont fessier élastique', sets: 3, reps: 15 },
    ]);
    const guarded = applyStrengthScoringGuards(
      analysis({ complianceScore: 90, verdict: 'AS_PLANNED' }),
      'STRENGTH',
      compliance,
    );
    expect(guarded.complianceScore).toBe(90);
  });

  it('never calls a session different when its score says it was followed', () => {
    const guarded = applyStrengthScoringGuards(
      analysis({ complianceScore: 98, verdict: 'DIFFERENT' }),
      'STRENGTH',
      null,
    );
    expect(guarded.verdict).toBe('AS_PLANNED');
    const low = applyStrengthScoringGuards(
      analysis({ complianceScore: 55, verdict: 'DIFFERENT' }),
      'STRENGTH',
      null,
    );
    expect(low.verdict).toBe('DIFFERENT');
  });

  it('rewrites duration verdicts even without realized sets', () => {
    const guarded = applyStrengthScoringGuards(analysis({ complianceScore: 60 }), 'STRENGTH', null);
    expect(guarded.verdict).toBe('DIFFERENT');
    expect(guarded.complianceScore).toBe(60);
  });

  it('leaves endurance sessions untouched', () => {
    const guarded = applyStrengthScoringGuards(analysis(), 'RUN', null);
    expect(guarded.verdict).toBe('SHORTER');
    expect(guarded.complianceScore).toBe(70);
  });
});
