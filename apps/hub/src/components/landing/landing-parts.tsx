import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { cn } from '@sharpit/app/lib/utils';

export const HEADING = 'font-[family-name:var(--font-heading)] font-medium tracking-[-0.03em]';
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

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}
