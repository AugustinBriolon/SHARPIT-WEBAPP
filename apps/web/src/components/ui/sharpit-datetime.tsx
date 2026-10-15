'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { MotionExpand } from '@/components/motion/motion-expand';
import {
  calendarDays,
  formatDayTrigger,
  formatTimeParts,
  formatTimeTrigger,
  fromDayId,
  monthTitle,
  parseTimeParts,
  shiftMonth,
  snapMinute,
  TIME_HOURS,
  TIME_MINUTES,
  WEEKDAY_LABELS,
} from '@/components/ui/sharpit-datetime-model';

const triggerClass =
  'border-border bg-background text-foreground pressable flex h-9 w-full items-center gap-2 rounded-md border px-2.5 text-left text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[open=true]:border-ring data-[open=true]:ring-3 data-[open=true]:ring-ring/50';

const ITEM = 36;

function WheelColumn({
  values,
  value,
  label,
  onChange,
}: {
  values: readonly number[];
  value: number;
  label: string;
  onChange: (next: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const settling = useRef(false);
  const settleTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    const index = Math.max(0, values.indexOf(value));
    settling.current = true;
    el.scrollTop = index * ITEM;
    requestAnimationFrame(() => {
      settling.current = false;
    });
  }, [value, values]);

  function commit() {
    const el = scroller.current;
    if (!el || settling.current) {
      return;
    }
    const index = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
    const next = values[index] ?? value;
    el.scrollTo({ top: index * ITEM, behavior: 'smooth' });
    if (next !== value) {
      onChange(next);
    }
  }

  return (
    <div aria-label={label} className="relative min-w-0 flex-1" role="listbox">
      <div
        className="border-highlight/50 pointer-events-none absolute inset-x-1 top-1/2 z-10 h-9 -translate-y-1/2 rounded-md border"
        aria-hidden
      />
      <div
        ref={scroller}
        className="h-[180px] snap-y snap-mandatory overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
        onScroll={() => {
          if (settling.current) {
            return;
          }
          if (settleTimer.current !== null) {
            window.clearTimeout(settleTimer.current);
          }
          settleTimer.current = window.setTimeout(commit, 80);
        }}
      >
        <div className="h-[72px]" aria-hidden />
        {values.map((item) => {
          const selected = item === value;
          return (
            <button
              key={item}
              aria-selected={selected}
              role="option"
              style={{ height: ITEM }}
              type="button"
              className={cn(
                'flex h-9 w-full snap-center items-center justify-center font-medium tabular-nums transition-colors duration-150 ease-out',
                selected ? 'text-foreground' : 'text-muted-foreground/55',
              )}
              onClick={() => onChange(item)}
            >
              {String(item).padStart(2, '0')}
            </button>
          );
        })}
        <div className="h-[72px]" aria-hidden />
      </div>
    </div>
  );
}

export function SharpitDatePicker({
  value,
  open,
  onOpenChange,
  onChange,
}: {
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (dayId: string) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? fromDayId(value) : new Date(),
  );

  useEffect(() => {
    if (open && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setViewMonth(fromDayId(value));
    }
  }, [open, value]);

  const days = calendarDays(viewMonth, value);

  return (
    <div>
      <button
        aria-expanded={open}
        className={triggerClass}
        data-open={open}
        type="button"
        onClick={() => onOpenChange(!open)}
      >
        <span className="min-w-0 flex-1 truncate">{formatDayTrigger(value)}</span>
        <CalendarDays
          className="text-muted-foreground size-3.5 shrink-0"
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
      <MotionExpand open={open}>
        <div className="border-border/70 bg-muted/30 mt-2 rounded-xl border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              aria-label="Mois précédent"
              className="pressable text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-8 items-center justify-center rounded-full"
              type="button"
              onClick={() => setViewMonth((month) => shiftMonth(month, -1))}
            >
              <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
            <p className="text-sm font-medium capitalize">{monthTitle(viewMonth)}</p>
            <button
              aria-label="Mois suivant"
              className="pressable text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-8 items-center justify-center rounded-full"
              type="button"
              onClick={() => setViewMonth((month) => shiftMonth(month, 1))}
            >
              <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] tracking-[0.08em] uppercase">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => (
              <button
                key={day.dayId}
                aria-current={day.today ? 'date' : undefined}
                aria-pressed={day.selected}
                type="button"
                className={cn(
                  'pressable flex aspect-square items-center justify-center rounded-full text-sm tabular-nums transition-[background-color,color,transform] duration-150 ease-out',
                  day.inMonth ? 'text-foreground' : 'text-muted-foreground/35',
                  day.today && !day.selected ? 'ring-foreground/20 ring-1 ring-inset' : null,
                  day.selected
                    ? 'bg-highlight text-highlight-foreground font-semibold'
                    : 'hover:bg-muted',
                )}
                onClick={() => {
                  onChange(day.dayId);
                  onOpenChange(false);
                }}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      </MotionExpand>
    </div>
  );
}

export function SharpitTimePicker({
  value,
  open,
  onOpenChange,
  onChange,
}: {
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (time: string) => void;
}) {
  const { hour, minute } = parseTimeParts(value);
  const snapped = snapMinute(minute);

  return (
    <div>
      <button
        aria-expanded={open}
        className={triggerClass}
        data-open={open}
        type="button"
        onClick={() => onOpenChange(!open)}
      >
        <span className="min-w-0 flex-1 truncate tabular-nums">{formatTimeTrigger(value)}</span>
        <Clock className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      </button>
      <MotionExpand open={open}>
        <div className="border-border/70 bg-muted/30 mt-2 rounded-xl border px-2 py-1">
          <div className="flex gap-1">
            <WheelColumn
              label="Heure"
              value={hour}
              values={TIME_HOURS}
              onChange={(nextHour) => onChange(formatTimeParts(nextHour, snapped))}
            />
            <div
              className="text-muted-foreground flex items-center text-sm font-medium"
              aria-hidden
            >
              :
            </div>
            <WheelColumn
              label="Minutes"
              value={snapped}
              values={TIME_MINUTES}
              onChange={(nextMinute) => onChange(formatTimeParts(hour, nextMinute))}
            />
          </div>
        </div>
      </MotionExpand>
    </div>
  );
}
