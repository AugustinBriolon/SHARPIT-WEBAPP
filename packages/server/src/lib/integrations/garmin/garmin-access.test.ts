import { afterEach, describe, expect, it } from 'vitest';
import { canUseGarminPersonalKey } from './garmin-access';

const ORIGINAL = process.env.GARMIN_PERSONAL_KEY_ATHLETES;

afterEach(() => {
  process.env.GARMIN_PERSONAL_KEY_ATHLETES = ORIGINAL;
});

describe('canUseGarminPersonalKey', () => {
  it('opens the key form to listed athletes only', () => {
    process.env.GARMIN_PERSONAL_KEY_ATHLETES = 'default, beta-1';
    expect(canUseGarminPersonalKey('default')).toBe(true);
    expect(canUseGarminPersonalKey('beta-1')).toBe(true);
    expect(canUseGarminPersonalKey('someone-else')).toBe(false);
  });

  it('is closed to everyone when the list is unset or empty', () => {
    delete process.env.GARMIN_PERSONAL_KEY_ATHLETES;
    expect(canUseGarminPersonalKey('default')).toBe(false);
    process.env.GARMIN_PERSONAL_KEY_ATHLETES = '';
    expect(canUseGarminPersonalKey('')).toBe(false);
  });
});
