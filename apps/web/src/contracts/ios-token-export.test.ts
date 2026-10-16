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
  it('reads hex tokens exactly', () => {
    const { red, green, blue } = parseColor(BRAND.lime);
    expect([red, green, blue].map((c) => Math.round(c * 255))).toEqual([0xcd, 0xf2, 0x1e]);
  });

  it('converts a neutral OKLCH lightness to a grey', () => {
    const { red, green, blue } = parseColor('oklch(0.5 0 0)');
    expect(red).toBeCloseTo(green, 3);
    expect(green).toBeCloseTo(blue, 3);
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

    expect(light.get('background')).toBe(BRAND.canvas);
    expect(dark.get('background')).toBe(BRAND.canvasDark);
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

  it('exports the card geometry in points', () => {
    expect(swift).toContain('static let cardRadius: CGFloat = 28.0000');
    expect(swift).toContain('static let cardPadding: CGFloat = 24.0000');
    expect(swift).toContain('static let controlHeight: CGFloat = 52.0000');
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
