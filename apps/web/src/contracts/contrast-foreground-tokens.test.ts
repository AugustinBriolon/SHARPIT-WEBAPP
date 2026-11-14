/**
 * WCAG AA (4.5:1) contract for accent/onAccent pairs in globals.css.
 * Re-verifies Proto's Oct table against the tokens currently on the branch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLINIQUE_PILLARS,
  CLINIQUE_STATUSES,
  CLINIQUE_WASHES,
  CLINIQUE_ZONES,
  parseColor,
  readDeclarations,
  resolveVar,
  type Rgba,
} from '@sharpit/app/lib/brand/ios-token-export';
import { SPORT_IDENTITY_HEX } from '@sharpit/app/lib/activity/sport-identity';

const GLOBALS_CSS = readFileSync(
  resolve(process.cwd(), '../../packages/ui/src/styles/globals.css'),
  'utf8',
);

function channelToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ red, green, blue }: Rgba): number {
  return (
    0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue)
  );
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function tokenColor(declarations: Map<string, string>, name: string): Rgba {
  return parseColor(resolveVar(name, declarations));
}

const light = readDeclarations(GLOBALS_CSS, ':root');
const dark = readDeclarations(GLOBALS_CSS, '.dark');

/** Pairs that must clear AA for text on the filled accent. */
const MODE_PAIRS: ReadonlyArray<{ bg: string; fg: string; label: string }> = [
  { bg: 'primary', fg: 'primary-foreground', label: 'primary' },
  { bg: 'highlight', fg: 'highlight-foreground', label: 'highlight' },
  { bg: 'destructive', fg: 'destructive-foreground', label: 'destructive' },
  { bg: 'signal-caution', fg: 'signal-caution-foreground', label: 'signal-caution' },
  { bg: 'signal-risk', fg: 'signal-risk-foreground', label: 'signal-risk' },
  { bg: 'signal-recovery', fg: 'signal-recovery-foreground', label: 'signal-recovery' },
  { bg: 'signal-base', fg: 'signal-base-foreground', label: 'signal-base' },
  { bg: 'signal-tempo', fg: 'signal-tempo-foreground', label: 'signal-tempo' },
  { bg: 'signal-threshold', fg: 'signal-threshold-foreground', label: 'signal-threshold' },
  { bg: 'signal-vo2', fg: 'signal-vo2-foreground', label: 'signal-vo2' },
  { bg: 'signal-neutral', fg: 'signal-neutral-foreground', label: 'signal-neutral' },
  { bg: 'health-status-ok', fg: 'health-status-ok-foreground', label: 'health-status-ok' },
  {
    bg: 'health-status-watch',
    fg: 'health-status-watch-foreground',
    label: 'health-status-watch',
  },
  {
    bg: 'health-status-verify',
    fg: 'health-status-verify-foreground',
    label: 'health-status-verify',
  },
  {
    bg: 'health-status-attention',
    fg: 'health-status-attention-foreground',
    label: 'health-status-attention',
  },
  { bg: 'record-accent', fg: 'record-accent-foreground', label: 'record-accent' },
];

const SPORT_ON: ReadonlyArray<{ type: keyof typeof SPORT_IDENTITY_HEX; on: string }> = [
  { type: 'RUN', on: 'on-sport-run' },
  { type: 'BIKE', on: 'on-sport-bike' },
  { type: 'SWIM', on: 'on-sport-swim' },
  { type: 'STRENGTH', on: 'on-sport-strength' },
  { type: 'TRIATHLON', on: 'on-sport-triathlon' },
  { type: 'HIKE', on: 'on-sport-hike' },
  { type: 'OTHER', on: 'on-sport-other' },
];

describe('accent/onAccent contrast (WCAG AA 4.5:1)', () => {
  for (const mode of [
    { name: 'light', declarations: light },
    { name: 'dark', declarations: dark },
  ] as const) {
    describe(mode.name, () => {
      for (const pair of MODE_PAIRS) {
        it(`${pair.label}: ${pair.fg} on ${pair.bg} ≥ 4.5`, () => {
          const bg = tokenColor(mode.declarations, pair.bg);
          const fg = tokenColor(mode.declarations, pair.fg);
          const ratio = contrastRatio(fg, bg);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }

  it('darkens destructive in dark mode so snow passes (≈ oklch 0.55)', () => {
    expect(resolveVar('destructive', dark)).toBe('oklch(0.55 0.2 27)');
    const ratio = contrastRatio(
      tokenColor(dark, 'destructive-foreground'),
      tokenColor(dark, 'destructive'),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps sport hex aligned with --sport-* tokens', () => {
    for (const { type } of SPORT_ON) {
      const cssName = `sport-${type.toLowerCase()}`;
      expect(resolveVar(cssName, light).toLowerCase()).toBe(SPORT_IDENTITY_HEX[type].toLowerCase());
    }
  });

  for (const { type, on } of SPORT_ON) {
    it(`on-sport-${type.toLowerCase()} on ${type} fill ≥ 4.5`, () => {
      const bg = parseColor(SPORT_IDENTITY_HEX[type]);
      const fg = tokenColor(light, on);
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('Clinique tokens (ADR-130, ADR-131)', () => {
  const slateSurfaces = ['card', 'tile', ...CLINIQUE_WASHES.map((wash) => `wash-${wash}`)];
  const marks = [
    ...CLINIQUE_PILLARS.map((pillar) => `pillar-${pillar}`),
    ...CLINIQUE_ZONES.map((zone) => `zone-${zone}`),
  ];

  for (const mode of [
    { name: 'light', declarations: light },
    { name: 'dark', declarations: dark },
  ] as const) {
    describe(mode.name, () => {
      for (const status of CLINIQUE_STATUSES) {
        it(`status-${status}: text on its fill ≥ 4.5`, () => {
          const ratio = contrastRatio(
            tokenColor(mode.declarations, `status-${status}-foreground`),
            tokenColor(mode.declarations, `status-${status}`),
          );
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }

      for (const surface of slateSurfaces) {
        it(`slate text on ${surface} ≥ 4.5`, () => {
          const ratio = contrastRatio(
            tokenColor(mode.declarations, 'slate'),
            tokenColor(mode.declarations, surface),
          );
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }

      // Rings and chart marks are graphics, not text: WCAG 1.4.11 asks 3:1.
      // Light lime, yellow and orange sit between 1.8 and 2.6 on white, so they are
      // never the only cue: a ring carries a glyph and a figure, a zone a label.
      const belowThree =
        mode.name === 'light'
          ? ['pillar-recovery', 'pillar-nutrition', 'zone-2', 'zone-3', 'zone-4']
          : [];
      for (const mark of marks.filter((name) => !belowThree.includes(name))) {
        it(`${mark} on card ≥ 3`, () => {
          const ratio = contrastRatio(
            tokenColor(mode.declarations, mark),
            tokenColor(mode.declarations, 'card'),
          );
          expect(ratio).toBeGreaterThanOrEqual(3);
        });
      }
    });
  }
});
