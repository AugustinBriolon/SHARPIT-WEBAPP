import type { BodyViewModel } from '@sharpit/app/presentation/body-view-model';
import type { PhysicalHealthViewModel } from '@sharpit/app/presentation/physical-health-view-model';
import type { RecoveryViewModel } from '@sharpit/app/presentation/recovery-view-model';
import type { SleepViewModel } from '@sharpit/app/presentation/sleep-view-model';
import { CORPS_TONE_TEXT } from '@sharpit/app/lib/ui/metric-tone';
import {
  CHART_BASE_STROKE,
  CHART_PRIMARY_STROKE,
  CHART_RECOVERY_STROKE,
  CHART_VO2_STROKE,
} from '@sharpit/app/lib/theme/chart-theme';
import { CarnetBarChart, CarnetLineChart } from '@/components/carnet/carnet-charts';
import { sleepStages } from '@/components/carnet/carnet-body';
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
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { readCachedViewModel, readDayViewModel } from '@/components/carnet/carnet-read';
import { ChartSkel, Reading, ReadingFigure, Skel } from '@/components/carnet/carnet-reading';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

const readSleep = () => readDayViewModel<SleepViewModel>('sleep');
const readRecovery = () => readDayViewModel<RecoveryViewModel>('recovery');
const readBody = () => readCachedViewModel<BodyViewModel>('/api/presentation/body?days=90');
const readPhysical = () => readDayViewModel<PhysicalHealthViewModel>('physical-health');

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
              stroke={CHART_PRIMARY_STROKE}
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
              stroke={CHART_PRIMARY_STROKE}
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

type BodyMini = {
  value: number | null;
  deltaDisplay: string | null;
  tone: keyof typeof CORPS_TONE_TEXT;
};

function BodyFigure({
  label,
  unit,
  pick,
}: {
  label: string;
  unit?: string;
  pick: (vm: BodyViewModel) => BodyMini;
}) {
  return (
    <Reading fallback={<WaitingFigure label={label} unit={unit} />} read={readBody}>
      {(vm) => {
        const mini = vm?.hasData ? pick(vm) : null;
        return mini && mini.value !== null ? (
          <Figure
            hint={mini.deltaDisplay ?? undefined}
            label={label}
            tone={CORPS_TONE_TEXT[mini.tone]}
            unit={unit}
            value={unit === '%' ? mini.value.toFixed(1) : mini.value}
          />
        ) : null;
      }}
    </Reading>
  );
}

function Body() {
  return (
    <>
      <Reading fallback={null} read={readBody}>
        {(vm) =>
          vm && !vm.hasData ? <Quiet>{vm.emptyState?.title ?? 'Aucune pesée.'}</Quiet> : null
        }
      </Reading>
      <Figures>
        <Figure
          label="Poids"
          hint={
            <Reading read={readBody} skeleton="h-3 w-12">
              {(vm) => vm?.hero.weightDeltaDisplay}
            </Reading>
          }
          value={
            <ReadingFigure
              pick={(vm) => (vm.hasData ? vm.hero.latestWeightDisplay : null)}
              read={readBody}
              skeleton="h-7 w-20"
            />
          }
        />
        <BodyFigure label="Masse grasse" pick={(vm) => vm.hero.heroMini.bodyFatPct} unit="%" />
        <BodyFigure label="Muscle" pick={(vm) => vm.hero.heroMini.musclePct} unit="%" />
        <BodyFigure label="Graisse viscérale" pick={(vm) => vm.hero.heroMini.visceralFat} />
      </Figures>
      <Reading fallback={<ChartSkel title="Poids sur 90 jours" />} read={readBody}>
        {(vm) =>
          vm && vm.chartData.filter((p) => p.weightKg !== null).length > 1 ? (
            <CarnetLineChart
              data={vm.chartData.map((p) => ({ label: p.label, weight: p.weightKg }))}
              series={[{ key: 'weight', name: 'Poids', stroke: CHART_BASE_STROKE, unit: 'kg' }]}
              title="Poids sur 90 jours"
            />
          ) : null
        }
      </Reading>
      <Reading fallback={null} read={readBody}>
        {(vm) =>
          vm?.hero.measuredAtLabel ? (
            <Quiet>
              Dernière mesure {vm.hero.measuredAtLabel}
              {vm.hero.sourceLabel ? `, ${vm.hero.sourceLabel}` : ''}.
            </Quiet>
          ) : null
        }
      </Reading>
      <UnreadableWhen read={readBody} what="La composition" />
    </>
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
                        {zone.typeLabel} · {zone.statusLabel}
                        {zone.trendLabel ? ` · ${zone.trendLabel}` : ''}
                      </p>
                      <p className="mt-1 font-medium">
                        {zone.label}
                        {zone.sideLabel ? ` (${zone.sideLabel})` : ''}
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
    <CarnetPage kicker="Le corps" title="Comment tu vas">
      <div className="grid gap-6 lg:grid-cols-2">
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
        <CarnetSection label="La composition" title="Poids et composition">
          <Body />
        </CarnetSection>
        <CarnetSection
          label="Les zones sensibles"
          title={
            <Reading read={readPhysical} skeleton="h-5 w-44">
              {(vm) => vm?.aggregate.decisionLabel}
            </Reading>
          }
        >
          <Zones />
        </CarnetSection>
      </div>
    </CarnetPage>
  );
}
