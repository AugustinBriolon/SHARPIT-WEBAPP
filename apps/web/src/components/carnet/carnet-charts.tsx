'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartFigure } from '@/components/ui/charts/chart-figure';
import { ChartTooltipCard } from '@/components/ui/charts/chart-tooltip';
import { CHART_REFERENCE_LINE, CHART_TICK_COLOR } from '@sharpit/app/lib/theme/chart-theme';

export type CarnetPoint = { label: string } & Record<string, number | string | null>;

export type CarnetSeries = {
  key: string;
  name: string;
  stroke: string;
  unit?: string;
  /** A second series read against the first: dashed, so it survives a dim screen. */
  dashed?: boolean;
};

function formatValue(value: unknown, unit?: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return unit ? `${rounded} ${unit}` : String(rounded);
}

function toChartSeries(data: CarnetPoint[], series: CarnetSeries[]) {
  return series.map((s) => ({
    name: s.name,
    unit: s.unit,
    points: data.map((d) => ({
      label: d.label,
      value: typeof d[s.key] === 'number' ? (d[s.key] as number) : null,
    })),
  }));
}

function CarnetTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  series: CarnetSeries[];
}) {
  const point = payload?.[0]?.payload as CarnetPoint | undefined;
  if (!active || !point) {
    return null;
  }
  return (
    <ChartTooltipCard>
      <p className="font-medium">{point.label}</p>
      {series.map((s) => (
        <p key={s.key} className="text-muted-foreground">
          {s.name} {formatValue(point[s.key], s.unit)}
        </p>
      ))}
    </ChartTooltipCard>
  );
}

const AXIS = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: CHART_TICK_COLOR },
} as const;

export function CarnetLineChart({
  title,
  data,
  series,
  height = 220,
  zeroLine = false,
  showYAxis = true,
}: {
  title: string;
  data: CarnetPoint[];
  series: CarnetSeries[];
  height?: number;
  zeroLine?: boolean;
  showYAxis?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p aria-hidden className="text-label text-muted-foreground">
        {title}
      </p>
      <ChartFigure height={height} series={toChartSeries(data, series)} title={title}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} vertical={false} />
          <XAxis {...AXIS} dataKey="label" interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...AXIS} domain={['auto', 'auto']} hide={!showYAxis} width={36} />
          {zeroLine ? <ReferenceLine stroke={CHART_REFERENCE_LINE} y={0} /> : null}
          <Tooltip content={<CarnetTooltip series={series} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              dot={false}
              isAnimationActive={false}
              name={s.name}
              stroke={s.stroke}
              strokeDasharray={s.dashed ? '5 3' : undefined}
              strokeWidth={2}
              type="monotone"
              connectNulls
            />
          ))}
          {series.length > 1 ? <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} /> : null}
        </LineChart>
      </ChartFigure>
    </div>
  );
}

export function CarnetBarChart({
  title,
  data,
  series,
  height = 200,
  average,
}: {
  title: string;
  data: CarnetPoint[];
  series: CarnetSeries[];
  height?: number;
  /** A dashed line at the period's average, labelled on the axis side. */
  average?: number | null;
}) {
  return (
    <div className="space-y-2">
      <p aria-hidden className="text-label text-muted-foreground">
        {title}
      </p>
      <ChartFigure height={height} series={toChartSeries(data, series)} title={title}>
        <BarChart barGap={2} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} vertical={false} />
          <XAxis {...AXIS} dataKey="label" interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...AXIS} width={36} />
          {average ? (
            <ReferenceLine stroke={CHART_REFERENCE_LINE} strokeDasharray="4 4" y={average} />
          ) : null}
          <Tooltip
            content={<CarnetTooltip series={series} />}
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.stroke}
              fillOpacity={s.dashed ? 0.3 : 1}
              isAnimationActive={false}
              name={s.name}
              radius={[3, 3, 0, 0]}
            />
          ))}
          {series.length > 1 ? <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} /> : null}
        </BarChart>
      </ChartFigure>
    </div>
  );
}
