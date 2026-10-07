import { cacheLife } from 'next/cache';
import { addDays } from 'date-fns';
import type { AdaptationViewModel } from '@sharpit/app/presentation/adaptation-view-model';
import type { EffortViewModel } from '@sharpit/app/presentation/effort-view-model';
import type { WeeklyCoachingBriefViewModel } from '@sharpit/app/presentation/weekly-coaching-brief-view-model';
import type { ClientGoal } from '@sharpit/app/lib/query/types';
import { CHART_BASE_STROKE, CHART_COUNTER_STROKE } from '@sharpit/app/lib/theme/chart-theme';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { CarnetBarChart, CarnetLineChart } from '@/components/carnet/carnet-charts';
import {
  CarnetPage,
  CarnetSection,
  Figure,
  Figures,
  Quiet,
  ReadingList,
  ReadingRow,
  Reasons,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { CARNET_FRESHNESS, readSection, readViewModel } from '@/components/carnet/carnet-read';
import {
  closedAdherence,
  type SeasonSession,
  seasonWeeks,
} from '@/components/carnet/carnet-season';
import {
  countdownLabel,
  dayIdOf,
  dayOf,
  weekStartsEndingAt,
} from '@/components/carnet/carnet-time';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

const WEEKS_BACK = 10;

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}`;
}

function Goals({ goals, today }: { goals: ClientGoal[]; today: Date }) {
  const ahead = goals
    .filter((g) => !g.achieved)
    .sort(
      (a, b) =>
        (a.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER),
    );
  if (ahead.length === 0) {
    return <Quiet>Aucun objectif en cours.</Quiet>;
  }
  return (
    <ReadingList>
      {ahead.map((goal) => (
        <ReadingRow key={goal.id} href={null}>
          <div className="min-w-0">
            <p className="text-label text-muted-foreground">
              {goal.kind === 'RACE'
                ? `Course${goal.priority ? ` ${goal.priority}` : ''}`
                : 'Objectif'}
              {goal.raceFormat ? ` · ${goal.raceFormat}` : ''}
            </p>
            <p className="mt-1 font-medium">{goal.title}</p>
            {goal.targetPerformance ? (
              <p className="text-muted-foreground mt-0.5 text-sm">
                Visé : {goal.targetPerformance}
              </p>
            ) : null}
            {goal.kind !== 'RACE' && goal.targetValue !== null ? (
              <p className="text-muted-foreground mt-0.5 text-sm">
                {goal.currentValue ?? '—'} / {goal.targetValue}
                {goal.unit ? ` ${goal.unit}` : ''}
              </p>
            ) : null}
          </div>
          {goal.targetDate ? (
            <p className="text-data text-muted-foreground shrink-0 text-right text-xs">
              {countdownLabel(goal.targetDate, today)}
            </p>
          ) : null}
        </ReadingRow>
      ))}
    </ReadingList>
  );
}

function Brief({ brief }: { brief: WeeklyCoachingBriefViewModel }) {
  if (!brief.visible) {
    return <Quiet>{brief.emptyState?.title ?? 'Pas de semaine planifiée.'}</Quiet>;
  }
  return (
    <>
      {brief.planContext ? (
        <p className="text-sm leading-relaxed">
          <span className="font-medium">{brief.planContext.phaseLabel}</span>
          {brief.planContext.isDeload ? ' · semaine allégée' : ''}
          {brief.planContext.focus ? ` · ${brief.planContext.focus}` : ''}
        </p>
      ) : null}
      {brief.load ? (
        <Figures>
          <Figure label="Charge prévue" value={Math.round(brief.load.plannedLoad)} />
          <Figure
            label="Charge tolérée"
            value={
              brief.load.toleratedCeiling !== null ? Math.round(brief.load.toleratedCeiling) : '—'
            }
          />
        </Figures>
      ) : null}
      {brief.keySessions.length > 0 ? (
        <ReadingList>
          {brief.keySessions.map((s) => (
            <ReadingRow key={s.sessionId} href={null}>
              <div className="min-w-0">
                <p className="text-label text-muted-foreground">{s.dateLabel} · séance clé</p>
                <p className="mt-1 font-medium">
                  {s.typeLabel}
                  {s.intensityLabel ? ` · ${s.intensityLabel}` : ''}
                </p>
                {s.purpose ? (
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    <span className="text-label text-muted-foreground">Pourquoi · </span>
                    {s.purpose}
                  </p>
                ) : null}
              </div>
            </ReadingRow>
          ))}
        </ReadingList>
      ) : null}
      {brief.recovery ? <Quiet>{brief.recovery.note}</Quiet> : null}
      {brief.whatWouldChange.length > 0 ? (
        <div>
          <p className="text-label text-muted-foreground mb-2">Ce qui ferait bouger la semaine</p>
          <Reasons items={brief.whatWouldChange} />
        </div>
      ) : null}
    </>
  );
}

function Load({ effort }: { effort: EffortViewModel }) {
  return (
    <>
      <p className="text-sm leading-relaxed">
        <span className="font-medium">{effort.verdict}</span>
        {effort.fatigueTypeLabel ? ` · ${effort.fatigueTypeLabel}` : ''}
      </p>
      <Figures>
        <Figure label="Forme chronique" value={effort.pmcSeries.at(-1)?.ctl ?? '—'} />
        <Figure label="Fatigue aiguë" value={effort.pmcSeries.at(-1)?.atl ?? '—'} />
        <Figure label="Forme nette" value={effort.tsb !== null ? Math.round(effort.tsb) : '—'} />
        <Figure
          hint="charge aiguë / chronique"
          label="Ratio"
          value={Number.isFinite(effort.acwr) ? effort.acwr.toFixed(2) : '—'}
        />
      </Figures>
      {effort.pmcSeries.length > 0 ? (
        <CarnetLineChart
          title="Charge contre forme"
          data={effort.pmcSeries.map((p) => ({
            label: p.label,
            ctl: p.ctl,
            atl: p.atl,
            tsb: p.tsb,
          }))}
          series={[
            { key: 'ctl', name: 'Forme chronique', stroke: CHART_BASE_STROKE },
            { key: 'atl', name: 'Fatigue aiguë', stroke: CHART_COUNTER_STROKE, dashed: true },
            { key: 'tsb', name: 'Forme nette', stroke: 'var(--muted-foreground)' },
          ]}
          zeroLine
        />
      ) : null}
      {effort.weeklyTss.some((w) => w.tss > 0) ? (
        <CarnetBarChart
          average={effort.avgWeeklyTss}
          data={effort.weeklyTss.map((w) => ({ label: w.week, tss: w.tss }))}
          series={[{ key: 'tss', name: 'Charge', stroke: CHART_BASE_STROKE }]}
          title="Charge par semaine"
        />
      ) : null}
      <Reasons items={effort.keyEvidence} />
    </>
  );
}

export default async function CarnetSeasonPage() {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const todayId = trainingDayIdForNow();
  const today = dayOf(todayId);
  const mondays = weekStartsEndingAt(addDays(today, 7), WEEKS_BACK + 1);
  const from = dayIdOf(mondays[0] ?? today);
  const to = dayIdOf(addDays(mondays.at(-1) ?? today, 6));
  const day = encodeURIComponent(todayId);

  const [goals, sessions, brief, effort, adaptation] = await Promise.all([
    readSection<ClientGoal[]>('/api/v1/goals', true),
    readSection<SeasonSession[]>(`/api/v1/planned-sessions?from=${from}&to=${to}`),
    readViewModel<WeeklyCoachingBriefViewModel>('/api/presentation/weekly-coaching-brief'),
    readViewModel<EffortViewModel>(`/api/presentation/effort?trainingDayId=${day}`),
    readViewModel<AdaptationViewModel>(`/api/presentation/adaptation?trainingDayId=${day}`),
  ]);

  const weeks = sessions ? seasonWeeks(sessions, mondays, todayId) : [];
  const adherence = closedAdherence(weeks);
  const nextRace = goals
    ?.filter((g) => g.kind === 'RACE' && !g.achieved && g.targetDate && g.targetDate >= today)
    .sort((a, b) => (a.targetDate?.getTime() ?? 0) - (b.targetDate?.getTime() ?? 0))[0];

  return (
    <CarnetPage
      kicker="La saison"
      title="Où tu en es"
      lead={
        nextRace?.targetDate
          ? `${nextRace.title}, ${countdownLabel(nextRace.targetDate, today)}.`
          : 'Les semaines passées, celle en cours et la suivante.'
      }
    >
      <CarnetSection
        label="La semaine"
        title={brief ? `${brief.weekStartLabel} – ${brief.weekEndLabel}` : undefined}
      >
        {brief ? <Brief brief={brief} /> : <Unreadable what="La semaine" />}
      </CarnetSection>

      <CarnetSection label="La régularité" title="Séances prévues, séances faites">
        {sessions ? (
          <>
            <Figures>
              <Figure
                hint={`sur les ${WEEKS_BACK} dernières semaines`}
                label="Séances faites"
                unit="%"
                value={percent(adherence)}
              />
            </Figures>
            <CarnetBarChart
              data={weeks.map((w) => ({ label: w.label, planned: w.planned, done: w.done }))}
              title="Séances par semaine"
              series={[
                {
                  key: 'planned',
                  name: 'Prévues',
                  stroke: 'var(--muted-foreground)',
                  dashed: true,
                },
                { key: 'done', name: 'Faites', stroke: CHART_BASE_STROKE },
              ]}
            />
          </>
        ) : (
          <Unreadable what="Le plan" />
        )}
      </CarnetSection>

      <CarnetSection label="La charge" title="Ce que l'entraînement coûte">
        {effort ? <Load effort={effort} /> : <Unreadable what="La charge" />}
      </CarnetSection>

      <CarnetSection label="L'adaptation" title={adaptation?.statusLabel}>
        {adaptation ? (
          <>
            <p className="text-sm leading-relaxed">
              <span className="font-medium">{adaptation.verdictLabel}</span>
              {adaptation.trendLabel ? ` · ${adaptation.trendLabel}` : ''}
            </p>
            {adaptation.limitingFactor ? <Quiet>Frein : {adaptation.limitingFactor}</Quiet> : null}
            <Reasons items={[...adaptation.rationale, ...adaptation.keyEvidence]} />
          </>
        ) : (
          <Unreadable what="L'adaptation" />
        )}
      </CarnetSection>

      <CarnetSection label="Les objectifs" title="Vers quoi tu vas">
        {goals ? <Goals goals={goals} today={today} /> : <Unreadable what="Les objectifs" />}
      </CarnetSection>
    </CarnetPage>
  );
}
