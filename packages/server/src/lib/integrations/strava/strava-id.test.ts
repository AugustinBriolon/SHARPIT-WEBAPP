import { describe, expect, it } from 'vitest';
import { stravaIdString } from './strava';

describe('stravaIdString', () => {
  it('prefers id_str, which is exact beyond 2^53', () => {
    // 9007199254740993 === 2^53 + 1, which a JS number cannot hold.
    expect(stravaIdString({ id: 9007199254740992, id_str: '9007199254740993' })).toBe(
      '9007199254740993',
    );
  });

  it('falls back to String(id) while id_str is absent', () => {
    expect(stravaIdString({ id: 12345678 })).toBe('12345678');
  });
});
