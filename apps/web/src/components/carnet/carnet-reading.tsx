import { Suspense, type ReactNode } from 'react';
import { cn } from '@sharpit/app/lib/utils';
import { CarnetCount } from './carnet-animated';

/**
 * The carnet waits on values, not on pages (ADR-110). Text that never changes is drawn by the
 * page itself; a value that comes from a reading sits in a `Reading`, which shows a skeleton of
 * that value's own size until its read lands and the value takes its place.
 */

/** A pulse where a value will be. Give it the width and height of the value it stands for. */
export function Skel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'bg-muted inline-block animate-pulse rounded align-middle motion-reduce:animate-none',
        className,
      )}
      aria-hidden
    />
  );
}

async function Await<T>({
  read,
  children,
}: {
  read: () => Promise<T>;
  children: (value: T) => ReactNode;
}) {
  return children(await read());
}

/**
 * One value, or a few that share a read. `read` is a private-cached read, so several `Reading`s of
 * one read cost one fetch. A read that failed arrives as `null` and the child says so in place.
 * Pass `skeleton` (a size, as classes) for a value, or `fallback` for a shape of its own.
 */
export function Reading<T>({
  read,
  skeleton,
  fallback,
  children,
}: {
  read: () => Promise<T>;
  skeleton?: string;
  fallback?: ReactNode;
  children: (value: T) => ReactNode;
}) {
  const waiting = fallback !== undefined ? fallback : <Skel className={skeleton} />;
  return (
    <Suspense fallback={waiting}>
      <Await read={read}>{children}</Await>
    </Suspense>
  );
}

/** A chart that is still being read: its name shows, only the plot waits. */
export function ChartSkel({ title, height = 220 }: { title: string; height?: number }) {
  return (
    <div className="space-y-2">
      <p className="text-label text-muted-foreground">{title}</p>
      <div
        className="bg-muted w-full animate-pulse rounded motion-reduce:animate-none"
        style={{ height }}
        aria-hidden
      />
    </div>
  );
}

/**
 * A figure's number read from a reading: a skeleton of the number's size, then the counted value,
 * or « — » when the read failed or the reading holds nothing for it.
 */
export function ReadingFigure<T>({
  read,
  pick,
  skeleton = 'h-7 w-14',
}: {
  read: () => Promise<T | null>;
  pick: (reading: T) => string | number | null | undefined;
  skeleton?: string;
}) {
  return (
    <Reading read={read} skeleton={skeleton}>
      {(reading) => <CarnetCount text={String((reading && pick(reading)) ?? '—')} />}
    </Reading>
  );
}
