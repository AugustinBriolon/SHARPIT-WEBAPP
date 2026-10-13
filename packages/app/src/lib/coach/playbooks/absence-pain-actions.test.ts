import { describe, expect, it } from 'vitest';
import {
  isPlaybookAction,
  playbookSuggestsRegenerateWeek,
  playbookTrainingConstraint,
} from './absence-pain-actions';

describe('absence-pain playbook actions', () => {
  it('recognises typed actions', () => {
    expect(isPlaybookAction('LIGHTEN')).toBe(true);
    expect(isPlaybookAction('SKIP')).toBe(false);
  });

  it('maps capacity for lighten and pause only', () => {
    expect(playbookTrainingConstraint('LIGHTEN')).toBe('REDUCED');
    expect(playbookTrainingConstraint('PAUSE')).toBe('NONE');
    expect(playbookTrainingConstraint('CONTINUE')).toBeNull();
  });

  it('flags regenerate when load path changes', () => {
    expect(playbookSuggestsRegenerateWeek('RESTART')).toBe(true);
    expect(playbookSuggestsRegenerateWeek('CONTINUE')).toBe(false);
  });
});
