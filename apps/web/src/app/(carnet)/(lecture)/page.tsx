import { Suspense, type ReactNode } from 'react';
import { cacheLife } from 'next/cache';
import type { TodayViewModel } from '@sharpit/app/presentation/today-view-model';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { limiterSignalChipForMode } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import { addTrainingDays, trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { CARNET_FRESHNESS, readViewModel } from '@/components/carnet/carnet-read';
import { Reading, Skel } from '@/components/carnet/carnet-reading';
import { carnetHref, longDayLabel, resolveDayParam } from '@/components/carnet/carnet-time';
import {
  CarnetPage,
  CarnetStepLink,
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
import { CarnetEmptyDay } from '@/components/carnet/carnet-empty-day';
import { RaceBand } from '@/components/carnet/carnet-race';
import { MorningCheckInReminder } from '@/components/today/morning-check-in-sheet';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

type PageProps = { searchParams: Promise<{ jour?: string | string[] }> };

const SIGNALS = [
  { key: 'sleep', label: 'Sommeil', score: 'sleepScore' },
  { key: 'recovery', label: 'Récupération', score: 'recoveryScore' },
  { key: 'effort', label: 'Effort', score: 'effortScore' },
  { key: 'adaptation', label: 'Adaptation', score: 'adaptationScore' },
] as const;

function TodayAside({ day, today }: { day: string; today: string }) {
  return (
    <div className="flex items-center gap-1">
      {day === today ? <MorningCheckInReminder /> : null}
      <DayPager day={day} today={today} />
    </div>
  );
}

function DayPager({ day, today }: { day: string; today: string }) {
  const previous = addTrainingDays(day, -1);
  const next = addTrainingDays(day, 1);
  return (
    <nav aria-label="Jours" className="-mr-2.5 flex gap-1">
      <CarnetStepLink direction="back" href={`/?jour=${previous}`}>
        Veille
      </CarnetStepLink>
      {day < today ? (
        <CarnetStepLink direction="next" href={next === today ? '/' : `/?jour=${next}`}>
          Lendemain
        </CarnetStepLink>
      ) : null}
    </nav>
  );
}

function Signals({ hero }: { hero: TodayViewModel['hero'] | undefined }) {
  const previews = new Map((hero?.signalPreviews ?? []).map((p) => [p.key, p]));
  return (
    <Figures>
      {SIGNALS.map((signal) => {
        const rawScore = hero?.metricsRow[signal.score];
        const preview = previews.get(signal.key);
        let score: string | number | null | undefined = rawScore ?? '—';
        if (typeof rawScore === 'number') {
          score = signal.key === 'effort' ? Math.round(rawScore * 10) / 10 : Math.round(rawScore);
        }
        return (
          <Figure
            key={signal.key}
            hint={hero ? (preview?.subtitle ?? null) : <Skel className="h-3 w-20" />}
            label={signal.label}
            unit={hero && rawScore !== null && rawScore !== undefined ? '/100' : null}
            value={hero ? score : <Skel className="h-7 w-12" />}
          />
        );
      })}
    </Figures>
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

  let title: ReactNode = <Skel className="h-8 w-56" />;
  if (hero && trust) {
    title = trust.showHeadline === false ? 'Ta journée' : hero.headline;
  }

  return (
    <CarnetPage
      aside={aside}
      kicker={kicker}
      lead={hero ? hero.subline : <Skel className="h-4 w-80 max-w-full" />}
      title={title}
    >
      {vm ? <RaceBand race={vm.race} /> : null}

      <CarnetSection
        label="Le verdict"
        title={hero ? <Verdict hero={hero} /> : <Skel className="h-5 w-44" />}
      >
        {vm && hero && trust ? (
          <>
            {vm.statusMessage ? <Quiet>{vm.statusMessage}</Quiet> : null}
            {trust.explanation?.essential ? (
              <p className="text-sm leading-relaxed">{trust.explanation.essential}</p>
            ) : null}
            {trust.instruction ? (
              <p className="text-sm leading-relaxed font-medium">{trust.instruction}</p>
            ) : null}
            {trust.limiterCountLabel ? (
              <p className="text-label text-muted-foreground">Frein · {trust.limiterCountLabel}</p>
            ) : null}
            {!trust.limiterCountLabel && trust.limiterSignals[0] ? (
              <p className="text-label text-muted-foreground">
                {limiterSignalChipForMode(trust.limiterSignals[0], 'essential')}
              </p>
            ) : null}
            <Reasons items={reasons} />
            {actionRow?.morningRecalibration?.status === 'PRESENTED' ? (
              <>
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">Proposition du matin.</span>{' '}
                  {actionRow.morningRecalibration.changeSummary}{' '}
                  {actionRow.morningRecalibration.why}
                </p>
                <InApp>Accepter ou garder le plan</InApp>
              </>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <Skel className="block h-4 w-full" />
            <Skel className="block h-4 w-2/3" />
          </div>
        )}
      </CarnetSection>

      <CarnetSection label="Les signaux" title="Ce que le corps dit">
        <Signals hero={hero} />
        {vm && trust && (trust.limitingCauseText || trust.confidenceLabel) ? (
          <Quiet>
            {trust.limitingCauseText}
            {trust.limitingCauseText && trust.confidenceLabel ? ' ' : ''}
            {trust.confidenceLabel ? `Confiance : ${trust.confidenceLabel.toLowerCase()}.` : ''}
          </Quiet>
        ) : null}
        {actionRow && actionRow.limitingFacts.length > 0 ? (
          <Figures>
            {actionRow.limitingFacts.map((fact) => (
              <Figure key={fact.label} hint={fact.hint} label={fact.label} value={fact.value} />
            ))}
          </Figures>
        ) : null}
      </CarnetSection>

      <CarnetSection
        label="La journée"
        title={actionRow ? actionRow.actionLabel : <Skel className="h-5 w-40" />}
      >
        {vm ? <TheDay vm={vm} /> : <Skel className="block h-16 w-full" />}
      </CarnetSection>

      {vm && vm.insights.length > 0 ? (
        <CarnetSection label="À retenir" title="Ce que le coach remarque">
          <div className="space-y-5">
            {vm.insights.map((insight) => (
              <div key={insight.id}>
                <p className="font-medium">{insight.title}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {insight.summary}
                </p>
              </div>
            ))}
          </div>
        </CarnetSection>
      ) : null}
    </CarnetPage>
  );
}

function Verdict({ hero }: { hero: TodayViewModel['hero'] }) {
  const trust = hero.twinTrustStrip;
  if (!hero.postureLabel && !trust.vsYesterdayLabel) {
    return null;
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {hero.postureLabel ? <span>{hero.postureLabel}</span> : null}
      {trust.vsYesterdayLabel ? (
        <span className="text-muted-foreground text-sm font-normal">{trust.vsYesterdayLabel}</span>
      ) : null}
    </span>
  );
}
