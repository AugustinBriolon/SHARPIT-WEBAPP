import type { ReactNode } from 'react';
import { LANDING_DIAGRAMS, LANDING_PRIORITY } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';

/**
 * One schematic per step of the method, drawn as an instrument would: hairlines, mono labels,
 * colour only where it means something. Each is complete as rendered; `LandingMotion` animates
 * them from their `data-d-*` parts, so nothing here depends on script.
 */

const LABEL = 'fill-muted-foreground font-[family-name:var(--font-data)] text-[10px]';
const STRONG = 'fill-foreground font-[family-name:var(--font-data)] text-[11px] font-medium';
/** Lets a line be drawn by animating `strokeDashoffset` from 1 to 0. */
const DRAWN = { pathLength: 1, strokeDasharray: 1 } as const;
/** Grows a bar from its own baseline. */
const FROM_BOTTOM = { transformBox: 'fill-box', transformOrigin: 'bottom' } as const;

function Frame({ step, children }: { step: string; children: ReactNode }) {
  return (
    <svg
      className="h-auto w-full overflow-visible"
      data-diagram={step}
      role="img"
      viewBox="0 0 480 300"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Three sources tick in, one is primary, all flow into one model. */
const OBSERVE_TICKS = [8, 14, 6, 18, 10, 22, 12, 7, 16, 20, 9, 13, 24, 11, 15];

function Observe() {
  const { sources, primary, model } = LANDING_DIAGRAMS.observe;
  const rows = [60, 150, 240];
  return (
    <Frame step="observe">
      {rows.map((y, r) => (
        <g key={sources[r]}>
          <text className={r === 0 ? STRONG : LABEL} x={0} y={y + 4}>
            {sources[r]}
          </text>
          {r === 0 ? (
            <g>
              <rect className="fill-highlight" height={16} rx={8} width={78} x={0} y={y + 11} />
              <text className={STRONG} x={8} y={y + 22}>
                {primary}
              </text>
            </g>
          ) : null}
          <line className="stroke-foreground/15" x1={110} x2={300} y1={y} y2={y} />
          {OBSERVE_TICKS.map((h, i) => (
            <rect
              key={i}
              className={r === 0 ? 'fill-foreground' : 'fill-foreground/35'}
              height={((h + r * 5) % 24) + 4}
              style={FROM_BOTTOM}
              width={2}
              x={114 + i * 12.5}
              y={y - (((h + r * 5) % 24) + 4)}
              data-d-tick
            />
          ))}
          <path
            className={cn('fill-none', r === 0 ? 'stroke-foreground' : 'stroke-foreground/35')}
            d={`M300 ${y} C350 ${y} 350 150 392 150`}
            strokeWidth={r === 0 ? 1.5 : 1}
            {...DRAWN}
            data-d-draw
          />
        </g>
      ))}
      <g data-d-pop>
        <rect className="fill-foreground" height={40} rx={10} width={86} x={392} y={130} />
        <text
          className="fill-background font-[family-name:var(--font-data)] text-[11px] font-medium"
          textAnchor="middle"
          x={435}
          y={154}
        >
          {model}
        </text>
      </g>
    </Frame>
  );
}

/** Mornings read against the athlete's own 14-day baseline; inside ±5 % is noise. */
const COMPARE_DEVIATIONS = [
  2, -1, 3, -4, 1, 0, -2, 4, -3, 1, 2, -1, 0, 3, -2, 1, -4, 2, 0, -1, 3, -3, 1, 2, -2, 0, 4, -9,
];
const COMPARE_Y = (deviation: number) => 150 - deviation * 9;
const COMPARE_X = (i: number) => 20 + i * 16;

function Compare() {
  const { window, band, outlier } = LANDING_DIAGRAMS.compare;
  const last = COMPARE_DEVIATIONS.length - 1;
  const line = COMPARE_DEVIATIONS.map(
    (d, i) => `${i === 0 ? 'M' : 'L'}${COMPARE_X(i)} ${COMPARE_Y(d)}`,
  ).join(' ');
  const windowStart = COMPARE_X(last - 13);
  return (
    <Frame step="compare">
      <rect
        className="fill-highlight/35"
        height={COMPARE_Y(-5) - COMPARE_Y(5)}
        width={COMPARE_X(last) - windowStart + 8}
        x={windowStart - 4}
        y={COMPARE_Y(5)}
        data-d-fade
      />
      <line
        className="stroke-foreground/40"
        strokeDasharray="3 4"
        x1={windowStart - 4}
        x2={COMPARE_X(last) + 4}
        y1={150}
        y2={150}
      />
      <path
        className="stroke-foreground/30 fill-none"
        d={`M${windowStart - 4} 52 V44 H${COMPARE_X(last) + 4} V52`}
      />
      <text className={LABEL} textAnchor="middle" x={(windowStart + COMPARE_X(last)) / 2} y={36}>
        {window}
      </text>
      <path
        className="stroke-foreground fill-none"
        d={line}
        strokeWidth={1.5}
        {...DRAWN}
        data-d-draw
      />
      {COMPARE_DEVIATIONS.map((d, i) =>
        i === last ? null : (
          <circle key={i} className="fill-foreground" cx={COMPARE_X(i)} cy={COMPARE_Y(d)} r={2} />
        ),
      )}
      <g data-d-pop>
        <circle
          className="fill-signal-caution"
          cx={COMPARE_X(last)}
          cy={COMPARE_Y(COMPARE_DEVIATIONS[last])}
          r={5}
        />
        <text
          className="fill-signal-caution font-[family-name:var(--font-data)] text-[11px] font-medium"
          textAnchor="end"
          x={COMPARE_X(last) + 6}
          y={COMPARE_Y(COMPARE_DEVIATIONS[last]) + 22}
        >
          {outlier}
        </text>
      </g>
      <text className={LABEL} x={windowStart} y={COMPARE_Y(-5) + 16}>
        {band}
      </text>
    </Frame>
  );
}

/** Five readings, safest first; the safest one that objects decides. */
function Arbitrate() {
  const { readings, verdict, rule } = LANDING_DIAGRAMS.arbitrate;
  const LIMITING = 1;
  return (
    <Frame step="arbitrate">
      {LANDING_PRIORITY.map((domain, i) => {
        const y = 30 + i * 60;
        const limiting = i === LIMITING;
        return (
          <g key={domain}>
            <text className={limiting ? STRONG : LABEL} x={0} y={y + 4}>
              {domain}
            </text>
            <text
              x={0}
              y={y + 18}
              className={cn(
                'font-[family-name:var(--font-data)] text-[10px]',
                limiting ? 'fill-signal-caution font-medium' : 'fill-muted-foreground',
              )}
            >
              {readings[i]}
            </text>
            <path
              d={`M110 ${y} C250 ${y} 260 150 360 150`}
              strokeWidth={limiting ? 2 : 1}
              className={cn(
                'fill-none',
                limiting ? 'stroke-signal-caution' : 'stroke-foreground/25',
              )}
              {...DRAWN}
              data-d-draw
            />
          </g>
        );
      })}
      <g data-d-pop>
        <rect className="fill-foreground" height={44} rx={10} width={118} x={360} y={128} />
        <text
          className="fill-background font-[family-name:var(--font-data)] text-[11px] font-medium"
          textAnchor="middle"
          x={419}
          y={154}
        >
          {verdict}
        </text>
        <text className={LABEL} textAnchor="middle" x={419} y={194}>
          {rule}
        </text>
      </g>
    </Frame>
  );
}

/** A week's sessions as bars of their duration; the key ones are the solid ones. */
type WeekBar = { height: number; key?: boolean };
const PROGRAMME_WEEK: readonly WeekBar[] = [
  { height: 0 },
  { height: 70 },
  { height: 46 },
  { height: 112, key: true },
  { height: 0 },
  { height: 168, key: true },
  { height: 58 },
];
const WEEK_BASE = 250;
const WEEK_X = (i: number) => 24 + i * 64;

function WeekAxis() {
  return (
    <g>
      <line className="stroke-foreground/25" x1={10} x2={470} y1={WEEK_BASE} y2={WEEK_BASE} />
      {LANDING_DIAGRAMS.programme.days.map((day, i) => (
        <text key={i} className={LABEL} textAnchor="middle" x={WEEK_X(i) + 20} y={WEEK_BASE + 22}>
          {day}
        </text>
      ))}
    </g>
  );
}

function Programme() {
  const { key, checks } = LANDING_DIAGRAMS.programme;
  return (
    <Frame step="programme">
      <WeekAxis />
      {PROGRAMME_WEEK.map((bar, i) =>
        bar.height ? (
          <g key={i}>
            <rect
              className={bar.key ? 'fill-foreground' : 'fill-foreground/20'}
              height={bar.height}
              rx={6}
              style={FROM_BOTTOM}
              width={40}
              x={WEEK_X(i)}
              y={WEEK_BASE - bar.height}
              data-d-bar
            />
            {bar.key ? (
              <g data-d-pop>
                <rect
                  className="fill-highlight"
                  height={16}
                  rx={8}
                  width={34}
                  x={WEEK_X(i) + 3}
                  y={WEEK_BASE - bar.height - 24}
                />
                <text
                  className={STRONG}
                  textAnchor="middle"
                  x={WEEK_X(i) + 20}
                  y={WEEK_BASE - bar.height - 12}
                >
                  {key}
                </text>
              </g>
            ) : null}
          </g>
        ) : null,
      )}
      <text className={STRONG} textAnchor="end" x={470} y={20} data-d-pop>
        {checks}
      </text>
    </Frame>
  );
}

/** Tuesday was missed: the rest of the week is rearranged, and waits for the athlete's yes. */
function Repair() {
  const { missed, proposal } = LANDING_DIAGRAMS.repair;
  const MISSED = 1;
  const EASED = 2;
  const ADDED = 4;
  return (
    <Frame step="repair">
      <WeekAxis />
      {PROGRAMME_WEEK.map((bar, i) => {
        if (i === MISSED) {
          return (
            <g key={i}>
              <rect
                className="stroke-foreground/40 fill-none"
                height={bar.height}
                rx={6}
                strokeDasharray="4 4"
                width={40}
                x={WEEK_X(i)}
                y={WEEK_BASE - bar.height}
              />
              <text
                className={LABEL}
                textAnchor="middle"
                x={WEEK_X(i) + 20}
                y={WEEK_BASE - bar.height / 2 + 4}
              >
                {missed}
              </text>
            </g>
          );
        }
        if (i === EASED) {
          return (
            <rect
              key={i}
              className="fill-highlight stroke-foreground"
              height={78}
              rx={6}
              style={FROM_BOTTOM}
              width={40}
              x={WEEK_X(i)}
              y={WEEK_BASE - 78}
              data-d-bar
            />
          );
        }
        if (i === ADDED) {
          return (
            <rect
              key={i}
              className="fill-highlight stroke-foreground"
              height={40}
              rx={6}
              style={FROM_BOTTOM}
              width={40}
              x={WEEK_X(i)}
              y={WEEK_BASE - 40}
              data-d-bar
            />
          );
        }
        return bar.height ? (
          <rect
            key={i}
            className={bar.key ? 'fill-foreground' : 'fill-foreground/20'}
            height={bar.height}
            rx={6}
            width={40}
            x={WEEK_X(i)}
            y={WEEK_BASE - bar.height}
          />
        ) : null;
      })}
      <path
        className="stroke-foreground/50 fill-none"
        d={`M${WEEK_X(MISSED) + 20} ${WEEK_BASE - 78} C${WEEK_X(MISSED) + 40} 120 ${WEEK_X(ADDED) - 10} 130 ${WEEK_X(ADDED) + 20} ${WEEK_BASE - 52}`}
        pathLength={1}
        strokeDasharray="1"
        data-d-draw
      />
      <g data-d-pop>
        <rect className="fill-foreground" height={22} rx={11} width={128} x={342} y={8} />
        <text
          className="fill-background font-[family-name:var(--font-data)] text-[10px] font-medium"
          textAnchor="middle"
          x={406}
          y={23}
        >
          {proposal}
        </text>
      </g>
    </Frame>
  );
}

export const METHOD_DIAGRAMS = [Observe, Compare, Arbitrate, Programme, Repair] as const;
