import type { BodyViewModel } from '@sharpit/app/presentation/body-view-model';
import type { PhysicalHealthViewModel } from '@sharpit/app/presentation/physical-health-view-model';
import type { RecoveryViewModel } from '@sharpit/app/presentation/recovery-view-model';
import type { SleepViewModel } from '@sharpit/app/presentation/sleep-view-model';
import type { BloodMarkerStatus } from '@sharpit/app/lib/blood-markers/catalog';
import { formatPace, formatSwimPace } from '@sharpit/app/lib/format';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import {
  CHART_BASE_STROKE,
  CHART_RECOVERY_STROKE,
  CHART_VO2_STROKE,
} from '@sharpit/app/lib/theme/chart-theme';
import { CarnetBarChart, CarnetLineChart } from '@/components/carnet/carnet-charts';
import { sleepStages } from '@/components/carnet/carnet-body';
import {
  type BloodTestReading,
  type MarkerRow,
  markerRows,
  sparkline,
} from '@/components/carnet/carnet-markers';
import {
  ScoreRing,
  ScoreRingSkel,
  SleepStageBar,
  SleepStageSkel,
} from '@/components/carnet/carnet-cards';
import {
  CarnetPage,
  CarnetSection,
  Figure,
  Figures,
  InApp,
  Quiet,
  ReadingList,
  ReadingRow,
  Reasons,
  StatusPill,
  type StatusTone,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import {
  readCachedSection,
  readCachedViewModel,
  readDayViewModel,
} from '@/components/carnet/carnet-read';
import { ChartSkel, Reading, ReadingFigure, Skel } from '@/components/carnet/carnet-reading';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

const readSleep = () => readDayViewModel<SleepViewModel>('sleep');
const readRecovery = () => readDayViewModel<RecoveryViewModel>('recovery');
const readBody = () => readCachedViewModel<BodyViewModel>('/api/presentation/body?days=90');
const readPhysical = () => readDayViewModel<PhysicalHealthViewModel>('physical-health');

type Thresholds = {
  ftpW: number | null;
  lthr: number | null;
  maxHr: number | null;
  runThresholdPaceSecPerKm: number | null;
  swimCssSecPer100m: number | null;
};

const readBloodTests = () =>
  readCachedSection<{ bloodTests: BloodTestReading[] }>('/api/v1/blood-tests');
const readThresholds = () => readCachedSection<Thresholds>('/api/v1/athlete-profile');

function hoursOf(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return '—';
  }
  const h = Math.floor(minutes / 60);
  return `${h}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

/** The line a section shows in place when its reading could not be read. */
function UnreadableWhen<T>({ read, what }: { read: () => Promise<T | null>; what: string }) {
  return (
    <Reading fallback={null} read={read}>
      {(reading) => (reading ? null : <Unreadable what={what} />)}
    </Reading>
  );
}

/** A figure that may not exist for this athlete: its label waits with a skeleton, then it shows or goes. */
function WaitingFigure({ label, unit }: { label: string; unit?: string }) {
  return <Figure label={label} unit={unit} value={<Skel className="h-7 w-14" />} />;
}

const FIGURES_BESIDE_RING =
  'grid-cols-1 flex-1 min-[26rem]:grid-cols-2 sm:grid-cols-1 lg:grid-cols-2';

function Sleep() {
  return (
    <>
      <div className="flex items-center gap-6">
        <Reading fallback={<ScoreRingSkel caption="Score" />} read={readSleep}>
          {(vm) => (
            <ScoreRing
              caption="Score"
              stroke="var(--pillar-sleep)"
              value={vm?.sleepScore ?? null}
            />
          )}
        </Reading>
        <Figures className={FIGURES_BESIDE_RING}>
          <Figure
            label="Durée"
            value={<ReadingFigure pick={(vm) => hoursOf(vm.totalSleepMin)} read={readSleep} />}
          />
          <Figure
            label="Cible"
            value={<ReadingFigure pick={(vm) => hoursOf(vm.sleepTargetMin)} read={readSleep} />}
          />
        </Figures>
      </div>
      <Reading fallback={<SleepStageSkel />} read={readSleep}>
        {(vm) =>
          vm ? (
            <SleepStageBar
              stages={sleepStages({
                deep: vm.deepMin,
                rem: vm.remMin,
                light: vm.lightMin,
                awake: vm.awakeMin,
              })}
            />
          ) : null
        }
      </Reading>
      <Reading fallback={null} read={readSleep}>
        {(vm) => (vm?.recoveryNote ? <Quiet>{vm.recoveryNote}</Quiet> : null)}
      </Reading>
      <Reading fallback={<ChartSkel title="Durée de sommeil" />} read={readSleep}>
        {(vm) =>
          vm && vm.barData.some((b) => b.minutes !== null) ? (
            <CarnetBarChart
              average={vm.sleepTargetMin / 60}
              series={[{ key: 'hours', name: 'Sommeil', stroke: CHART_BASE_STROKE, unit: 'h' }]}
              title="Durée de sommeil"
              data={vm.barData.map((b) => ({
                label: b.date,
                hours: b.minutes !== null ? Math.round((b.minutes / 60) * 10) / 10 : null,
              }))}
            />
          ) : null
        }
      </Reading>
      <UnreadableWhen read={readSleep} what="Le sommeil" />
    </>
  );
}

function Recovery() {
  return (
    <>
      <Reading fallback={<Skel className="h-5 w-48" />} read={readRecovery}>
        {(vm) =>
          vm ? (
            <p className="text-sm leading-relaxed">
              <span className="font-medium">{vm.signal.label}</span>
              {vm.limiterLabel ? ` · ${vm.limiterLabel}` : ''}
            </p>
          ) : null
        }
      </Reading>
      <div className="flex items-center gap-6">
        <Reading fallback={<ScoreRingSkel caption="Dispo" />} read={readRecovery}>
          {(vm) => (
            <ScoreRing
              caption="Dispo"
              stroke="var(--pillar-recovery)"
              value={typeof vm?.readinessScore === 'number' ? vm.readinessScore : null}
            />
          )}
        </Reading>
        <Figures className={FIGURES_BESIDE_RING}>
          <Figure
            label="VFC"
            unit="ms"
            hint={
              <Reading read={readRecovery} skeleton="h-3 w-24">
                {(vm) =>
                  vm && vm.baselineLow !== null && vm.baselineHigh !== null
                    ? `ta zone : ${Math.round(vm.baselineLow)}–${Math.round(vm.baselineHigh)}`
                    : null
                }
              </Reading>
            }
            value={
              <ReadingFigure
                pick={(vm) => (vm.hrv !== null ? Math.round(vm.hrv) : null)}
                read={readRecovery}
              />
            }
          />
          <Figure
            label="FC repos"
            unit="bpm"
            value={<ReadingFigure pick={(vm) => vm.restingHr} read={readRecovery} />}
          />
          <Reading fallback={<WaitingFigure label="Body Battery" />} read={readRecovery}>
            {(vm) =>
              vm && vm.bodyBattery !== null ? (
                <Figure label="Body Battery" value={vm.bodyBattery} />
              ) : null
            }
          </Reading>
        </Figures>
      </div>
      <Reading
        fallback={<ChartSkel title="VFC et fréquence cardiaque au repos" />}
        read={readRecovery}
      >
        {(vm) =>
          vm && vm.sparkHrv.some((p) => p.value !== null) ? (
            <CarnetLineChart
              title="VFC et fréquence cardiaque au repos"
              data={vm.sparkHrv.map((p, i) => ({
                label: p.date,
                hrv: p.value,
                rhr: vm.sparkRhr[i]?.value ?? null,
              }))}
              series={[
                { key: 'hrv', name: 'VFC', stroke: CHART_RECOVERY_STROKE, unit: 'ms' },
                {
                  key: 'rhr',
                  name: 'FC repos',
                  stroke: CHART_VO2_STROKE,
                  unit: 'bpm',
                  dashed: true,
                },
              ]}
            />
          ) : null
        }
      </Reading>
      <Reading fallback={null} read={readRecovery}>
        {(vm) => (vm ? <Reasons items={vm.keyEvidence} /> : null)}
      </Reading>
      <UnreadableWhen read={readRecovery} what="La récupération" />
    </>
  );
}

const MARKER_STATUS: Record<BloodMarkerStatus, { tone: StatusTone; word: string }> = {
  in_range: { tone: 'good', word: 'Bon' },
  low: { tone: 'alert', word: 'Bas' },
  high: { tone: 'alert', word: 'Haut' },
  no_reference: { tone: 'unknown', word: 'Sans norme' },
};

const LAB_COLUMNS =
  'grid grid-cols-[minmax(0,1.5fr)_5.5rem_minmax(0,1.2fr)_4rem_5.75rem] items-center gap-3';

const SPARK_WIDTH = 64;
const SPARK_HEIGHT = 24;

/** A value on its range: the lab's range as a band in the middle, the value as a ringed dot. */
function RangeBar({ position }: { position: number | null }) {
  if (position === null) {
    return <span className="bg-border block h-px w-full" aria-hidden />;
  }
  return (
    <span className="bg-border relative block h-2 rounded-full" aria-hidden>
      <span className="absolute inset-y-0 right-1/4 left-1/4 rounded-full bg-(--outline)" />
      <span
        className="border-foreground bg-card absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
        style={{ left: `${position}%` }}
      />
    </span>
  );
}

function LabRow({
  label,
  value,
  unit,
  position = null,
  range,
  trend = [],
  status,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  position?: number | null;
  range: ReactNode;
  trend?: readonly number[];
  status?: { tone: StatusTone; word: string };
}) {
  const line = sparkline(trend, SPARK_WIDTH, SPARK_HEIGHT);
  return (
    <li className={`${LAB_COLUMNS} py-3`}>
      <span className="truncate text-[0.9375rem]">{label}</span>
      <span className="text-instrument text-[0.9375rem]">
        {value}
        {unit ? (
          <span className="text-muted-foreground ml-1 text-xs font-normal">{unit}</span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1.5">
        <RangeBar position={position} />
        <span className="text-data text-muted-foreground text-[0.6875rem] font-normal">
          {range}
        </span>
      </span>
      {line ? (
        <svg className="h-6 w-16" viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} aria-hidden>
          <polyline
            fill="none"
            points={line}
            stroke="var(--foreground)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      ) : (
        <span aria-hidden />
      )}
      <span className="flex justify-end">
        {status ? <StatusPill tone={status.tone}>{status.word}</StatusPill> : null}
      </span>
    </li>
  );
}

function LabGroup({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <li className="pt-5 pb-1.5 text-[0.8125rem] font-semibold">{name}</li>
      {children}
    </>
  );
}

function rangeOf(marker: MarkerRow): string {
  if (marker.refLow !== null && marker.refHigh !== null) {
    return `norme ${marker.refLow} – ${marker.refHigh}`;
  }
  if (marker.refLow !== null) {
    return `norme ≥ ${marker.refLow}`;
  }
  if (marker.refHigh !== null) {
    return `norme ≤ ${marker.refHigh}`;
  }
  return 'le laboratoire ne donne pas de norme';
}

const PROFILE = 'valeur de ton profil';

function thresholdRows(thresholds: Thresholds): { label: string; value: string; unit?: string }[] {
  return [
    thresholds.ftpW
      ? { label: 'Puissance seuil vélo', value: `${thresholds.ftpW}`, unit: 'W' }
      : null,
    thresholds.runThresholdPaceSecPerKm
      ? { label: 'Allure seuil course', value: formatPace(thresholds.runThresholdPaceSecPerKm) }
      : null,
    thresholds.swimCssSecPer100m
      ? { label: 'Allure critique natation', value: formatSwimPace(thresholds.swimCssSecPer100m) }
      : null,
    thresholds.lthr ? { label: 'FC au seuil', value: `${thresholds.lthr}`, unit: 'bpm' } : null,
    thresholds.maxHr ? { label: 'FC max', value: `${thresholds.maxHr}`, unit: 'bpm' } : null,
  ].filter((row) => row !== null);
}

type Composition = BodyViewModel['hero']['heroMini'];

function compositionRows(vm: BodyViewModel) {
  const mini: Composition = vm.hero.heroMini;
  const weights = vm.chartData.map((p) => p.weightKg).filter((kg) => kg !== null);
  return [
    {
      label: 'Poids',
      value: vm.hero.latestWeightDisplay,
      range: vm.hero.weightDeltaDisplay,
      trend: weights,
    },
    {
      label: 'Masse grasse',
      value: mini.bodyFatPct.value?.toFixed(1),
      unit: '%',
      range: mini.bodyFatPct.deltaDisplay,
    },
    {
      label: 'Muscle',
      value: mini.musclePct.value?.toFixed(1),
      unit: '%',
      range: mini.musclePct.deltaDisplay,
    },
    {
      label: 'Graisse viscérale',
      value: mini.visceralFat.value?.toString(),
      range: mini.visceralFat.deltaDisplay,
    },
  ].filter((row) => row.value !== null && row.value !== undefined);
}

/**
 * The body as a lab report: one line a measure — its value, where it sits in its range, how it
 * moved, its status. Blood markers come with the lab's own range; thresholds and composition
 * have none and say where they come from instead.
 */
async function LabTable() {
  const [tests, thresholds, body] = await Promise.all([
    readBloodTests(),
    readThresholds(),
    readBody(),
  ]);
  const markers = tests ? markerRows(tests.bloodTests) : [];
  const levels = thresholds ? thresholdRows(thresholds) : [];
  const composition = body?.hasData ? compositionRows(body) : [];
  if (markers.length + levels.length + composition.length === 0) {
    return <Quiet>Aucune mesure à lire pour le moment.</Quiet>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[32rem]">
        <div
          className={`${LAB_COLUMNS} text-label text-muted-foreground border-b border-(--outline) py-3`}
        >
          <span>Mesure</span>
          <span>Valeur</span>
          <span>Dans sa norme</span>
          <span>Tendance</span>
          <span className="text-right">Statut</span>
        </div>
        <ul className="[&>li+li]:border-border [&>li+li]:border-t">
          {markers.length > 0 ? (
            <LabGroup name="Sang">
              {markers.map((marker) => (
                <LabRow
                  key={marker.key}
                  label={marker.label}
                  position={marker.position}
                  range={rangeOf(marker)}
                  status={MARKER_STATUS[marker.status]}
                  trend={marker.history}
                  unit={marker.unit}
                  value={marker.value}
                />
              ))}
            </LabGroup>
          ) : null}
          {levels.length > 0 ? (
            <LabGroup name="Seuils">
              {levels.map((row) => (
                <LabRow
                  key={row.label}
                  label={row.label}
                  range={PROFILE}
                  unit={row.unit}
                  value={row.value}
                />
              ))}
            </LabGroup>
          ) : null}
          {composition.length > 0 ? (
            <LabGroup name="Composition">
              {composition.map((row) => (
                <LabRow
                  key={row.label}
                  label={row.label}
                  range={row.range ?? 'pas de mesure précédente'}
                  trend={row.trend}
                  unit={row.unit}
                  value={row.value}
                />
              ))}
            </LabGroup>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

/** How many markers with a range sit inside it, as the page's title; the plain title without any. */
async function BodyTitle() {
  const tests = await readBloodTests();
  const ranged = (tests ? markerRows(tests.bloodTests) : []).filter(
    (marker) => marker.status !== 'no_reference',
  );
  if (ranged.length === 0) {
    return 'Comment tu vas';
  }
  const inRange = ranged.filter((marker) => marker.status === 'in_range').length;
  return `${inRange} ${inRange > 1 ? 'marqueurs' : 'marqueur'} sur ${ranged.length} dans ${
    inRange > 1 ? 'leur' : 'sa'
  } norme`;
}

async function BodyLead() {
  const tests = await readBloodTests();
  const latest = tests?.bloodTests
    .map((test) => test.sampledAt)
    .sort()
    .at(-1);
  if (!latest) {
    return null;
  }
  return `Dernier bilan sanguin : ${new Date(latest).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })}.`;
}

const NIGHTS = 14;

/** The last fourteen nights as bars in sleep's hue, under their mean and the need. */
function SleepNights() {
  return (
    <Reading fallback={<Skel className="block h-24 w-full" />} read={readSleep}>
      {(vm) => {
        const nights = (vm?.barData ?? []).slice(-NIGHTS);
        const slept = nights.map((n) => n.minutes).filter((m) => m !== null);
        if (!vm || slept.length === 0) {
          return <Quiet>Aucune nuit synchronisée.</Quiet>;
        }
        const mean = slept.reduce((sum, m) => sum + m, 0) / slept.length;
        const tallest = Math.max(...slept, vm.sleepTargetMin);
        return (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-data text-3xl">{hoursOf(mean)}</span>
              <span className="text-muted-foreground text-[0.8125rem]">
                en moyenne · besoin {hoursOf(vm.sleepTargetMin)}
              </span>
            </p>
            <ol
              aria-label={`Durée de sommeil des ${nights.length} dernières nuits`}
              className="flex h-16 items-end gap-1"
            >
              {nights.map((night) => (
                <li
                  key={night.date}
                  className="flex-1 rounded-t bg-(--pillar-sleep)"
                  style={{ height: `${Math.round(((night.minutes ?? 0) / tallest) * 100)}%` }}
                  title={`${night.date} : ${hoursOf(night.minutes)}`}
                />
              ))}
            </ol>
          </>
        );
      }}
    </Reading>
  );
}

/** Weight over ninety days: the latest value, then the line. */
function WeightTrend() {
  return (
    <Reading fallback={<Skel className="block h-24 w-full" />} read={readBody}>
      {(vm) => {
        if (!vm?.hasData) {
          return <Quiet>{vm?.emptyState?.title ?? 'Aucune pesée.'}</Quiet>;
        }
        return (
          <>
            <p className="text-data text-3xl">{vm.hero.latestWeightDisplay}</p>
            {vm.chartData.filter((p) => p.weightKg !== null).length > 1 ? (
              <CarnetLineChart
                data={vm.chartData.map((p) => ({ label: p.label, weight: p.weightKg }))}
                height={140}
                series={[{ key: 'weight', name: 'Poids', stroke: CHART_BASE_STROKE, unit: 'kg' }]}
                title="Poids sur 90 jours"
              />
            ) : null}
            {vm.hero.measuredAtLabel ? (
              <Quiet>
                Dernière mesure {vm.hero.measuredAtLabel}
                {vm.hero.sourceLabel ? `, ${vm.hero.sourceLabel}` : ''}.
              </Quiet>
            ) : null}
          </>
        );
      }}
    </Reading>
  );
}

function Zones() {
  return (
    <>
      <Reading fallback={<Skel className="h-12 w-full" />} read={readPhysical}>
        {(vm) => {
          if (!vm) {
            return null;
          }
          if (vm.activeConditions.length === 0) {
            return <Quiet>Aucune zone sensible ouverte.</Quiet>;
          }
          return (
            <>
              <Quiet>{vm.aggregate.aggregateTrainingCapacityLabel}</Quiet>
              <ReadingList>
                {vm.activeConditions.map((zone) => (
                  <ReadingRow key={zone.conditionId} href={null}>
                    <div className="min-w-0">
                      <p className="text-label text-muted-foreground">
                        {zone.typeLabel}
                        {zone.trendLabel ? ` · ${zone.trendLabel}` : ''}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 font-medium">
                        {zone.label}
                        {zone.sideLabel ? ` (${zone.sideLabel})` : ''}
                        <StatusPill tone="protect">{zone.statusLabel}</StatusPill>
                      </p>
                      {zone.functionalCapacityLabel ? (
                        <p className="text-muted-foreground mt-0.5 text-sm">
                          {zone.functionalCapacityLabel}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-instrument shrink-0 text-xl tabular-nums">
                      {zone.severity}
                      <span className="text-muted-foreground text-data ml-0.5 text-xs">/10</span>
                    </p>
                  </ReadingRow>
                ))}
              </ReadingList>
              <InApp>Faire le point sur une zone</InApp>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {vm.medicalDisclaimer}
              </p>
            </>
          );
        }}
      </Reading>
      <UnreadableWhen read={readPhysical} what="Les zones sensibles" />
    </>
  );
}

export default function CarnetBodyPage() {
  return (
    <CarnetPage
      kicker="Le corps"
      lead={
        <Suspense fallback={null}>
          <BodyLead />
        </Suspense>
      }
      side={
        <>
          <CarnetSection
            label="Zones sensibles"
            title={
              <Reading read={readPhysical} skeleton="h-5 w-44">
                {(vm) => vm?.aggregate.decisionLabel}
              </Reading>
            }
          >
            <Zones />
          </CarnetSection>
          <CarnetSection label={`Sommeil · ${NIGHTS} nuits`}>
            <SleepNights />
          </CarnetSection>
          <CarnetSection label="Poids · 90 jours">
            <WeightTrend />
          </CarnetSection>
        </>
      }
      title={
        <Suspense fallback={<Skel className="h-8 w-72 max-w-full" />}>
          <BodyTitle />
        </Suspense>
      }
    >
      <CarnetSection label="Les mesures">
        <Suspense fallback={<Skel className="block h-48 w-full" />}>
          <LabTable />
        </Suspense>
      </CarnetSection>
      <CarnetSection
        label="La nuit"
        title={
          <Reading read={readSleep} skeleton="h-5 w-40">
            {(vm) => vm?.adequacyDisplay.label}
          </Reading>
        }
      >
        <Sleep />
      </CarnetSection>
      <CarnetSection
        label="La récupération"
        title={
          <Reading read={readRecovery} skeleton="h-5 w-36">
            {(vm) => vm?.intensityLabel}
          </Reading>
        }
      >
        <Recovery />
      </CarnetSection>
    </CarnetPage>
  );
}
