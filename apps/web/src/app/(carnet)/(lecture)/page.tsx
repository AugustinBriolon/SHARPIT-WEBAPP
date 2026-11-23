import { Suspense, type ReactNode } from 'react';
import { cacheLife } from 'next/cache';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import type { TodayViewModel } from '@sharpit/app/presentation/today-view-model';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { addDays, startOfWeek } from 'date-fns';
import { CARNET_FRESHNESS, readSection, readViewModel } from '@/components/carnet/carnet-read';
import {
  type SeasonSession,
  WEEK_DAY_NAMES,
  type WeekDayKind,
  weekDayKinds,
} from '@/components/carnet/carnet-season';
import { Reading, Skel } from '@/components/carnet/carnet-reading';
import {
  carnetHref,
  dayIdOf,
  dayStrip,
  dayOf,
  longDayLabel,
  resolveDayParam,
} from '@/components/carnet/carnet-time';
import {
  CarnetPage,
  MeasureRow,
  Quiet,
  ReadingList,
  ReadingRow,
  StatusPill,
  type StatusTone,
  Tile,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { CarnetEmptyDay } from '@/components/carnet/carnet-empty-day';
import { RaceBand } from '@/components/carnet/carnet-race';
import { ScoreRing, ScoreRingSkel } from '@/components/carnet/carnet-cards';
import { MorningCheckInReminder } from '@/components/today/morning-check-in-sheet';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

type PageProps = { searchParams: Promise<{ jour?: string | string[] }> };

// A hue names a reading on its ring, never as text (ADR-130).
const SIGNALS = [
  { key: 'sleep', label: 'Sommeil', score: 'sleepScore', stroke: 'var(--pillar-sleep)' },
  {
    key: 'recovery',
    label: 'Récupération',
    score: 'recoveryScore',
    stroke: 'var(--pillar-recovery)',
  },
  { key: 'effort', label: 'Effort', score: 'effortScore', stroke: 'var(--pillar-nutrition)' },
  {
    key: 'adaptation',
    label: 'Adaptation',
    score: 'adaptationScore',
    stroke: 'var(--pillar-coach)',
  },
] as const;

function TodayAside({ day, today }: { day: string; today: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DayPicker day={day} today={today} />
      {day === today ? <MorningCheckInReminder /> : null}
    </div>
  );
}

const hrefOfDay = (id: string, today: string) => (id === today ? '/' : `/?jour=${id}`);

const PICKER_STEP =
  'pressable text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-ring grid size-9 place-items-center rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none';
const PICKER_DAY =
  'flex size-9 flex-col items-center justify-center rounded-full text-[0.8125rem] leading-none';

/**
 * The day, picked from seven: each one to tap, the one shown in ink, and a step to the seven
 * days before or after. Today keeps a dot when another day is shown.
 */
function DayPicker({ day, today }: { day: string; today: string }) {
  const strip = dayStrip(day, today);
  return (
    <nav aria-label="Jours" className="bg-background flex items-center gap-0.5 rounded-full p-1">
      <Link
        aria-label="Semaine précédente"
        className={PICKER_STEP}
        href={hrefOfDay(strip.previous, today)}
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
      </Link>
      {strip.days.map((stripDay) => {
        const face = (
          <>
            <span className="text-[0.625rem] opacity-70" aria-hidden>
              {stripDay.letter}
            </span>
            <span className="mt-0.5 font-medium tabular-nums" aria-hidden>
              {stripDay.dayOfMonth}
            </span>
          </>
        );
        const shown = stripDay.id === day;
        return (
          <Link
            key={stripDay.id}
            aria-current={shown ? 'date' : undefined}
            aria-label={stripDay.label}
            href={hrefOfDay(stripDay.id, today)}
            className={cn(
              PICKER_DAY,
              'pressable focus-visible:ring-ring relative transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none',
              shown ? 'bg-primary text-primary-foreground' : 'hover:bg-card',
            )}
          >
            {face}
            {stripDay.id === today && !shown ? (
              <span className="bg-foreground absolute bottom-0.5 size-1 rounded-full" aria-hidden />
            ) : null}
          </Link>
        );
      })}
      {strip.next ? (
        <Link
          aria-label="Semaine suivante"
          className={PICKER_STEP}
          href={hrefOfDay(strip.next, today)}
        >
          <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden />
        </Link>
      ) : (
        <span className="size-9" aria-hidden />
      )}
    </nav>
  );
}

/** The day's posture as the server decided it; an uncertain day is not judged. */
const POSTURE_TONE: Record<TodayViewModel['hero']['posture'], StatusTone> = {
  push: 'good',
  steady: 'good',
  protect: 'watch',
  uncertain: 'unknown',
};

type SignalPreview = TodayViewModel['hero']['signalPreviews'][number];

function gaugeOf(preview: SignalPreview | undefined) {
  return preview?.visual.kind === 'gauge' ? preview.visual : null;
}

/** A reading's word, then what it is read against when that says more. */
function SignalWord({ preview }: { preview: SignalPreview | undefined }) {
  const gauge = gaugeOf(preview);
  const word = gauge?.statusLabel ?? preview?.subtitle ?? 'Pas encore';
  const against = gauge?.baselineDetail ?? gauge?.baselineTitle;
  return (
    <p className="text-muted-foreground mt-0.5 text-[0.8125rem] text-balance">
      {word}
      {against && against !== word ? <span className="block">{against}</span> : null}
    </p>
  );
}

/** The four readings side by side: a ring that draws in the reading's hue, its name, its word. */
function Signals({ hero }: { hero: TodayViewModel['hero'] | undefined }) {
  const previews = new Map((hero?.signalPreviews ?? []).map((p) => [p.key, p]));
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
      {SIGNALS.map((signal) => {
        const rawScore = hero?.metricsRow[signal.score];
        const score = typeof rawScore === 'number' ? rawScore : null;
        const preview = previews.get(signal.key);
        return (
          <li key={signal.key} className="flex flex-col items-center gap-3 text-center">
            {hero ? (
              <ScoreRing
                caption="/100"
                stroke={signal.stroke}
                value={score}
                text={
                  score !== null && signal.key === 'effort'
                    ? String(Math.round(score * 10) / 10)
                    : undefined
                }
              />
            ) : (
              <ScoreRingSkel caption="/100" />
            )}
            <div>
              <p className="text-sm font-medium">{signal.label}</p>
              {hero ? <SignalWord preview={preview} /> : <Skel className="mt-1 h-4 w-16" />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Why the day reads as it does: the reasons as the server wrote them, then what holds it back. */
function Why({ vm, reasons }: { vm: TodayViewModel; reasons: readonly string[] }) {
  return (
    <>
      {vm.statusMessage ? <Quiet>{vm.statusMessage}</Quiet> : null}
      <ul className="divide-border divide-y">
        {reasons.map((reason) => (
          <li key={reason} className="py-3 text-[0.9375rem] leading-relaxed first:pt-0">
            {reason}
          </li>
        ))}
        {vm.actionRow.limitingFacts.map((fact) => (
          <MeasureRow key={fact.label} against={fact.hint} label={fact.label} value={fact.value} />
        ))}
      </ul>
    </>
  );
}

type MorningProposal = NonNullable<TodayViewModel['actionRow']['morningRecalibration']>;

function prescription(intensity: string | null, durationMin: number | null): string {
  return [intensity, durationMin ? `${durationMin} min` : null].filter(Boolean).join(' · ');
}

/** The morning's proposal: what was planned, struck; what is proposed; decided in the app. */
function Proposal({ proposal }: { proposal: MorningProposal }) {
  const from = prescription(proposal.fromIntensity, proposal.fromDurationMin);
  const to = prescription(proposal.toIntensity, proposal.toDurationMin);
  return (
    <div className="flex flex-col gap-2">
      {from ? <p className="text-muted-foreground text-[0.8125rem] line-through">{from}</p> : null}
      <p className="text-xl leading-snug font-medium">{to || proposal.changeSummary}</p>
      <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{proposal.why}</p>
      <p className="text-muted-foreground text-[0.8125rem]">À valider dans l&apos;app</p>
    </div>
  );
}

const WEEK_DOT: Record<WeekDayKind, string> = {
  done: 'bg-foreground',
  key: 'border-foreground border-[3px]',
  planned: 'border border-(--outline)',
  // On a tile, an empty day is the sheet's white showing through.
  none: 'bg-card',
};

const WEEK_WORD: Record<WeekDayKind, string> = {
  done: 'faite',
  key: 'séance clé prévue',
  planned: 'séance prévue',
  none: 'rien de prévu',
};

async function readWeek(jour: string | undefined): Promise<WeekDayKind[] | null> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const { day } = await readTodayDay(jour);
  const monday = startOfWeek(dayOf(day), { weekStartsOn: 1 });
  const sessions = await readSection<SeasonSession[]>(
    `/api/v1/planned-sessions?from=${dayIdOf(monday)}&to=${dayIdOf(addDays(monday, 6))}`,
  );
  return sessions ? weekDayKinds(sessions, monday) : null;
}

/** The seven days of the week as dots: full when done, a thick ring for a key session ahead. */
function Week({ jour }: { jour: string | undefined }) {
  return (
    <Reading fallback={<Skel className="block h-14 w-full" />} read={() => readWeek(jour)}>
      {(days) =>
        days ? (
          <>
            <ol className="grid grid-cols-7 gap-1.5">
              {days.map((kind, i) => (
                <li key={WEEK_DAY_NAMES[i]} className="flex flex-col items-center gap-1.5">
                  <span className="text-muted-foreground text-[0.6875rem]" aria-hidden>
                    {WEEK_DAY_NAMES[i]?.charAt(0).toUpperCase()}
                  </span>
                  <span
                    aria-label={`${WEEK_DAY_NAMES[i]} : ${WEEK_WORD[kind]}`}
                    className={`size-7 rounded-full ${WEEK_DOT[kind]}`}
                    role="img"
                  />
                </li>
              ))}
            </ol>
            <Quiet>Plein : faite · contour épais : clé · contour fin : prévue</Quiet>
          </>
        ) : (
          <Unreadable what="La semaine" />
        )
      }
    </Reading>
  );
}

function TheDay({ vm }: { vm: TodayViewModel }) {
  const lines = vm.actionRow.daySummaryLines;
  if (lines.length === 0) {
    return <Quiet>{vm.actionRow.daySummaryEmptyText}</Quiet>;
  }
  return (
    <ReadingList>
      {lines.map((line) => (
        <ReadingRow key={line.id} href={line.isDone ? carnetHref(line.href) : null}>
          <div className="min-w-0">
            <p className="text-label text-muted-foreground">
              {activityTypeLabels[line.activityType] ?? line.activityType}
              {line.isKey ? ' · séance clé' : ''}
              {line.isDone ? ' · faite' : ' · prévue'}
            </p>
            <p className="mt-1 font-medium">{line.primary}</p>
            {line.secondary ? (
              <p className="text-muted-foreground mt-0.5 text-sm">{line.secondary}</p>
            ) : null}
            {line.purpose ? (
              <p className="text-muted-foreground mt-0.5 text-sm">{line.purpose}</p>
            ) : null}
            {line.morningChoiceLabel ? (
              <p className="text-muted-foreground mt-0.5 text-sm">{line.morningChoiceLabel}</p>
            ) : null}
          </div>
          {line.metrics?.length && !line.secondary ? (
            <p className="text-data text-muted-foreground shrink-0 text-right text-xs">
              {line.metrics.map((m) => `${m.value}${m.unit ? ` ${m.unit}` : ''}`).join(' · ')}
            </p>
          ) : null}
        </ReadingRow>
      ))}
    </ReadingList>
  );
}

// The address (URL data) is read outside the private cache and handed in as plain values:
// read inside, it would keep the route's App Shell from ever settling.
export default function CarnetTodayPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<TodayFrame jour={undefined} vm={undefined} />}>
      <TodayWithDay searchParams={searchParams} />
    </Suspense>
  );
}

async function TodayWithDay({ searchParams }: PageProps) {
  const { jour } = await searchParams;
  return <TodayReading jour={jour} />;
}

type TodayDay = { today: string; day: string };

/** Which day the page is on: the clock is read inside the private cache, never by the page. */
async function readTodayDay(jour: string | undefined): Promise<TodayDay> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const today = trainingDayIdForNow();
  return { today, day: resolveDayParam(jour, today) };
}

async function readTodayViewModel(jour: string | undefined): Promise<TodayViewModel | null> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const { day } = await readTodayDay(jour);
  return readViewModel<TodayViewModel>(
    `/api/presentation/today?trainingDayId=${encodeURIComponent(day)}`,
  );
}

function TodayReading({ jour }: { jour: string | string[] | undefined }) {
  const single = Array.isArray(jour) ? jour[0] : jour;
  return (
    <Reading
      fallback={<TodayFrame jour={single} vm={undefined} />}
      read={() => readTodayViewModel(single)}
    >
      {(vm) => <TodayFrame jour={single} vm={vm} />}
    </Reading>
  );
}

/**
 * The page's frame, drawn while the reading is awaited (`vm` undefined: every label shows, each
 * value is a skeleton) and again once it landed. The day itself is read separately: it takes no
 * API call, so the kicker and the pager are there at once.
 */
function TodayFrame({
  jour,
  vm,
}: {
  jour: string | undefined;
  vm: TodayViewModel | null | undefined;
}) {
  const readDay = () => readTodayDay(jour);
  const kicker = (
    <Reading read={readDay} skeleton="h-3 w-44">
      {({ day, today }) =>
        day === today ? `Aujourd'hui · ${longDayLabel(day)}` : longDayLabel(day)
      }
    </Reading>
  );
  const aside = (
    <Reading fallback={null} read={readDay}>
      {({ day, today }) => <TodayAside day={day} today={today} />}
    </Reading>
  );

  if (vm === null) {
    return (
      <CarnetPage aside={aside} kicker={kicker} title="Ta journée">
        <Unreadable what="Cette journée" />
      </CarnetPage>
    );
  }

  if (vm && !vm.hasContent && vm.emptyState) {
    return (
      <CarnetEmptyDay
        aside={aside}
        description={vm.emptyState.description}
        kicker={kicker}
        race={vm.race}
        title={vm.emptyState.title}
      />
    );
  }

  const hero = vm?.hero;
  const actionRow = vm?.actionRow;
  const trust = hero?.twinTrustStrip;
  // Prefer instruction; skip actionLine when it mirrors instruction (legacy fill).
  const reasons = hero
    ? [
        trust?.instruction ? null : hero.actionLine,
        hero.goalLine,
        ...hero.adaptationReminders,
      ].filter((line): line is string => Boolean(line))
    : [];

  // The verdict is the page's title (the instruction when the server wrote one), its posture the
  // pill beside it; what limits the day and how sure the reading is close the lead.
  const title: ReactNode =
    hero && trust ? (trust.instruction ?? hero.headline) : <Skel className="h-8 w-56" />;
  const explained = [trust?.explanation?.essential, ...reasons].filter((line): line is string =>
    Boolean(line),
  );
  const proposal =
    actionRow?.morningRecalibration?.status === 'PRESENTED' ? actionRow.morningRecalibration : null;

  return (
    <CarnetPage
      aside={aside}
      kicker={kicker}
      lead={hero && trust ? <VerdictLead hero={hero} /> : <Skel className="h-4 w-80 max-w-full" />}
      title={title}
      status={
        hero?.postureLabel ? (
          <StatusPill tone={POSTURE_TONE[hero.posture]}>{hero.postureLabel}</StatusPill>
        ) : null
      }
    >
      {vm ? <RaceBand race={vm.race} /> : null}

      {/* The day as a grid of widgets (ADR-144): what the body says, the week, then why and what. */}
      <div className="grid gap-4 lg:col-span-full lg:grid-cols-6">
        <Tile className="lg:col-span-4" title="Les quatre lectures">
          <Signals hero={hero} />
        </Tile>
        <Tile className="lg:col-span-2" title="Cette semaine">
          <Week jour={jour} />
        </Tile>
        {proposal ? (
          <Tile className="lg:col-span-6" title="Proposé ce matin">
            <Proposal proposal={proposal} />
          </Tile>
        ) : null}
        <Tile className="lg:col-span-3" title="Pourquoi">
          {vm ? (
            <Why reasons={explained} vm={vm} />
          ) : (
            <div className="space-y-2">
              <Skel className="block h-4 w-full" />
              <Skel className="block h-4 w-2/3" />
            </div>
          )}
        </Tile>
        <Tile className="lg:col-span-3" title="Le déroulé du jour">
          {vm ? <TheDay vm={vm} /> : <Skel className="block h-16 w-full" />}
        </Tile>
        {vm && vm.insights.length > 0 ? (
          <Tile className="lg:col-span-6" title="Ce que le coach remarque">
            <ul className="grid gap-x-10 gap-y-6 md:grid-cols-2">
              {vm.insights.map((insight) => (
                <li key={insight.id}>
                  <p className="font-medium">{insight.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {insight.summary}
                  </p>
                </li>
              ))}
            </ul>
          </Tile>
        ) : null}
      </div>
    </CarnetPage>
  );
}

/** Under the verdict: its subline, then what limits the day and how sure the reading is. */
function VerdictLead({ hero }: { hero: TodayViewModel['hero'] }) {
  const trust = hero.twinTrustStrip;
  const limits = [
    trust.limitingCauseText,
    trust.confidenceLabel ? `Confiance ${trust.confidenceLabel.toLowerCase()}` : null,
  ].filter(Boolean);
  return (
    <>
      <p>{hero.subline}</p>
      {limits.length > 0 ? <p className="mt-1 text-sm">{limits.join(' · ')}</p> : null}
    </>
  );
}
