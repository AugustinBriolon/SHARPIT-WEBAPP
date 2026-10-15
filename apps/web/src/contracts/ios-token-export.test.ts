import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND } from '@sharpit/app/lib/brand/brand-tokens';
import {
  EXPORTED_COLORS,
  EXPORTED_SPORT_ON,
  parseColor,
  readDeclarations,
  renderIosTokens,
  resolveVar,
  type Rgba,
} from '@sharpit/app/lib/brand/ios-token-export';

const GLOBALS_CSS = readFileSync(
  resolve(process.cwd(), '../../packages/ui/src/styles/globals.css'),
  'utf8',
);

function toHex({ red, green, blue }: Rgba): string {
  const channel = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

describe('parseColor', () => {
  // The OKLCH values in globals.css were authored from the hex primitives in
  // brand-tokens.ts. Round-tripping them back to hex is what proves the
  // conversion is the web's color and not merely a plausible green.
  it('converts the OKLCH canvas back to Snow White', () => {
    expect(toHex(parseColor('oklch(0.99 0.007 106.5)'))).toBe(BRAND.snowWhite);
  });

  it('converts the OKLCH ink back to Forest Depths', () => {
    expect(toHex(parseColor('oklch(0.315 0.073 139)'))).toBe(BRAND.forestDepths);
  });

  it('converts the OKLCH highlight back to Lime Pulse', () => {
    expect(toHex(parseColor('oklch(0.936 0.13 126.6)'))).toBe(BRAND.limePulse);
  });

  it('reads the percentage alpha used by border and input tokens', () => {
    expect(parseColor('oklch(0.315 0.073 139 / 12%)').alpha).toBeCloseTo(0.12, 5);
  });

  it('expands three-digit hex', () => {
    expect(parseColor('#fff')).toEqual({ red: 1, green: 1, blue: 1, alpha: 1 });
  });

  it('clamps a chroma that falls outside sRGB rather than emitting a negative channel', () => {
    const { red, green, blue } = parseColor('oklch(0.6 0.37 140)');
    for (const channel of [red, green, blue]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it('rejects a syntax it cannot faithfully convert', () => {
    expect(() => parseColor('rgb(28 58 19)')).toThrow(/Unsupported color syntax/);
  });
});

describe('resolveVar', () => {
  it('follows a var() chain to the literal value', () => {
    const declarations = new Map([
      ['signal-base', 'var(--chart-2)'],
      ['chart-2', 'oklch(0.48 0.13 142)'],
    ]);
    expect(resolveVar('signal-base', declarations)).toBe('oklch(0.48 0.13 142)');
  });

  it('refuses a circular reference instead of recursing forever', () => {
    const declarations = new Map([
      ['a', 'var(--b)'],
      ['b', 'var(--a)'],
    ]);
    expect(() => resolveVar('a', declarations)).toThrow(/Circular var reference/);
  });

  it('names the property that is missing', () => {
    expect(() => resolveVar('nope', new Map())).toThrow(/--nope/);
  });
});

describe('readDeclarations', () => {
  it('reads the light and dark token blocks of globals.css', () => {
    const light = readDeclarations(GLOBALS_CSS, ':root');
    const dark = readDeclarations(GLOBALS_CSS, '.dark');

    expect(light.get('background')).toBe('oklch(0.99 0.007 106.5)');
    expect(dark.get('background')).toBe('oklch(0.22 0.045 139)');
  });

  it('fails loudly when a block is renamed', () => {
    expect(() => readDeclarations(GLOBALS_CSS, '.light')).toThrow(/not found/);
  });
});

describe('renderIosTokens', () => {
  const swift = renderIosTokens(GLOBALS_CSS);

  it('declares every exported token in both themes', () => {
    for (const [cssName, swiftName] of EXPORTED_COLORS) {
      expect(swift).toContain(`/// \`--${cssName}\``);
      expect(swift).toContain(`static let ${swiftName} = dynamic(`);
    }
    expect(swift.match(/static let \w+ = dynamic\(/g)).toHaveLength(EXPORTED_COLORS.length);
  });

  it('exports the brand radius in points', () => {
    expect(swift).toContain('static let radius: CGFloat = 16.0000');
  });

  it('emits fixed-precision literals so the committed file is stable', () => {
    expect(swift).not.toMatch(/red: \d+\.\d{5,}/);
  });

  it('is deterministic', () => {
    expect(renderIosTokens(GLOBALS_CSS)).toBe(swift);
  });

  it('exports fixed onSport foregrounds (accent/onAccent) for every sport', () => {
    for (const [cssName, swiftName] of EXPORTED_SPORT_ON) {
      expect(swift).toContain(`/// \`--${cssName}\``);
      expect(swift).toContain(`static let ${swiftName} =`);
    }
    expect(swift).toContain('static let onRun =');
    expect(swift).toContain('static let onStrength =');
  });

  it('exports destructiveForeground and signal caution/risk foregrounds', () => {
    expect(swift).toContain('static let destructiveForeground = dynamic(');
    expect(swift).toContain('static let signalCautionForeground = dynamic(');
    expect(swift).toContain('static let signalRiskForeground = dynamic(');
    expect(swift).toContain('static let recordAccentForeground = dynamic(');
  });
});
