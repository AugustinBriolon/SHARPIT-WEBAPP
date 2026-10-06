/**
 * The one number a figure's text carries, so it can count from one value to the next
 * while keeping how the server wrote it: sign, decimals, decimal comma, thousands spaces.
 * A text with no number, or with two (« 1:23 », « 7 h 30 »), is left as it is.
 */
export type CountableText = {
  before: string;
  value: number;
  after: string;
  decimals: number;
  decimalMark: '.' | ',';
  groupMark: string | null;
  /** The minus the server wrote: « \u2212 » or « - ». */
  minus: string;
};

const NUMBER = /[\u2212-]?\d{1,3}(?:[\s\u202f\u00a0]\d{3})+(?:[.,]\d+)?|[\u2212-]?\d+(?:[.,]\d+)?/g;

export function parseCountable(text: string): CountableText | null {
  const matches = [...text.matchAll(NUMBER)];
  if (matches.length !== 1) {
    return null;
  }
  const [match] = matches;
  const [raw] = match;
  const index = match.index ?? 0;
  const groupMark = /\d([\s\u202f\u00a0])\d{3}/.exec(raw)?.[1] ?? null;
  const decimalPart = /[.,](\d+)$/.exec(raw);
  const normalized = raw
    .replace(/[\s\u202f\u00a0]/g, '')
    .replace('\u2212', '-')
    .replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return null;
  }
  return {
    before: text.slice(0, index),
    value,
    after: text.slice(index + raw.length),
    decimals: decimalPart ? decimalPart[1].length : 0,
    decimalMark: raw.includes(',') ? ',' : '.',
    groupMark,
    minus: raw.startsWith('-') ? '-' : '\u2212',
  };
}

/** `value` written the way `shape` was. */
export function formatCountable(shape: CountableText, value: number): string {
  const fixed = Math.abs(value).toFixed(shape.decimals);
  const [whole = '0', fraction] = fixed.split('.');
  const grouped = shape.groupMark ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, shape.groupMark) : whole;
  const sign = value < 0 && Number(fixed) !== 0 ? shape.minus : '';
  const number = fraction ? `${grouped}${shape.decimalMark}${fraction}` : grouped;
  return `${shape.before}${sign}${number}${shape.after}`;
}
