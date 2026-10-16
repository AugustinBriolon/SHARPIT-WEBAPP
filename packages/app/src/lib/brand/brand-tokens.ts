/**
 * SHARPIT brand primitives — "Ink & Lime" (ADR-085).
 * Semantic signal colors (--signal-*) stay in globals.css; they are data, not brand.
 *
 * Mapping:
 * - ink → --foreground, --primary, --ink-surface (titles, figures, primary CTA, icon tiles)
 * - lime → --highlight (progress fill, PR pills, check boxes, gauge tail, chart line)
 * - limeSoft / limeSoftInk → --accent (delta pills such as "↑ 8 vs avg")
 *
 * Cohesion rule: the product is monochrome; lime is the only hue and it marks
 * progress or achievement. Sport and intensity read from icons and the
 * ink→lime ramp, never from a rainbow.
 */
export const BRAND = {
  /** Titles, figures, primary button, icon tiles, numbered chips, tooltips */
  ink: '#0e0e0e',
  /** The one accent — progress, records, the active part of a gauge */
  lime: '#cdf21e',
  /** Soft lime wash behind delta pills */
  limeSoft: '#ecfac0',
  /** Text on the soft lime wash */
  limeSoftInk: '#4f6b00',
  /** Page canvas — cool off-white, cards are pure white on it */
  canvas: '#f7f8fa',
  /** Dark page canvas */
  canvasDark: '#0b0b0c',
  /** Card surface */
  card: '#ffffff',
  /** Dark card surface */
  cardDark: '#161618',
  /** Inset group container holding white rows */
  insetGroup: '#f4f4f2',
  /** Neutral chip, segmented track, secondary button */
  chip: '#f2f2f2',
  /** Progress, ring and gauge tracks */
  track: '#ebebeb',
  /** Secondary text — subtitles, units, labels (AA on white) */
  muted: '#737378',
  /** Control radius (buttons, rows) */
  radius: '1rem',
  /** Card radius */
  cardRadius: '1.75rem',
} as const;

export type BrandToken = keyof typeof BRAND;
