import { cacheLife } from 'next/cache';
import type { BodyViewModel } from '@sharpit/app/presentation/body-view-model';
import type { PhysicalHealthViewModel } from '@sharpit/app/presentation/physical-health-view-model';
import type { RecoveryViewModel } from '@sharpit/app/presentation/recovery-view-model';
import type { SleepViewModel } from '@sharpit/app/presentation/sleep-view-model';
import { CORPS_TONE_TEXT } from '@sharpit/app/lib/ui/metric-tone';
import {
  CHART_BASE_STROKE,
  CHART_RECOVERY_STROKE,
  CHART_VO2_STROKE,
} from '@sharpit/app/lib/theme/chart-theme';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { CarnetBarChart, CarnetLineChart } from '@/components/carnet/carnet-charts';
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
import { CARNET_FRESHNESS, readViewModel } from '@/components/carnet/carnet-read';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

function hoursOf(minutes: number | null): string {
  if (minutes === null) {
    return '—';
  }
  const h = Math.floor(minutes / 60);
  return `${h}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

function Sleep({ vm }: { vm: SleepViewModel }) {
  return (
    <>
      <Figures>
        <Figure label="Score" unit="/100" value={vm.sleepScore ?? '—'} />
        <Figure label="Durée" value={hoursOf(vm.totalSleepMin)} />
        <Figure label="Profond" value={hoursOf(vm.deepMin)} />
        <Figure label="Paradoxal" value={hoursOf(vm.remMin)} />
      </Figures>
      {vm.recoveryNote ? <Quiet>{vm.recoveryNote}</Quiet> : null}
      {vm.barData.some((b) => b.minutes !== null) ? (
        <CarnetBarChart
          average={vm.sleepTargetMin / 60}
          series={[{ key: 'hours', name: 'Sommeil', stroke: CHART_BASE_STROKE, unit: 'h' }]}
          title="Durée de sommeil"
          data={vm.barData.map((b) => ({
            label: b.date,
            hours: b.minutes !== null ? Math.round((b.minutes / 60) * 10) / 10 : null,
          }))}
        />
      ) : null}
    </>
  );
}

function Recovery({ vm }: { vm: RecoveryViewModel }) {
  return (
    <>
      <p className="text-sm leading-relaxed">
        <span className="font-medium">{vm.signal.label}</span>
        {vm.limiterLabel ? ` · ${vm.limiterLabel}` : ''}
      </p>
      <Figures>
        <Figure label="Disponibilité" unit="/100" value={vm.readinessScore ?? '—'} />
        <Figure
          label="VFC"
          unit="ms"
          value={vm.hrv !== null ? Math.round(vm.hrv) : '—'}
          hint={
            vm.baselineLow !== null && vm.baselineHigh !== null
              ? `ta zone : ${Math.round(vm.baselineLow)}–${Math.round(vm.baselineHigh)}`
              : undefined
          }
        />
        <Figure label="FC repos" unit="bpm" value={vm.restingHr ?? '—'} />
        {vm.bodyBattery !== null ? <Figure label="Body Battery" value={vm.bodyBattery} /> : null}
      </Figures>
      {vm.sparkHrv.some((p) => p.value !== null) ? (
        <CarnetLineChart
          title="VFC et fréquence cardiaque au repos"
          data={vm.sparkHrv.map((p, i) => ({
            label: p.date,
            hrv: p.value,
            rhr: vm.sparkRhr[i]?.value ?? null,
          }))}
          series={[
            { key: 'hrv', name: 'VFC', stroke: CHART_RECOVERY_STROKE, unit: 'ms' },
            { key: 'rhr', name: 'FC repos', stroke: CHART_VO2_STROKE, unit: 'bpm', dashed: true },
          ]}
        />
      ) : null}
      <Reasons items={vm.keyEvidence} />
    </>
  );
}

function Body({ vm }: { vm: BodyViewModel }) {
  if (!vm.hasData) {
    return <Quiet>{vm.emptyState?.title ?? 'Aucune pesée.'}</Quiet>;
  }
  const mini = vm.hero.heroMini;
  return (
    <>
      <Figures>
        <Figure
          hint={vm.hero.weightDeltaDisplay}
          label="Poids"
          value={vm.hero.latestWeightDisplay}
        />
        {mini.bodyFatPct.value !== null ? (
          <Figure
            hint={mini.bodyFatPct.deltaDisplay}
            label="Masse grasse"
            tone={CORPS_TONE_TEXT[mini.bodyFatPct.tone]}
            unit="%"
            value={mini.bodyFatPct.value.toFixed(1)}
          />
        ) : null}
        {mini.musclePct.value !== null ? (
          <Figure
            hint={mini.musclePct.deltaDisplay}
            label="Muscle"
            tone={CORPS_TONE_TEXT[mini.musclePct.tone]}
            unit="%"
            value={mini.musclePct.value.toFixed(1)}
          />
        ) : null}
        {mini.visceralFat.value !== null ? (
          <Figure
            label="Graisse viscérale"
            tone={CORPS_TONE_TEXT[mini.visceralFat.tone]}
            value={mini.visceralFat.value}
          />
        ) : null}
      </Figures>
      {vm.chartData.filter((p) => p.weightKg !== null).length > 1 ? (
        <CarnetLineChart
          data={vm.chartData.map((p) => ({ label: p.label, weight: p.weightKg }))}
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
}

function Zones({ vm }: { vm: PhysicalHealthViewModel }) {
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
      <p className="text-muted-foreground text-xs leading-relaxed">{vm.medicalDisclaimer}</p>
    </>
  );
}

export default async function CarnetBodyPage() {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const day = encodeURIComponent(trainingDayIdForNow());

  const [sleep, recovery, body, physical] = await Promise.all([
    readViewModel<SleepViewModel>(`/api/presentation/sleep?trainingDayId=${day}`),
    readViewModel<RecoveryViewModel>(`/api/presentation/recovery?trainingDayId=${day}`),
    readViewModel<BodyViewModel>('/api/presentation/body?days=90'),
    readViewModel<PhysicalHealthViewModel>(
      `/api/presentation/physical-health?trainingDayId=${day}`,
    ),
  ]);

  return (
    <CarnetPage
      kicker="Le corps"
      lead="Ta nuit, ta récupération, ton corps, et les zones à ménager."
      title="Comment tu vas"
    >
      <CarnetSection label="La nuit" title={sleep?.adequacyDisplay.label}>
        {sleep ? <Sleep vm={sleep} /> : <Unreadable what="Le sommeil" />}
      </CarnetSection>
      <CarnetSection label="La récupération" title={recovery?.intensityLabel}>
        {recovery ? <Recovery vm={recovery} /> : <Unreadable what="La récupération" />}
      </CarnetSection>
      <CarnetSection label="La composition" title="Poids et composition">
        {body ? <Body vm={body} /> : <Unreadable what="La composition" />}
      </CarnetSection>
      <CarnetSection label="Les zones sensibles" title={physical?.aggregate.decisionLabel}>
        {physical ? <Zones vm={physical} /> : <Unreadable what="Les zones sensibles" />}
      </CarnetSection>
    </CarnetPage>
  );
}
