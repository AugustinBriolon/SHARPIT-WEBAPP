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

  it('ignores a cursor that is not a date', () => {
    expect(activityDateWindow(undefined, new Date('nope'))).toBeUndefined();
  });
});
