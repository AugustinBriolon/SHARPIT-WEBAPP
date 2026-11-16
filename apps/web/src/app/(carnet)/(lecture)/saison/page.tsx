import { cacheLife } from 'next/cache';
import { Suspense } from 'react';
import { addDays, differenceInCalendarDays } from 'date-fns';
import type { AdaptationViewModel } from '@sharpit/app/presentation/adaptation-view-model';
import type { EffortViewModel } from '@sharpit/app/presentation/effort-view-model';
import type { WeeklyCoachingBriefViewModel } from '@sharpit/app/presentation/weekly-coaching-brief-view-model';
import type { ClientGoal } from '@sharpit/app/lib/query/types';
import { activityTypeLabels, formatDuration } from '@sharpit/app/lib/format';
import { phaseLabels } from '@sharpit/app/lib/training/periodization/periodization';
import { CHART_BASE_STROKE, CHART_COUNTER_STROKE } from '@sharpit/app/lib/theme/chart-theme';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { CarnetBarChart, CarnetLineChart } from '@/components/carnet/carnet-charts';
import { cn } from '@sharpit/app/lib/utils';
import {
  CarnetPage,
  CarnetSection,
  Figure,
  Figures,
  Quiet,
  ReadingList,
  ReadingRow,
  Reasons,
  StatusPill,
  type StatusTone,
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
  type PlanTimeline,
  planTimeline,
  type PlanWeekReading,
  type SeasonSession,
  seasonWeeks,
  sportShares,
  upcomingSeasonSessions,
  WEEK_DAY_NAMES,
} from '@/components/carnet/carnet-season';
import type { SessionListItem } from '@/components/carnet/carnet-sessions';
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

function nextRaceOf(goals: ClientGoal[] | null, today: Date): ClientGoal | undefined {
  return goals
    ?.filter((g) => g.kind === 'RACE' && !g.achieved && g.targetDate && g.targetDate >= today)
    .sort((a, b) => (a.targetDate?.getTime() ?? 0) - (b.targetDate?.getTime() ?? 0))[0];
}

function nextRaceLead(goals: ClientGoal[] | null, today: Date): string {
  const nextRace = nextRaceOf(goals, today);
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

/** Planned sessions done: the share over the closed weeks, then one bar a week. */
function Adherence() {
  return (
    <Reading fallback={<Skel className={BLOCK} />} read={readSeason}>
      {(season) => {
        if (!season.sessions) {
          return <Unreadable what="Le plan" />;
        }
        const weeks = seasonWeeksOf(season);
        const adherence = closedAdherence(weeks);
        return (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-data text-3xl">
                <CarnetCount text={percent(adherence)} />
                {adherence === null ? null : ' %'}
              </span>
              <span className="text-muted-foreground text-[0.8125rem]">
                des séances prévues, faites
              </span>
            </p>
            <ol
              aria-label="Part des séances faites, semaine par semaine"
              className="flex h-14 items-end gap-1.5"
            >
              {weeks.map((week) => (
                <li
                  key={week.monday}
                  className="bg-border flex h-full flex-1 items-end overflow-hidden rounded-t"
                  title={`${week.label} : ${week.done} sur ${week.planned}`}
                >
                  <span
                    className="w-full rounded-t bg-(--pillar-coach)"
                    style={{ height: `${Math.round((week.adherence ?? 0) * 100)}%` }}
                  />
                </li>
              ))}
            </ol>
          </>
        );
      }}
    </Reading>
  );
}

const SPLIT_DAYS = 28;

const readRecentActivities = () =>
  readCachedSection<SessionListItem[]>(`/api/v1/activities?sinceDays=${SPLIT_DAYS}`, true);

/** Where the last four weeks went, sport by sport: a share bar and the hours. */
function SportSplit() {
  return (
    <Reading fallback={<Skel className={BLOCK} />} read={readRecentActivities}>
      {(activities) => {
        if (!activities) {
          return <Unreadable what="La répartition" />;
        }
        const shares = sportShares(activities);
        if (shares.length === 0) {
          return <Quiet>Aucune séance sur les quatre dernières semaines.</Quiet>;
        }
        return (
          <ul className="divide-border divide-y">
            {shares.map((sport) => (
              <li key={sport.type} className="flex items-center gap-3 py-2.5">
                <span className="w-24 truncate text-sm">
                  {activityTypeLabels[sport.type] ?? sport.type}
                </span>
                <span className="bg-border flex h-1.5 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-foreground h-full rounded-full"
                    style={{ width: `${Math.round(sport.share * 100)}%` }}
                  />
                </span>
                <span className="text-data text-muted-foreground w-14 text-right text-xs">
                  {formatDuration(sport.seconds)}
                </span>
              </li>
            ))}
          </ul>
        );
      }}
    </Reading>
  );
}

type PlanReading = { weeks: PlanWeekReading[] };

async function readTimeline(): Promise<PlanTimeline | null> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const plan = await readSection<PlanReading | null>('/api/v1/training-plans');
  return plan?.weeks?.length ? planTimeline(plan.weeks, trainingDayIdForNow()) : null;
}

/** Where the athlete stands in the plan, as the page's title; the plain title without a plan. */
async function SeasonTitle() {
  const timeline = await readTimeline();
  if (!timeline?.currentWeek || !timeline.currentPhase) {
    return 'Où tu en es';
  }
  return `Semaine ${timeline.currentWeek} sur ${timeline.weeks.length}, en ${phaseLabels[
    timeline.currentPhase
  ].toLowerCase()}`;
}

const TIMELINE_BAR: Record<PlanTimeline['weeks'][number]['when'], string> = {
  past: 'bg-foreground',
  current: 'bg-(--pillar-recovery)',
  ahead: 'border-muted-foreground border border-b-0',
};

function LegendMark({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-[2px]', className)} aria-hidden />
      {children}
    </span>
  );
}

/**
 * The whole plan on one line: a bar a week, as tall as its planned load, and the phases under
 * them. Passed weeks are ink, the running one takes the recovery hue, weeks ahead are outlined;
 * a lighter week is drawn pale in either state. Nothing is drawn without a plan.
 */
async function PlanTimelineSection() {
  const timeline = await readTimeline();
  if (!timeline) {
    return null;
  }
  const spoken = `Charge prévue sur ${timeline.weeks.length} semaines${
    timeline.currentWeek ? `, semaine ${timeline.currentWeek} en cours` : ''
  }`;
  return (
    <CarnetSection label="Les phases et la charge prévue, semaine par semaine">
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
        <LegendMark className="bg-foreground">Passée</LegendMark>
        <LegendMark className="bg-(--pillar-recovery)">En cours</LegendMark>
        <LegendMark className="border-muted-foreground border">À venir</LegendMark>
        <LegendMark className="bg-(--outline)">Allégée</LegendMark>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[44rem]">
          <ol aria-label={spoken} className="flex h-44 items-end gap-[3px]">
            {timeline.weeks.map((week) => (
              <li
                key={week.index}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                title={`Semaine ${week.index} : charge ${week.load}`}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    week.when === 'current' ? 'bg-foreground' : 'bg-transparent',
                  )}
                  aria-hidden
                />
                <span
                  style={{ height: `${Math.max(4, Math.round(week.share * 88))}%` }}
                  className={cn(
                    'w-full rounded-t',
                    TIMELINE_BAR[week.when],
                    week.deload && week.when === 'past' && 'bg-(--outline)',
                    week.deload && week.when === 'ahead' && 'border-(--outline)',
                  )}
                />
              </li>
            ))}
          </ol>
          <ol className="mt-2 flex gap-[3px]">
            {timeline.phases.map((phase) => (
              <li
                key={`${phase.phase}-${phase.first}`}
                style={{ flexGrow: phase.weeks, flexBasis: 0 }}
                className={cn(
                  'flex min-w-0 flex-col gap-0.5 rounded-(--shape-pill) px-3 py-2.5',
                  phase.current ? 'border-foreground border' : 'bg-(--tile)',
                )}
              >
                <span className="truncate text-xs font-semibold">{phaseLabels[phase.phase]}</span>
                <span className="text-data text-muted-foreground truncate text-xs font-normal">
                  {phase.first === phase.last ? `S${phase.first}` : `S${phase.first}–${phase.last}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </CarnetSection>
  );
}

type WeekRow = {
  key: string;
  day: string;
  title: string;
  duration: string;
  tone: StatusTone;
  word: string;
};

/** The running week as a table: each planned session on its day, a rest day where there is none. */
function weekRows(sessions: readonly SeasonSession[], today: string): WeekRow[] {
  const monday = seasonMondays(today).at(-2) ?? dayOf(today);
  return WEEK_DAY_NAMES.flatMap((name, i): WeekRow[] => {
    const dayId = dayIdOf(addDays(monday, i));
    const day = `${name.slice(0, 3)}.`;
    const ofDay = sessions.filter((s) => s.date.slice(0, 10) === dayId);
    if (ofDay.length === 0) {
      return [{ key: dayId, day, title: 'Repos', duration: '—', tone: 'unknown', word: 'Repos' }];
    }
    return ofDay.map((session, n) => {
      const done = session.completed || Boolean(session.activity);
      let status: Pick<WeekRow, 'tone' | 'word'> = { tone: 'unknown', word: 'Prévue' };
      if (done) {
        status = { tone: 'good', word: session.isKey ? 'Clé faite' : 'Faite' };
      } else if (dayId < today) {
        status = { tone: 'watch', word: 'Manquée' };
      } else if (session.isKey) {
        status = { tone: 'unknown', word: 'Clé' };
      }
      return {
        key: session.id ?? `${dayId}-${n}`,
        day,
        title: session.title ?? (session.type ? activityTypeLabels[session.type] : 'Séance'),
        duration: session.durationMin ? formatDuration(session.durationMin * 60) : '—',
        ...status,
      };
    });
  });
}

function RunningWeek() {
  return (
    <Reading fallback={<Skel className={BLOCK} />} read={readSeason}>
      {({ today, sessions }) =>
        sessions ? (
          <ul className="divide-border divide-y">
            {weekRows(sessions, today).map((row) => (
              <li key={row.key} className="flex items-center gap-4 py-3">
                <span className="text-muted-foreground w-9 text-[0.8125rem]">{row.day}</span>
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                  {row.title}
                </span>
                <span className="text-data text-muted-foreground text-[0.8125rem] font-normal">
                  {row.duration}
                </span>
                <span className="flex w-24 justify-end">
                  <StatusPill tone={row.tone}>{row.word}</StatusPill>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Unreadable what="La semaine" />
        )
      }
    </Reading>
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

/** The days left to the next race, set large beside the title; nothing without a race. */
async function RaceCountdown() {
  const [goals, todayId] = await Promise.all([readGoals(), readSeasonToday()]);
  const today = dayOf(todayId);
  const target = nextRaceOf(goals, today)?.targetDate;
  if (!target) {
    return null;
  }
  const days = differenceInCalendarDays(target, today);
  return (
    <p className="flex items-baseline gap-2.5">
      <span className="text-data text-5xl leading-none">
        <CarnetCount text={String(days)} />
      </span>
      <span className="text-muted-foreground text-sm">
        {days > 1 ? 'jours avant la course' : 'jour avant la course'}
      </span>
    </p>
  );
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
      aside={
        <Suspense fallback={null}>
          <RaceCountdown />
        </Suspense>
      }
      lead={
        <Suspense fallback={<Skel className="h-4 w-72 max-w-full" />}>
          <NextRaceLead />
        </Suspense>
      }
      side={
        <>
          <CarnetSection label={`Régularité · ${WEEKS_BACK} dernières semaines`}>
            <Adherence />
          </CarnetSection>

          <CarnetSection label="Répartition par sport · 4 semaines">
            <SportSplit />
          </CarnetSection>

          <CarnetSection label="Prochaines séances" title="À venir, dans le plan">
            <Reading fallback={<Skel className={BLOCK} />} read={readSeason}>
              {({ today, sessions }) =>
                sessions ? (
                  <UpcomingSessions
                    sessions={upcomingSeasonSessions(sessions, today)}
                    today={today}
                  />
                ) : (
                  <Unreadable what="Les prochaines séances" />
                )
              }
            </Reading>
          </CarnetSection>

          <CarnetSection label="Les objectifs" title="Vers quoi tu vas">
            <Suspense fallback={<Skel className={BLOCK} />}>
              <GoalsReading />
            </Suspense>
          </CarnetSection>
        </>
      }
      title={
        <Suspense fallback={<Skel className="h-8 w-72 max-w-full" />}>
          <SeasonTitle />
        </Suspense>
      }
      top={
        <Suspense fallback={null}>
          <PlanTimelineSection />
        </Suspense>
      }
    >
      <CarnetSection label="La semaine en cours">
        <RunningWeek />
      </CarnetSection>

      <CarnetSection
        label="Le cadre de la semaine"
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
    </CarnetPage>
  );
}
