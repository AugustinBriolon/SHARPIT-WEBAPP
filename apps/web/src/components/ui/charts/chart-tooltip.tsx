import { cn } from '@sharpit/app/lib/utils';

/** Recharts tooltip shell — the ink bubble of the references (ADR-085). */
export function ChartTooltipCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'surface-ink rounded-xl px-3 py-2 text-xs font-semibold tabular-nums shadow-none [--color-muted-foreground:color-mix(in_oklch,var(--color-ink-surface-foreground)_70%,transparent)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
