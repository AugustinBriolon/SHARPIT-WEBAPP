import { describe, expect, it } from 'vitest';
import { carnetPageIndex, headingBetween, isCurrentPage } from './carnet-pages';

describe('carnet pages', () => {
  it('marks a page current on itself and on the pages under it', () => {
    expect(isCurrentPage('/seances/abc', '/seances')).toBe(true);
    expect(isCurrentPage('/seances', '/')).toBe(false);
    expect(isCurrentPage('/', '/')).toBe(true);
    expect(isCurrentPage('/saisonnier', '/saison')).toBe(false);
  });

  it('places a path along the row, Compte last', () => {
    expect(carnetPageIndex('/')).toBe(0);
    expect(carnetPageIndex('/seances/abc')).toBe(3);
    expect(carnetPageIndex('/compte/sources')).toBe(7);
  });

  it('says which way the reader heads along the row', () => {
    expect(headingBetween(null, '/corps')).toBe(0);
    expect(headingBetween('/', '/corps')).toBe(1);
    expect(headingBetween('/corps', '/saison')).toBe(-1);
    expect(headingBetween('/seances', '/seances/abc')).toBe(0);
  });
});
