import { describe, expect, it } from 'vitest';
import { isDerivedFromProduce, produceFor } from './produce-reference';

describe('produceFor', () => {
  it('reads the whole query, plural or accented, as a fruit or vegetable', () => {
    expect(produceFor('Bananes')?.codes[0]).toBe(13005);
    expect(produceFor('pêche')?.codes[0]).toBe(13193);
    expect(produceFor('  Citron vert ')?.codes[0]).toBe(13067);
  });

  it('keeps « pomme » apart from « pomme de terre » and from a longer phrase', () => {
    expect(produceFor('pomme')?.codes[0]).toBe(13620);
    expect(produceFor('pomme de terre')?.codes[0]).toBe(4008);
    expect(produceFor('pomme golden')).toBeNull();
    expect(produceFor('jus de pomme')).toBeNull();
    expect(produceFor('skyr')).toBeNull();
  });
});

describe('isDerivedFromProduce', () => {
  const banana = 90.5;

  it('lets a plain fruit through, whatever its brand', () => {
    expect(isDerivedFromProduce({ name: 'Bananes', kcalPer100g: 89 }, banana)).toBe(false);
    expect(isDerivedFromProduce({ name: 'Banane bio', kcalPer100g: 95 }, banana)).toBe(false);
  });

  it('flags what is made from the fruit by its name', () => {
    expect(isDerivedFromProduce({ name: 'Nectar de banane', kcalPer100g: 60 }, banana)).toBe(true);
    expect(isDerivedFromProduce({ name: "Jus d'orange", kcalPer100g: 45 }, 45.5)).toBe(true);
    expect(isDerivedFromProduce({ name: 'Yaourt saveur banane', kcalPer100g: 90 }, banana)).toBe(
      true,
    );
  });

  it('flags a « Banane » whose energy is not a banana’s', () => {
    expect(isDerivedFromProduce({ name: 'Banane', kcalPer100g: 520 }, banana)).toBe(true);
    expect(isDerivedFromProduce({ name: 'Concombre', kcalPer100g: 15 }, 16)).toBe(false);
  });
});
