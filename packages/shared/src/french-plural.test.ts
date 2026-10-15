import { describe, expect, it } from 'vitest';
import {
  expandFrenchCountSuffixes,
  formatJours,
  formatSeances,
  frenchCount,
} from '@sharpit/shared/french-plural';

describe('frenchCount', () => {
  it('uses singular for 0 and 1, plural from 2', () => {
    expect(frenchCount(0, 'jour', 'jours')).toBe('0 jour');
    expect(frenchCount(1, 'jour', 'jours')).toBe('1 jour');
    expect(frenchCount(2, 'jour', 'jours')).toBe('2 jours');
    expect(frenchCount(6, 'jour', 'jours')).toBe('6 jours');
  });
});

describe('formatJours / formatSeances', () => {
  it('formats jour and séance', () => {
    expect(formatJours(1)).toBe('1 jour');
    expect(formatJours(6)).toBe('6 jours');
    expect(formatSeances(1)).toBe('1 séance');
    expect(formatSeances(3)).toBe('3 séances');
  });
});

describe('expandFrenchCountSuffixes', () => {
  it('expands jour(s) and séance(s) after a count', () => {
    expect(expandFrenchCountSuffixes('6 jour(s) de récupération')).toBe('6 jours de récupération');
    expect(expandFrenchCountSuffixes('1 jour(s) à risque en moins')).toBe(
      '1 jour à risque en moins',
    );
    expect(expandFrenchCountSuffixes('2 séance(s) planifiée(s)')).toBe('2 séances planifiée(s)');
  });
});
