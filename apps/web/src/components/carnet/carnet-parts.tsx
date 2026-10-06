import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { CarnetCount } from './carnet-animated';
import { CarnetIntentLink } from './carnet-intent-link';

/**
 * The carnet's page grammar: a page is a title and a lead, then ruled sections read top
 * down. No cards, no buttons — figures, sentences and the occasional chart.
 */

export function CarnetPage({
  back,
  kicker,
  title,
  lead,
  aside,
  children,
}: {
  /** The page one level up, named: always above the title, where the eye starts. */
  back?: { href: string; label: string };
  kicker: string;
  title: string;
  lead?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="space-y-12 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="max-w-2xl min-w-0">
          {back ? (
            <CarnetStepLink className="mb-4 -ml-2.5" direction="back" href={back.href}>
              {back.label}
            </CarnetStepLink>
          ) : null}
          <p className="text-label text-muted-foreground">{kicker}</p>
          <h1 className="text-page-title mt-2 text-3xl first-letter:uppercase sm:text-4xl">
            {title}
          </h1>
          {lead ? (
            <div className="text-muted-foreground mt-3 text-base leading-relaxed">{lead}</div>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      {children}
    </article>
  );
}

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
    <section className={cn('border-border/70 border-t pt-6', className)} data-reveal>
      <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
        <div>
          <p className="text-label text-muted-foreground">{label}</p>
          {title ? <h2 className="text-section-title mt-2">{title}</h2> : null}
        </div>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
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

export function Figures({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">{children}</dl>;
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
        className="group hover:bg-muted/40 -mx-3 block rounded-md px-3 transition-[background-color,transform] duration-150 active:scale-[0.995] motion-reduce:active:scale-100"
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
      aria-hidden
      className="text-muted-foreground inline-block transition-transform duration-200 ease-out group-hover:translate-x-1 motion-reduce:transition-none"
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
        aria-hidden
        className={cn(
          'size-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
          direction === 'back' ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5',
        )}
        strokeWidth={1.75}
      />
      {children}
    </Link>
  );
}
