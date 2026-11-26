import { describe, expect, it } from 'vitest';
import { LANDING_GATE_RULE_COUNT } from '@sharpit/app/lib/landing/landing-copy';
import { COMPETITORS } from './seo-competitors';
import { GUIDES } from './seo-guides';
import { ROUNDUPS } from './seo-roundups';

const copy = JSON.stringify([COMPETITORS, GUIDES, ROUNDUPS]);

describe('the SEO pages copy', () => {
  it('speaks tu, like the landing, the app and the help', () => {
    expect(copy).not.toMatch(/\b(vous|votre|vos)\b/i);
  });

  it('keeps the product facts the landing states', () => {
    expect(copy).toContain(`${LANDING_GATE_RULE_COUNT} règles`);
    expect(copy).not.toMatch(/\b13 règles|Augmenter|à 7h|Bi-directionnelle/);
  });

  it('carries no em dash, invented figure or disparaging word', () => {
    expect(copy).not.toMatch(/—|< 2 %|95 %|10 à 20 fois|30 %|catastrophique|punitive|boîte noire/i);
    expect(copy).not.toMatch(/indépendant|honnête|rebutant|sans blesser|protège votre corps/i);
  });
});
