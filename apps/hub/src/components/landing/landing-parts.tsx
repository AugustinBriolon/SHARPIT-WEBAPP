import type { ReactNode } from 'react';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { cn } from '@sharpit/app/lib/utils';

export const HEADING = 'font-[family-name:var(--font-heading)] font-semibold tracking-[-0.035em]';
export const DATA = 'font-[family-name:var(--font-data)] tabular-nums';
export const LEAD = 'text-muted-foreground text-lg leading-relaxed text-pretty';
export const RULE = 'border-foreground/15';
export const CONTAINER = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

export function Brand() {
  return (
    <span className="flex items-center gap-2">
      <span className="brand-tile size-7" aria-hidden>
        <BrandMark className="size-3.5" />
      </span>
      <span className={cn(HEADING, 'text-base tracking-tight')}>SharpIt</span>
    </span>
  );
}

type BandTone = 'plain' | 'canvas' | 'night';

const BAND_TONE: Record<BandTone, string> = {
  plain: 'bg-background',
  canvas: 'landing-canvas',
  night: 'landing-night',
};

/** A full-width section on one of the landing's grounds, its content in the reading column. */
export function Band({
  tone = 'plain',
  label,
  className,
  inner,
  children,
  ...rest
}: {
  tone?: BandTone;
  label: string;
  className?: string;
  /** Classes for the column inside the band. */
  inner?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<'section'>, 'aria-label' | 'className' | 'children'>) {
  return (
    <section aria-label={label} className={cn(BAND_TONE[tone], className)} {...rest}>
      <div className={cn(CONTAINER, inner)}>{children}</div>
    </section>
  );
}

/** A section's opening: the label on the rule, then the heading and its lead. */
export function SectionHead({
  label,
  title,
  body,
  className,
}: {
  label: string;
  title: ReactNode;
  body?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-reveal>
        {label}
      </p>
      <h2
        className={cn(HEADING, 'mt-8 max-w-3xl text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[0.98]')}
        data-reveal
      >
        {title}
      </h2>
      {body ? (
        <p className={cn(LEAD, 'mt-6 max-w-2xl')} data-reveal>
          {body}
        </p>
      ) : null}
    </div>
  );
}

/** Words as separate spans, so the manifesto can be read in as the visitor scrolls. */
export function Words({ text }: { text: string }) {
  return text.split(' ').map((word, i) => (
    <span key={i} data-word>
      {word}{' '}
    </span>
  ));
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}
