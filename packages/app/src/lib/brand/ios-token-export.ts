/**
 * Translates the web design tokens into the Swift source consumed by the native
 * iOS client. The web design system is the single source of truth for design
 * values (ADR-041); this module holds the pure translation, and
 * `scripts/export-ios-tokens.ts` is the file-system wrapper around it.
 */

import { SPORT_IDENTITY_HEX } from '../activity/sport-identity';
import { BRAND } from './brand-tokens';

/**
 * Semantic tokens the app renders with, as `[css custom property, Swift name]`.
 *
 * Deliberately narrower than `globals.css`: sidebar and chart-container tokens are
 * web chrome, and exporting them would invite native screens to grow a sidebar.
 */
export const EXPORTED_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['background', 'background'],
  ['foreground', 'foreground'],
  ['card', 'card'],
  ['card-foreground', 'cardForeground'],
  ['popover', 'popover'],
  ['popover-foreground', 'popoverForeground'],
  ['primary', 'primary'],
  ['primary-foreground', 'primaryForeground'],
  ['secondary', 'secondary'],
  ['secondary-foreground', 'secondaryForeground'],
  ['muted', 'muted'],
  ['muted-foreground', 'mutedForeground'],
  ['accent', 'accent'],
  ['accent-foreground', 'accentForeground'],
  ['highlight', 'highlight'],
  ['highlight-foreground', 'highlightForeground'],
  ['ink-surface', 'inkSurface'],
  ['ink-surface-foreground', 'inkSurfaceForeground'],
  ['ink-accent', 'inkAccent'],
  ['chip-surface', 'chipSurface'],
  ['inset-group', 'insetGroup'],
  ['track', 'track'],
  ['destructive', 'destructive'],
  ['destructive-foreground', 'destructiveForeground'],
  ['border', 'border'],
  ['input', 'input'],
  ['ring', 'ring'],
  ['analysis-surface', 'analysisSurface'],
  ['analysis-surface-alt', 'analysisSurfaceAlt'],
  ['analysis-border', 'analysisBorder'],
  ['analysis-grid', 'analysisGrid'],
  ['signal-recovery', 'signalRecovery'],
  ['signal-recovery-foreground', 'signalRecoveryForeground'],
  ['signal-base', 'signalBase'],
  ['signal-base-foreground', 'signalBaseForeground'],
  ['signal-tempo', 'signalTempo'],
  ['signal-tempo-foreground', 'signalTempoForeground'],
  ['signal-threshold', 'signalThreshold'],
  ['signal-threshold-foreground', 'signalThresholdForeground'],
  ['signal-vo2', 'signalVo2'],
  ['signal-vo2-foreground', 'signalVo2Foreground'],
  ['signal-neutral', 'signalNeutral'],
  ['signal-neutral-foreground', 'signalNeutralForeground'],
  ['signal-caution', 'signalCaution'],
  ['signal-caution-foreground', 'signalCautionForeground'],
  ['signal-risk', 'signalRisk'],
  ['signal-risk-foreground', 'signalRiskForeground'],
  ['health-status-ok', 'healthStatusOk'],
  ['health-status-ok-foreground', 'healthStatusOkForeground'],
  ['health-status-watch', 'healthStatusWatch'],
  ['health-status-watch-foreground', 'healthStatusWatchForeground'],
  ['health-status-verify', 'healthStatusVerify'],
  ['health-status-verify-foreground', 'healthStatusVerifyForeground'],
  ['health-status-attention', 'healthStatusAttention'],
  ['health-status-attention-foreground', 'healthStatusAttentionForeground'],
  ['record-accent', 'recordAccent'],
  ['record-accent-foreground', 'recordAccentForeground'],
  ['radial-track', 'radialTrack'],
  ['radial-empty', 'radialEmpty'],
];

/**
 * Fixed sport fill + onSport ink/snow pairs (iOS accent/onAccent naming).
 * Values live in `:root` of globals.css and do not flip with appearance.
 */
export const EXPORTED_SPORT_ON: ReadonlyArray<readonly [string, string]> = [
  ['on-sport-run', 'onRun'],
  ['on-sport-bike', 'onBike'],
  ['on-sport-swim', 'onSwim'],
  ['on-sport-strength', 'onStrength'],
  ['on-sport-triathlon', 'onTriathlon'],
  ['on-sport-hike', 'onHike'],
  ['on-sport-other', 'onOther'],
];

/**
 * Geometry exported to `SharpitTokens`, as `[css custom property, Swift name, block]`.
 * Radii live in `@theme inline`; spacing and sizes in `:root` (ADR-085).
 */
export const EXPORTED_GEOMETRY: ReadonlyArray<readonly [string, string, '@theme inline' | ':root']> =
  [
    ['radius-card', 'cardRadius', '@theme inline'],
    ['radius-inset', 'insetRadius', '@theme inline'],
    ['radius-row', 'rowRadius', '@theme inline'],
    ['radius-tile', 'tileRadius', '@theme inline'],
    ['radius-chip', 'chipRadius', '@theme inline'],
    ['space-card', 'cardPadding', ':root'],
    ['space-section', 'sectionGap', ':root'],
    ['space-inset', 'insetPadding', ':root'],
    ['space-row-gap', 'rowGap', ':root'],
    ['space-row-x', 'rowPaddingX', ':root'],
    ['size-tile', 'tileSize', ':root'],
    ['size-chip', 'chipSize', ':root'],
    ['size-control', 'controlHeight', ':root'],
    ['size-row', 'rowHeight', ':root'],
    ['size-bar', 'barThickness', ':root'],
  ];

export type Rgba = { red: number; green: number; blue: number; alpha: number };

// --- CSS parsing -----------------------------------------------------------

/** Custom properties declared directly inside a top-level `selector { … }` block. */
export function readDeclarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`Selector "${selector}" not found in globals.css`);
  }
  const open = css.indexOf('{', start);
  const end = css.indexOf('\n}', open);
  if (end === -1) {
    throw new Error(`Unterminated block for "${selector}"`);
  }

  const body = css.slice(open + 1, end);
  const declarations = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    declarations.set(name, value.trim());
  }
  return declarations;
}

/** Follows `var(--x)` chains until a literal color remains. */
export function resolveVar(
  name: string,
  declarations: Map<string, string>,
  seen = new Set<string>(),
): string {
  if (seen.has(name)) {
    throw new Error(`Circular var reference on --${name}`);
  }
  seen.add(name);

  const raw = declarations.get(name);
  if (raw === undefined) {
    throw new Error(`Missing custom property --${name}`);
  }

  const reference = raw.match(/^var\(--([\w-]+)\)$/);
  return reference ? resolveVar(reference[1], declarations, seen) : raw;
}

// --- Color conversion ------------------------------------------------------

/** sRGB transfer function (linear component → encoded component). */
function encodeGamma(channel: number): number {
  const clamped = Math.min(Math.max(channel, 0), 1);
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

/**
 * OKLab → sRGB, per Björn Ottosson's reference implementation.
 * Out-of-gamut results are clamped per channel by `encodeGamma`; the SHARPIT
 * palette stays inside sRGB, so clamping is a guard rather than a conversion step.
 */
function oklchToRgb(lightness: number, chroma: number, hueDegrees: number): Omit<Rgba, 'alpha'> {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    red: encodeGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: encodeGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    blue: encodeGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function hexToRgb(hex: string): Omit<Rgba, 'alpha'> {
  const digits = hex.slice(1);
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  return {
    red: parseInt(expanded.slice(0, 2), 16) / 255,
    green: parseInt(expanded.slice(2, 4), 16) / 255,
    blue: parseInt(expanded.slice(4, 6), 16) / 255,
  };
}

export function parseColor(value: string): Rgba {
  if (value.startsWith('#')) {
    return { ...hexToRgb(value), alpha: 1 };
  }

  const oklch = value.match(
    /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/,
  );
  if (!oklch) {
    throw new Error(`Unsupported color syntax: "${value}"`);
  }

  const [, lightness, chroma, hue, alphaPercent] = oklch;
  return {
    ...oklchToRgb(Number(lightness), Number(chroma), Number(hue)),
    alpha: alphaPercent === undefined ? 1 : Number(alphaPercent) / 100,
  };
}

// --- Swift emission --------------------------------------------------------

/** Fixed 4 decimals keeps the generated file stable across platforms and Node versions. */
function swiftNumber(value: number): string {
  return value.toFixed(4);
}

function swiftRgba({ red, green, blue, alpha }: Rgba): string {
  return `SharpitRGBA(red: ${swiftNumber(red)}, green: ${swiftNumber(green)}, blue: ${swiftNumber(blue)}, alpha: ${swiftNumber(alpha)})`;
}

function remToPoints(rem: string): number {
  return Number(rem.replace('rem', '')) * 16;
}

/** The `SharpitColor` members, one per exported token, light and dark. */
function renderColorDeclarations(light: Map<string, string>, dark: Map<string, string>): string {
  return EXPORTED_COLORS.map(([cssName, swiftName]) =>
    [
      `    /// \`--${cssName}\``,
      `    static let ${swiftName} = dynamic(`,
      `        light: ${swiftRgba(parseColor(resolveVar(cssName, light)))},`,
      `        dark: ${swiftRgba(parseColor(resolveVar(cssName, dark)))}`,
      `    )`,
    ].join('\n'),
  ).join('\n\n');
}

/** The `SharpitSportColor` fill members, one per activity type. */
function renderSportDeclarations(): string {
  return Object.entries(SPORT_IDENTITY_HEX)
    .map(([type, hex]) =>
      [
        `    /// \`SPORT_IDENTITY_HEX.${type}\` / \`--sport-${type.toLowerCase()}\``,
        `    static let ${type.toLowerCase()} = ${swiftRgba(parseColor(hex))}`,
      ].join('\n'),
    )
    .join('\n\n');
}

/** Fixed onSport foregrounds (ink on endurance sports, snow on the rest). */
function renderSportOnDeclarations(light: Map<string, string>): string {
  return EXPORTED_SPORT_ON.map(([cssName, swiftName]) =>
    [
      `    /// \`--${cssName}\` — text/icon on the matching sport fill`,
      `    static let ${swiftName} = ${swiftRgba(parseColor(resolveVar(cssName, light)))}`,
    ].join('\n'),
  ).join('\n\n');
}

/** The `SharpitTokens` geometry members, in points. */
function renderGeometryDeclarations(css: string): string {
  const blocks = {
    '@theme inline': readDeclarations(css, '@theme inline'),
    ':root': readDeclarations(css, ':root'),
  };
  return EXPORTED_GEOMETRY.map(([cssName, swiftName, block]) =>
    [
      `    /// \`--${cssName}\``,
      `    static let ${swiftName}: CGFloat = ${swiftNumber(remToPoints(resolveVar(cssName, blocks[block])))}`,
    ].join('\n'),
  ).join('\n\n');
}

/** Renders the full generated Swift file from the contents of `globals.css`. */
export function renderIosTokens(css: string): string {
  const light = readDeclarations(css, ':root');
  const colors = renderColorDeclarations(light, readDeclarations(css, '.dark'));
  const sports = renderSportDeclarations();
  const sportOn = renderSportOnDeclarations(light);
  const geometry = renderGeometryDeclarations(css);

  return `// Generated by \`yarn tokens:ios\` in the SHARPIT web repository. Do not edit.
//
// The web design system is the single source of truth for design values (ADR-041).
// To change a color, edit \`src/lib/brand/brand-tokens.ts\` or \`src/app/globals.css\`
// in the SHARPIT repository and re-run the exporter.

import SwiftUI
import UIKit

/// A resolved sRGB color, exported from the web token set.
nonisolated struct SharpitRGBA: Equatable, Sendable {
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double
}

/// Semantic colors, light and dark, mirroring \`:root\` and \`.dark\` in \`globals.css\`.
///
/// \`nonisolated\`, and not by preference: UIKit calls a dynamic color's trait closure on
/// whichever thread resolves it, and SwiftUI resolves colors on its own renderer thread.
/// Under main-actor-by-default the closure — and the lazy init of every constant below —
/// would assert the main queue and trap there. Colors are pure values; they have no
/// business on an actor.
nonisolated enum SharpitColor {
${colors}

    static func dynamic(light: SharpitRGBA, dark: SharpitRGBA) -> Color {
        Color(uiColor: UIColor { traits in
            let token = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: token.red,
                green: token.green,
                blue: token.blue,
                alpha: token.alpha
            )
        })
    }
}

/// Sport identity, from \`SPORT_IDENTITY_HEX\` / \`--sport-*\` — one chromatic family per activity type.
/// Never Lime Pulse: the highlight stays brand punctuation for the product, not for a sport.
/// \`on*\` members are the fixed foreground (ink/snow) for text on that fill — accent/onAccent.
nonisolated enum SharpitSportColor {
${sports}

${sportOn}

    static func color(_ token: SharpitRGBA) -> Color {
        Color(red: token.red, green: token.green, blue: token.blue, opacity: token.alpha)
    }
}

/// Non-color primitives exported from \`brand-tokens.ts\`.
nonisolated enum SharpitTokens {
    /// \`BRAND.radius\` — card and control radius.
    static let radius: CGFloat = ${swiftNumber(remToPoints(BRAND.radius))}

${geometry}
}
`;
}
