import { cacheLife } from 'next/cache';
import { Suspense } from 'react';
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
import {
  CARNET_FRESHNESS,
  readCachedSection,
  readCachedViewModel,
  readDayViewModel,
  readSection,
} from '@/components/carnet/carnet-read';
import { ChartSkel, Reading, ReadingFigure, Skel } from '@/components/carnet/carnet-reading';
import { CarnetCount } from '@/components/carnet/carnet-animated';
import { UpcomingSessions } from '@/components/carnet/carnet-upcoming-sessions';
import {
  closedAdherence,
  type SeasonSession,
  seasonWeeks,
  upcomingSeasonSessions,
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

function nextRaceLead(goals: ClientGoal[] | null, today: Date): string {
  const nextRace = goals
    ?.filter((g) => g.kind === 'RACE' && !g.achieved && g.targetDate && g.targetDate >= today)
    .sort((a, b) => (a.targetDate?.getTime() ?? 0) - (b.targetDate?.getTime() ?? 0))[0];
  return nextRace?.targetDate
    ? `${nextRace.title}, ${countdownLabel(nextRace.targetDate, today)}.`
    : 'Les semaines passées, celle en cours et la suivante.';
}

/** Which day the page is on: the clock is read inside the private cache, never by the page. */
async function readSeasonToday(): Promise<string> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  return trainingDayIdForNow();
}

type Season = { today: string; sessions: SeasonSession[] | null };

async function readSeason(): Promise<Season> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const today = trainingDayIdForNow();
  const mondays = seasonMondays(today);
  const from = dayIdOf(mondays[0] ?? dayOf(today));
  const to = dayIdOf(addDays(mondays.at(-1) ?? dayOf(today), 6));
  const sessions = await readSection<SeasonSession[]>(
    `/api/v1/planned-sessions?from=${from}&to=${to}`,
  );
  return { today, sessions };
}

function seasonMondays(todayId: string): Date[] {
  return weekStartsEndingAt(addDays(dayOf(todayId), 7), WEEKS_BACK + 1);
}

const readGoals = () => readCachedSection<ClientGoal[]>('/api/v1/goals', true);
const readBrief = () =>
  readCachedViewModel<WeeklyCoachingBriefViewModel>('/api/presentation/weekly-coaching-brief');
const readEffort = () => readDayViewModel<EffortViewModel>('effort');
const readAdaptation = () => readDayViewModel<AdaptationViewModel>('adaptation');

const BLOCK = 'block h-24 w-full';

function seasonWeeksOf({ today, sessions }: Season) {
  return sessions ? seasonWeeks(sessions, seasonMondays(today), today) : [];
}

function Adherence() {
  return (
    <>
      <Figures>
        <Figure
          hint={`sur les ${WEEKS_BACK} dernières semaines`}
          label="Séances faites"
          value={
            <Reading read={readSeason} skeleton="h-7 w-14">
              {(season) => {
                const adherence = season.sessions ? closedAdherence(seasonWeeksOf(season)) : null;
                return (
                  <>
                    <CarnetCount text={percent(adherence)} />
                    {adherence === null ? null : (
                      <span className="text-muted-foreground text-data ml-1 text-xs">%</span>
                    )}
                  </>
                );
              }}
            </Reading>
          }
        />
      </Figures>
      <Reading fallback={<ChartSkel title="Séances par semaine" />} read={readSeason}>
        {(season) =>
          season.sessions ? (
            <CarnetBarChart
              title="Séances par semaine"
              data={seasonWeeksOf(season).map((w) => ({
                label: w.label,
                planned: w.planned,
                done: w.done,
              }))}
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
          ) : (
            <Unreadable what="Le plan" />
          )
        }
      </Reading>
    </>
  );
}

function Adaptation() {
  return (
    <Reading fallback={<Skel className={BLOCK} />} read={readAdaptation}>
      {(adaptation) =>
        adaptation ? (
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
        )
      }
    </Reading>
  );
}

function Load() {
  return (
    <>
      <Reading fallback={<Skel className="h-5 w-56" />} read={readEffort}>
        {(effort) =>
          effort ? (
            <p className="text-sm leading-relaxed">
              <span className="font-medium">{effort.verdict}</span>
              {effort.fatigueTypeLabel ? ` · ${effort.fatigueTypeLabel}` : ''}
            </p>
          ) : (
            <Unreadable what="La charge" />
          )
        }
      </Reading>
      <Figures>
        <Figure
          label="Forme chronique"
          value={<ReadingFigure pick={(e) => e.pmcSeries.at(-1)?.ctl} read={readEffort} />}
        />
        <Figure
          label="Fatigue aiguë"
          value={<ReadingFigure pick={(e) => e.pmcSeries.at(-1)?.atl} read={readEffort} />}
        />
        <Figure
          label="Forme nette"
          value={
            <ReadingFigure
              pick={(e) => (e.tsb !== null ? Math.round(e.tsb) : null)}
              read={readEffort}
            />
          }
        />
        <Figure
          hint="charge aiguë / chronique"
          label="Ratio"
          value={
            <ReadingFigure
              pick={(e) => (Number.isFinite(e.acwr) ? e.acwr.toFixed(2) : null)}
              read={readEffort}
            />
          }
        />
      </Figures>
      <Reading fallback={<ChartSkel title="Charge contre forme" />} read={readEffort}>
        {(effort) =>
          effort && effort.pmcSeries.length > 0 ? (
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
          ) : null
        }
      </Reading>
      <Reading fallback={<ChartSkel title="Charge par semaine" />} read={readEffort}>
        {(effort) =>
          effort && effort.weeklyTss.some((w) => w.tss > 0) ? (
            <CarnetBarChart
              average={effort.avgWeeklyTss}
              data={effort.weeklyTss.map((w) => ({ label: w.week, tss: w.tss }))}
              series={[{ key: 'tss', name: 'Charge', stroke: CHART_BASE_STROKE }]}
              title="Charge par semaine"
            />
          ) : null
        }
      </Reading>
      <Reading fallback={null} read={readEffort}>
        {(effort) => (effort ? <Reasons items={effort.keyEvidence} /> : null)}
      </Reading>
    </>
  );
}

async function NextRaceLead() {
  const [goals, todayId] = await Promise.all([readGoals(), readSeasonToday()]);
  return nextRaceLead(goals, dayOf(todayId));
}

async function GoalsReading() {
  const [goals, todayId] = await Promise.all([readGoals(), readSeasonToday()]);
  return goals ? (
    <Goals goals={goals} today={dayOf(todayId)} />
  ) : (
    <Unreadable what="Les objectifs" />
  );
}

export default function CarnetSeasonPage() {
  return (
    <CarnetPage
      kicker="La saison"
      title="Où tu en es"
      lead={
        <Suspense fallback={<Skel className="h-4 w-72 max-w-full" />}>
          <NextRaceLead />
        </Suspense>
      }
    >
      <CarnetSection
        label="La semaine"
        title={
          <Reading read={readBrief} skeleton="h-5 w-44">
            {(brief) => (brief ? `${brief.weekStartLabel} – ${brief.weekEndLabel}` : null)}
          </Reading>
        }
      >
        <Reading fallback={<Skel className={BLOCK} />} read={readBrief}>
          {(brief) => (brief ? <Brief brief={brief} /> : <Unreadable what="La semaine" />)}
        </Reading>
      </CarnetSection>

      <CarnetSection label="Prochaines séances" title="À venir, dans le plan">
        <Reading fallback={<Skel className={BLOCK} />} read={readSeason}>
          {({ today, sessions }) =>
            sessions ? (
              <UpcomingSessions sessions={upcomingSeasonSessions(sessions, today)} today={today} />
            ) : (
              <Unreadable what="Les prochaines séances" />
            )
          }
        </Reading>
      </CarnetSection>

      <CarnetSection label="La régularité" title="Séances prévues, séances faites">
        <Adherence />
      </CarnetSection>

      <CarnetSection label="La charge" title="Ce que l'entraînement coûte">
        <Load />
      </CarnetSection>

      <CarnetSection
        label="L'adaptation"
        title={
          <Reading read={readAdaptation} skeleton="h-5 w-36">
            {(adaptation) => adaptation?.statusLabel}
          </Reading>
        }
      >
        <Adaptation />
      </CarnetSection>

      <CarnetSection label="Les objectifs" title="Vers quoi tu vas">
        <Suspense fallback={<Skel className={BLOCK} />}>
          <GoalsReading />
        </Suspense>
      </CarnetSection>
    </CarnetPage>
  );
}
