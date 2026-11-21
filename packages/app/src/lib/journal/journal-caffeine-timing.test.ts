import { describe, expect, it } from 'vitest';
import { lateCoffeeFactor } from './journal-caffeine-timing';

describe('lateCoffeeFactor (ADR-139)', () => {
  const coffee = (lastCoffeeMinute: number | null, nextBedtimeMinute: number | null = null) =>
    lateCoffeeFactor({ caffeineMg: 80, lastCoffeeMinute, nextBedtimeMinute });

  it('reads a coffee against the bedtime of the night after it', () => {
    expect(coffee(16 * 60, 23 * 60)).toBe('yes');
    expect(coffee(10 * 60, 23 * 60)).toBe('no');
    // A bedtime after midnight counts from the evening, not from the morning.
    expect(coffee(17 * 60, 45)).toBe('yes');
    expect(coffee(15 * 60, 45)).toBe('no');
    expect(coffee(14 * 60, 23 * 60 + 30)).toBe('no');
  });

  it('falls back on 14:00 without a bedtime', () => {
    expect(coffee(14 * 60)).toBe('yes');
    expect(coffee(13 * 60 + 59)).toBe('no');
  });

  it('says nothing without caffeine or without a time', () => {
    expect(coffee(null, 23 * 60)).toBeNull();
    expect(
      lateCoffeeFactor({ caffeineMg: 0, lastCoffeeMinute: 16 * 60, nextBedtimeMinute: null }),
    ).toBeNull();
  });
});
