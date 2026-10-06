import { describe, expect, it } from 'vitest';
import { formatCountable, parseCountable } from './carnet-count';

describe('parseCountable', () => {
  it('reads the number a figure carries, and how it is written', () => {
    const shape = parseCountable('62,5');
    expect(shape).toMatchObject({ value: 62.5, decimals: 1, decimalMark: ',' });
    expect(formatCountable(shape!, 12.25)).toBe('12,3');
  });

  it('keeps the text around the number and its thousands spaces', () => {
    const shape = parseCountable('+1 234 kcal');
    expect(shape).toMatchObject({ before: '+', value: 1234, after: ' kcal' });
    expect(formatCountable(shape!, 987)).toBe('+987 kcal');
    expect(formatCountable(shape!, 4321)).toBe('+4 321 kcal');
  });

  it('keeps the minus the server wrote', () => {
    const shape = parseCountable('−12');
    expect(formatCountable(shape!, -3)).toBe('−3');
    expect(formatCountable(shape!, 0)).toBe('0');
  });

  it('leaves alone a text with no number or with two', () => {
    expect(parseCountable('—')).toBeNull();
    expect(parseCountable('1:23')).toBeNull();
    expect(parseCountable('7 h 30')).toBeNull();
  });
});
