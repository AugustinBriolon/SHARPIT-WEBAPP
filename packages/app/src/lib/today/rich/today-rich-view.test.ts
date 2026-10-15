import { describe, expect, it } from 'vitest';
import {
  buildProgressionSummary,
  buildTopActionLine,
  canTrainHardAnswer,
  trajectoryEyebrow,
  verdictHeadline,
} from './today-rich-view';

describe('today-rich-view', () => {
  it('buildTopActionLine resolves verb and focus', () => {
    const line = buildTopActionLine({
      verbCode: 'reasoning.topAction.trainSmart.verb',
      focusCode: 'reasoning.topAction.trainSmart.focus',
      rationaleCode: 'reasoning.topAction.trainSmart.rationale',
      expectedBenefit: 0.5,
    });
    expect(line).toContain('Entraîne-toi');
  });

  it('verdictHeadline is honest when not actionable', () => {
    expect(verdictHeadline('TRAIN_HARD', false)).toBe('Pas encore de verdict fiable');
    expect(verdictHeadline('TRAIN_HARD', true)).toBe('Entraîne-toi fort');
  });

  it('canTrainHardAnswer maps verdicts', () => {
    expect(canTrainHardAnswer('RECOVER', true)).toContain('Non');
    expect(canTrainHardAnswer('TRAIN_HARD', true)).toContain('Oui');
    expect(canTrainHardAnswer('TRAIN_HARD', false)).toContain('pas encore');
  });

  it('buildProgressionSummary handles insufficient adaptation', () => {
    const summary = buildProgressionSummary(null, 120);
    expect(summary.detail).toBe('120 TSS cette semaine');
  });

  it('buildProgressionSummary names adaptation in the headline', () => {
    const summary = buildProgressionSummary(
      {
        adaptationIndex: 34,
        adaptationStatus: 'PLATEAUING',
        adaptationTrend: 'STABLE',
      },
      159,
    );
    expect(summary.headline).toContain('Adaptation');
    expect(summary.headline).toContain('Plateau');
    expect(summary.headline).toContain('34');
    expect(summary.detail).toBe('159 TSS cette semaine');
  });

  it('trajectoryEyebrow uses a concrete 14-day framing', () => {
    expect(trajectoryEyebrow('MORNING')).toBe('14 derniers jours');
    expect(trajectoryEyebrow('SESSION_COMPLETED')).toContain('14');
  });
});
