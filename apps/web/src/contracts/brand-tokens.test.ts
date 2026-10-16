import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRAND } from '@sharpit/app/lib/brand/brand-tokens';
import { readDeclarations, resolveVar } from '@sharpit/app/lib/brand/ios-token-export';

const globalsCss = readFileSync(
  join(process.cwd(), '../../packages/ui/src/styles/globals.css'),
  'utf8',
);
const light = readDeclarations(globalsCss, ':root');
const dark = readDeclarations(globalsCss, '.dark');

describe('BRAND tokens (Ink & Lime, ADR-085)', () => {
  it('uses ink for text, primary and icon tiles', () => {
    expect(resolveVar('foreground', light)).toBe(BRAND.ink);
    expect(resolveVar('primary', light)).toBe(BRAND.ink);
    expect(resolveVar('ink-surface', light)).toBe(BRAND.ink);
  });

  it('keeps lime as the one accent in both themes', () => {
    expect(resolveVar('highlight', light)).toBe(BRAND.lime);
    expect(resolveVar('highlight', dark)).toBe(BRAND.lime);
  });

  it('puts white cards on a cool off-white canvas', () => {
    expect(resolveVar('background', light)).toBe(BRAND.canvas);
    expect(resolveVar('card', light)).toBe(BRAND.card);
    expect(resolveVar('background', dark)).toBe(BRAND.canvasDark);
    expect(resolveVar('card', dark)).toBe(BRAND.cardDark);
  });

  it('exposes the inset group, chip and track surfaces', () => {
    expect(resolveVar('inset-group', light)).toBe(BRAND.insetGroup);
    expect(resolveVar('chip-surface', light)).toBe(BRAND.chip);
    expect(resolveVar('track', light)).toBe(BRAND.track);
  });

  it('keeps the control radius at 16 px and the card radius at 28 px', () => {
    expect(BRAND.radius).toBe('1rem');
    expect(BRAND.cardRadius).toBe('1.75rem');
    expect(resolveVar('radius-card', readDeclarations(globalsCss, '@theme inline'))).toBe(
      BRAND.cardRadius,
    );
  });

  it('paints analysis-panel from the themed surface token, never raw white', () => {
    const block = globalsCss.slice(globalsCss.indexOf('@utility analysis-panel'));
    const utility = block.slice(0, block.indexOf('@utility analysis-panel-alt'));
    expect(utility).toContain('background-color: var(--color-analysis-surface)');
    expect(utility).not.toContain('background-color: white');
  });
});
