import { describe, expect, it } from 'vitest';
import {
  hasDeclaredAvailability,
  normalizeTrainingAvailability,
  sanitizeTrainingAvailabilityForPersist,
} from '@sharpit/server/lib/training-availability/parse';
import {
  EMPTY_TRAINING_AVAILABILITY,
  orderWeekdays,
  weekdayLabels,
} from '@sharpit/app/lib/training-availability/types';

describe('normalizeTrainingAvailability', () => {
  it('reads a declared rhythm', () => {
    expect(
      normalizeTrainingAvailability({
        version: 1,
        targetSessionsPerWeek: 4,
        availableWeekdays: [2, 4, 6],
      }),
    ).toEqual({ version: 1, targetSessionsPerWeek: 4, availableWeekdays: [2, 4, 6] });
  });

  // An athlete who predates the column must still get a coach prompt.
  it('degrades anything unreadable to nothing declared', () => {
    for (const raw of [null, undefined, 'nope', 42, []]) {
      expect(normalizeTrainingAvailability(raw)).toEqual(EMPTY_TRAINING_AVAILABILITY);
    }
  });

  it('drops a count outside the plausible range rather than clamping it', () => {
    expect(normalizeTrainingAvailability({ targetSessionsPerWeek: 0 }).targetSessionsPerWeek).toBe(
      null,
    );
    expect(normalizeTrainingAvailability({ targetSessionsPerWeek: 15 }).targetSessionsPerWeek).toBe(
      null,
    );
    expect(
      normalizeTrainingAvailability({ targetSessionsPerWeek: 3.5 }).targetSessionsPerWeek,
    ).toBe(null);
  });

  it('keeps the two answers independent', () => {
    expect(normalizeTrainingAvailability({ targetSessionsPerWeek: 3 })).toEqual({
      version: 1,
      targetSessionsPerWeek: 3,
      availableWeekdays: [],
    });
    expect(normalizeTrainingAvailability({ availableWeekdays: [1] })).toEqual({
      version: 1,
      targetSessionsPerWeek: null,
      availableWeekdays: [1],
    });
  });

  it('discards day values that are not weekdays', () => {
    expect(
      normalizeTrainingAvailability({ availableWeekdays: [1, 7, -1, 'lundi', 2.5, 3] })
        .availableWeekdays,
    ).toEqual([1, 3]);
  });

  it('deduplicates and stores Monday first', () => {
    expect(
      normalizeTrainingAvailability({ availableWeekdays: [0, 6, 1, 1] }).availableWeekdays,
    ).toEqual([1, 6, 0]);
  });
});

describe('sanitizeTrainingAvailabilityForPersist', () => {
  it('lets an explicit null clear the column', () => {
    expect(sanitizeTrainingAvailabilityForPersist(null)).toBeNull();
  });

  it('normalises anything else before it is written', () => {
    expect(
      sanitizeTrainingAvailabilityForPersist({
        targetSessionsPerWeek: 5,
        availableWeekdays: [3, 3],
      }),
    ).toEqual({ version: 1, targetSessionsPerWeek: 5, availableWeekdays: [3] });
  });
});

describe('intensity', () => {
  it('keeps a known intensity and drops an unknown one', () => {
    expect(
      normalizeTrainingAvailability({
        targetSessionsPerWeek: 3,
        availableWeekdays: [2],
        intensity: 'steady',
      }),
    ).toEqual({
      version: 1,
      targetSessionsPerWeek: 3,
      availableWeekdays: [2],
      intensity: 'steady',
    });
    expect(normalizeTrainingAvailability({ availableWeekdays: [2], intensity: 'brutal' })).toEqual({
      version: 1,
      targetSessionsPerWeek: null,
      availableWeekdays: [2],
    });
  });
});

describe('hasDeclaredAvailability', () => {
  it('is false only when neither answer was given', () => {
    expect(hasDeclaredAvailability(EMPTY_TRAINING_AVAILABILITY)).toBe(false);
    expect(
      hasDeclaredAvailability({ version: 1, targetSessionsPerWeek: 3, availableWeekdays: [] }),
    ).toBe(true);
    expect(
      hasDeclaredAvailability({ version: 1, targetSessionsPerWeek: null, availableWeekdays: [5] }),
    ).toBe(true);
  });
});

describe('weekday ordering and labels', () => {
  it('orders Monday first and keeps Sunday last', () => {
    expect(orderWeekdays([0, 3, 1])).toEqual([1, 3, 0]);
  });

  it('labels the days the coach prompt will read', () => {
    expect(weekdayLabels([0, 2, 4])).toEqual(['Mardi', 'Jeudi', 'Dimanche']);
  });
});
