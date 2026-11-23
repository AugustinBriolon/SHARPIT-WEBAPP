import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { CarnetCount } from './carnet-animated';
import { CarnetIntentLink } from './carnet-intent-link';

/**
 * The carnet's page grammar (ADR-109, drawn in Clinique since ADR-135): a page is a title and
 * a lead on one white sheet, then sections read top down, each parted from the last by a
 * hairline (`CarnetSection`). No buttons — figures, sentences and the occasional chart.
 */

export function CarnetPage({
  back,
  kicker,
  title,
  status,
  lead,
  aside,
  top,
  side,
  children,
}: {
  /** The page one level up, named: always above the title, where the eye starts. */
  back?: { href: string; label: string };
  kicker: ReactNode;
  title: ReactNode;
  /** The page's status, as a pill beside its title (ADR-130: a word, never a tint alone). */
  status?: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  /** What spans the sheet's width above the columns: a chart too wide for one of them. */
  top?: ReactNode;
  /** A second column beside the sections on a wide screen; under them on a narrow one. */
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="pb-24">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pb-8">
        <div className="max-w-2xl min-w-0">
          {back ? (
            <CarnetStepLink className="mb-4 -ml-2.5" direction="back" href={back.href}>
              {back.label}
            </CarnetStepLink>
          ) : null}
          <p className="text-label text-muted-foreground">{kicker}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-page-title first-letter:uppercase">{title}</h1>
            {status}
          </div>
          {lead ? (
            <div className="text-muted-foreground mt-3 text-base leading-relaxed">{lead}</div>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      {top}
      {side ? (
        // A side with nothing to show (every section of it absent) gives the width back.
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:has-[>aside:empty]:block">
          <div className="min-w-0 lg:pr-10">{children}</div>
          <aside className="lg:border-border min-w-0 empty:hidden lg:border-l lg:pl-10">
            {side}
          </aside>
        </div>
      ) : (
        children
      )}
    </article>
  );
}

/** One reading under a hairline: its name above, its verdict as the title, the reading below. */
export function CarnetSection({
  label,
  title,
  children,
  className,
}: {
  label: string;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-border min-w-0 space-y-6 border-t py-8', className)} data-reveal>
      <header>
        <p className="text-label text-muted-foreground">{label}</p>
        {title ? <h2 className="text-card-title mt-1.5">{title}</h2> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * One cell of a page laid out as a grid of widgets (ADR-144): a tinted tile on the sheet, its
 * name in a quiet line, then the widget. Never inside another tile.
 */
export function Tile({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('bg-background flex min-w-0 flex-col gap-5 rounded-3xl p-6', className)}
      data-reveal
    >
      <h2 className="text-label">{title}</h2>
      {children}
    </section>
  );
}

export function Figure({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string | null;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="mt-1.5">
        <span className={cn('text-instrument text-2xl font-medium tabular-nums', tone)}>
          {typeof value === 'string' || typeof value === 'number' ? (
            <CarnetCount text={String(value)} />
          ) : (
            value
          )}
        </span>
        {unit ? <span className="text-muted-foreground text-data ml-1 text-xs">{unit}</span> : null}
        {hint ? <p className="text-muted-foreground mt-1 text-xs leading-snug">{hint}</p> : null}
      </dd>
    </div>
  );
}

export function Figures({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4', className)}>{children}</dl>
  );
}

/** Lines of reasoning, as the server wrote them. */
export function Reasons({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-2 text-sm leading-relaxed">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-3">
          <span className="bg-muted-foreground/50 mt-2 size-1 shrink-0 rounded-full" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm leading-relaxed">{children}</p>;
}

/** Where an action would sit: it happens in the iPhone app, never here. */
export function InApp({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground border-border/70 border-l-2 py-0.5 pl-3 text-xs leading-relaxed">
      {children} se fait dans l&apos;app SharpIt sur iPhone.
    </p>
  );
}

/**
 * A line of a list that opens a page of the carnet, or reads in place when it has none.
 * Under the pointer it lights, its arrow (`RowArrow`) leans toward where it goes.
 */
export function ReadingRow({ href, children }: { href: string | null; children: ReactNode }) {
  const inner = <div className="flex items-baseline justify-between gap-6 py-3">{children}</div>;
  if (!href) {
    return <li>{inner}</li>;
  }
  return (
    <li>
      <CarnetIntentLink
        className="pressable-lg group hover:bg-muted/40 -mx-3 block rounded-md px-3"
        href={href}
      >
        {inner}
      </CarnetIntentLink>
    </li>
  );
}

export function RowArrow() {
  return (
    <span
      className="text-muted-foreground inline-block transition-transform duration-200 ease-out group-hover:translate-x-1 motion-reduce:transition-none"
      aria-hidden
    >
      →
    </span>
  );
}

export function ReadingList({ children }: { children: ReactNode }) {
  return <ul className="divide-border/60 divide-y">{children}</ul>;
}

export function Unreadable({ what }: { what: string }) {
  return <Quiet>{what} n&apos;a pas pu être lu pour le moment.</Quiet>;
}

/**
 * A step to another page: back up (`back`, the page above) or along (`next`). A quiet pill
 * whose chevron leans the way it goes under the pointer; the whole pill takes the click.
 */
export function CarnetStepLink({
  href,
  direction,
  className,
  children,
}: {
  href: string;
  direction: 'back' | 'next';
  className?: string;
  children: ReactNode;
}) {
  const Chevron = direction === 'back' ? ChevronLeft : ChevronRight;
  return (
    <Link
      href={href}
      className={cn(
        'group text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:ring-ring inline-flex h-8 w-fit items-center gap-1 rounded-full px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
        direction === 'next' && 'flex-row-reverse',
        className,
      )}
    >
      <Chevron
        strokeWidth={1.75}
        className={cn(
          'size-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
          direction === 'back' ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5',
        )}
        aria-hidden
      />
      {children}
    </Link>
  );
}

const STATUS_PILL = {
  good: 'bg-(--status-good) border-(--status-good-border) text-(--status-good-foreground)',
  watch: 'bg-(--status-watch) border-(--status-watch-border) text-(--status-watch-foreground)',
  alert: 'bg-(--status-alert) border-(--status-alert-border) text-(--status-alert-foreground)',
  unknown:
    'bg-(--status-unknown) border-(--status-unknown-border) text-(--status-unknown-foreground)',
  protect:
    'bg-(--status-protect) border-(--status-protect-border) text-(--status-protect-foreground)',
} as const;

export type StatusTone = keyof typeof STATUS_PILL;

/** A status, always said with a word (ADR-130): the tint never carries it alone. */
export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        // One line, cut with an ellipsis when its place is narrower than its word.
        'inline-block h-6 max-w-full truncate rounded-(--shape-pill) border px-2.5 text-xs leading-[1.375rem] font-medium',
        STATUS_PILL[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Lines of reasoning counted 01, 02…, each on its own hairline: the order is the argument. */
export function NumberedReasons({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <ol className="divide-border divide-y">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex items-baseline gap-4 py-3.5">
          <span className="text-data text-muted-foreground text-xs">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-[0.9375rem] leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** One measure on a line: its name, its value, what it is read against, its status. */
export function MeasureRow({
  label,
  value,
  unit,
  against,
  status,
}: {
  label: string;
  value: ReactNode;
  unit?: string | null;
  against?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <span className="min-w-32 flex-1 text-[0.9375rem]">{label}</span>
      <span className="text-instrument text-[0.9375rem]">
        {value}
        {unit ? (
          <span className="text-muted-foreground ml-1 text-xs font-normal">{unit}</span>
        ) : null}
      </span>
      <span className="text-muted-foreground w-full text-xs sm:w-40 sm:text-[0.8125rem]">
        {against}
      </span>
      <span className="flex sm:w-28 sm:justify-end">{status}</span>
    </li>
  );
}
