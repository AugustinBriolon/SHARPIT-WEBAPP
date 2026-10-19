import { describe, expect, it } from 'vitest';
import { englishCopy, englishDeep } from './translate-copy';

describe('englishCopy', () => {
  it('translates a known French string', () => {
    expect(englishCopy('Prudence')).toBe('Caution');
    expect(englishCopy('Journée légère')).toBe('Light day');
  });

  it('fills a template, translating its parts', () => {
    expect(englishCopy("Repos aujourd'hui. Course au programme demain")).toBe(
      'Rest today. Run on the programme tomorrow',
    );
    expect(englishCopy('Index de fatigue : 42')).toBe('Fatigue index: 42');
  });

  it('translates joined sentences and « · » parts one by one', () => {
    expect(englishCopy('Journée légère · Prudence')).toBe('Light day · Caution');
    expect(englishCopy('Baisse l’intensité de la séance prévue. Un vrai repos aujourd’hui.')).toBe(
      'Lower the intensity of the planned session. Real rest today.',
    );
  });

  it('leaves unknown text, numbers and identifiers alone', () => {
    expect(englishCopy('Rien de connu ici')).toBe('Rien de connu ici');
    expect(englishCopy('2026-10-19')).toBe('2026-10-19');
    expect(englishCopy('TRAIN_EASY')).toBe('TRAIN_EASY');
  });
});

describe('englishDeep', () => {
  it('translates string values, never keys', () => {
    expect(englishDeep({ Prudence: 'Prudence', list: ['Journée légère', 3, null] })).toEqual({
      Prudence: 'Caution',
      list: ['Light day', 3, null],
    });
  });
});

describe('dates', () => {
  it('turns French date words into English next to a day number', () => {
    expect(englishCopy('jeudi 12 oct.')).toBe('Thursday 12 Oct');
    expect(englishCopy('1er mars')).toBe('1 March');
    expect(englishCopy('Mars')).toBe('Mars');
  });
});
