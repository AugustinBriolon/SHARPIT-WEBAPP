import { describe, expect, it } from 'vitest';

import { formatFuelDensityReference, formatMacroGPerKg } from './fuel-density-display';

describe('formatMacroGPerKg', () => {
  it('formats with two decimal places in French locale', () => {
    expect(formatMacroGPerKg(1.83)).toBe('1,83');
  });
});

describe('formatFuelDensityReference', () => {
  it('formats reference weight without float noise', () => {
    expect(formatFuelDensityReference(81.082)).toBe('Réf. 81,1 kg · dernière pesée');
  });
});
