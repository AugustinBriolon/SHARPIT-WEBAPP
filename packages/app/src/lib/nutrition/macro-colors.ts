export type MacroKind = 'protein' | 'carbs' | 'fat';

export const MACRO_COLORS: Record<
  MacroKind,
  { bar: string; text: string; dot: string; track: string; ring: string }
> = {
  protein: {
    bar: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
    track: 'bg-sky-500/20',
    ring: 'stroke-sky-500',
  },
  carbs: {
    bar: 'bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-400',
    track: 'bg-amber-400/25',
    ring: 'stroke-amber-400',
  },
  fat: {
    bar: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
    track: 'bg-rose-500/20',
    ring: 'stroke-rose-500',
  },
};

/**
 * Same three hues as `MACRO_COLORS`, as raw CSS values for SVG contexts
 * (Recharts fill/stroke) that can't consume Tailwind utility classes.
 * `--color-*` are Tailwind v4's own generated theme variables, so this can
 * never drift from the `bg-sky-500` etc. used everywhere else for macros.
 */
export const MACRO_CSS_COLOR: Record<MacroKind, string> = {
  protein: 'var(--color-sky-500)',
  carbs: 'var(--color-amber-400)',
  fat: 'var(--color-rose-500)',
};

export const CALORIE_RING = {
  bar: 'bg-primary',
  track: 'bg-primary/15',
  ring: 'stroke-primary',
  text: 'text-foreground',
} as const;

export const MACRO_LABELS: Record<MacroKind, string> = {
  protein: 'Protéines',
  carbs: 'Glucides',
  fat: 'Lipides',
};

export const MACRO_SHORT: Record<MacroKind, string> = {
  protein: 'P',
  carbs: 'G',
  fat: 'L',
};
