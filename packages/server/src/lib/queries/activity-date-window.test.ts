import { describe, expect, it } from 'vitest';
import { activityDateWindow } from '@sharpit/server/lib/queries';

describe('activityDateWindow', () => {
  it('is unbounded with neither a window nor a cursor', () => {
    expect(activityDateWindow()).toBeUndefined();
  });

  it('pages strictly before the cursor', () => {
    const before = new Date('2026-10-01T00:00:00.000Z');
    expect(activityDateWindow(undefined, before)).toEqual({ lt: before });
  });

  it('bounds a window on both sides', () => {
    const after = new Date('2026-10-12T00:00:00.000Z');
    const before = new Date('2026-10-19T00:00:00.000Z');
    expect(activityDateWindow(undefined, before, after)).toEqual({ gte: after, lt: before });
  });

  it('keeps the later lower bound when a look-back window and an after both apply', () => {
    const after = new Date('2000-01-01T00:00:00.000Z');
    const window = activityDateWindow(7, undefined, after);
    expect(window?.gte?.valueOf()).toBeGreaterThan(after.valueOf());
  });

  it('ignores a cursor that is not a date', () => {
    expect(activityDateWindow(undefined, new Date('nope'))).toBeUndefined();
  });
});
