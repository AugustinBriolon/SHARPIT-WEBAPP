import type { ReactNode } from 'react';
import { cn } from '@sharpit/app/lib/utils';
import {
  CHART_BASE_STROKE,
  CHART_CAUTION_STROKE,
  CHART_PRIMARY_STROKE,
  CHART_RECOVERY_STROKE,
} from '@sharpit/app/lib/theme/chart-theme';
import { ringDash, type SleepStage, type SleepStageKey } from './carnet-body';

/**
 * The card grammar of the Corps page (ADR-108): a surface that holds one reading, its name
 * above, its verdict as the title. Pure: props in, markup out.
 */
export function CarnetCard({
  label,
  title,
  className,
  children,
}: {
  label: string;
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('card-surface min-w-0 space-y-6', className)} data-reveal>
      <header>
        <p className="text-label text-muted-foreground">{label}</p>
        {title ? <h2 className="text-card-title mt-1.5">{title}</h2> : null}
      </header>
      {children}
    </section>
  );
}

const RING_RADIUS = 42;

/** A score out of `max` as a ring with the number in its middle; static, no stroke motion. */
export function ScoreRing({
  value,
  max = 100,
  stroke,
  caption,
}: {
  value: number | null;
  max?: number;
  stroke: string;
  caption: string;
}) {
  const [filled, circumference] = ringDash(value ?? 0, max, RING_RADIUS);
  return (
    <div className="relative size-28 shrink-0">
      <svg className="size-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" fill="none" r={RING_RADIUS} stroke="var(--track)" strokeWidth="9" />
        {value !== null ? (
          <circle
            cx="50"
            cy="50"
            fill="none"
            r={RING_RADIUS}
            stroke={stroke}
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            strokeWidth="9"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-instrument text-3xl font-semibold">
          {value !== null ? Math.round(value) : '—'}
        </span>
        <span className="text-label text-muted-foreground mt-0.5 text-[0.6875rem]">{caption}</span>
      </div>
    </div>
  );
}

const STAGE_STROKE: Record<SleepStageKey, string> = {
  deep: CHART_PRIMARY_STROKE,
  rem: CHART_BASE_STROKE,
  light: CHART_RECOVERY_STROKE,
  awake: CHART_CAUTION_STROKE,
};

function stageDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

/** A night as one capsule split by stage; the legend names each stage, so colour is not alone. */
export function SleepStageBar({ stages }: { stages: readonly SleepStage[] }) {
  if (stages.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <div aria-label="Phases du sommeil" className="progress-track flex gap-0.5" role="img">
        {stages.map((stage) => (
          <div
            key={stage.key}
            className="h-full"
            style={{ width: `${stage.share * 100}%`, backgroundColor: STAGE_STROKE[stage.key] }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {stages.map((stage) => (
          <li key={stage.key} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: STAGE_STROKE[stage.key] }}
              aria-hidden
            />
            <span className="text-muted-foreground">{stage.label}</span>
            <span className="text-instrument ml-auto tabular-nums">
              {stageDuration(stage.minutes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
