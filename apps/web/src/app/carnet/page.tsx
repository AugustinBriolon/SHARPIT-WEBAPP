import Link from 'next/link';
import { connection } from 'next/server';
import type { TodayViewModel } from '@sharpit/app/presentation/today-view-model';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { addTrainingDays, trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { readViewModel } from '@/components/carnet/carnet-read';
import { carnetHref, longDayLabel, resolveDayParam } from '@/components/carnet/carnet-time';
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

// Reads the signed-in athlete on every request (ADR-072).
export const instant = false;

type PageProps = { searchParams: Promise<{ jour?: string | string[] }> };

const SIGNALS = [
  { key: 'sleep', label: 'Sommeil', score: 'sleepScore' },
  { key: 'recovery', label: 'Récupération', score: 'recoveryScore' },
  { key: 'effort', label: 'Effort', score: 'effortScore' },
  { key: 'adaptation', label: 'Adaptation', score: 'adaptationScore' },
] as const;

function DayPager({ day, today }: { day: string; today: string }) {
  const previous = addTrainingDays(day, -1);
  const next = addTrainingDays(day, 1);
  return (
    <nav aria-label="Jours" className="text-muted-foreground flex gap-4 text-sm">
      <Link className="hover:text-foreground" href={`/carnet?jour=${previous}`}>
        ← Veille
      </Link>
      {day < today ? (
        <Link
          className="hover:text-foreground"
          href={next === today ? '/carnet' : `/carnet?jour=${next}`}
        >
          Lendemain →
        </Link>
      ) : null}
    </nav>
  );
}

function Signals({ hero }: { hero: TodayViewModel['hero'] }) {
  const previews = new Map(hero.signalPreviews.map((p) => [p.key, p]));
  return (
    <Figures>
      {SIGNALS.map((signal) => {
        const score = hero.metricsRow[signal.score];
        const preview = previews.get(signal.key);
        return (
          <Figure
            key={signal.key}
            hint={preview?.subtitle ?? null}
            label={signal.label}
            unit={score !== null ? '/100' : null}
            value={score ?? '—'}
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

export default async function CarnetTodayPage({ searchParams }: PageProps) {
  await connection();
  const today = trainingDayIdForNow();
  const day = resolveDayParam((await searchParams).jour, today);
  const vm = await readViewModel<TodayViewModel>(
    `/api/presentation/today?trainingDayId=${encodeURIComponent(day)}`,
  );
  const kicker = day === today ? `Aujourd'hui · ${longDayLabel(day)}` : longDayLabel(day);

  if (!vm) {
    return (
      <CarnetPage aside={<DayPager day={day} today={today} />} kicker={kicker} title="Ta journée">
        <Unreadable what="Cette journée" />
      </CarnetPage>
    );
  }

  if (!vm.hasContent && vm.emptyState) {
    return (
      <CarnetPage
        aside={<DayPager day={day} today={today} />}
        kicker={kicker}
        lead={vm.emptyState.description}
        title={vm.emptyState.title}
      >
        <InApp>Relier une source</InApp>
      </CarnetPage>
    );
  }

  const { hero, actionRow } = vm;
  const trust = hero.twinTrustStrip;
  const reasons = [hero.actionLine, hero.goalLine, ...hero.adaptationReminders].filter(
    (line): line is string => Boolean(line),
  );

  return (
    <CarnetPage
      aside={<DayPager day={day} today={today} />}
      kicker={kicker}
      lead={hero.subline}
      title={hero.headline}
    >
      <CarnetSection label="Le verdict" title={hero.postureLabel}>
        {vm.statusMessage ? <Quiet>{vm.statusMessage}</Quiet> : null}
        <Reasons items={reasons} />
        {actionRow.morningRecalibration?.status === 'PRESENTED' ? (
          <>
            <p className="text-sm leading-relaxed">
              <span className="font-medium">Proposition du matin.</span>{' '}
              {actionRow.morningRecalibration.changeSummary} {actionRow.morningRecalibration.why}
            </p>
            <InApp>Accepter ou garder le plan</InApp>
          </>
        ) : null}
      </CarnetSection>

      <CarnetSection label="Les signaux" title="Ce que le corps dit">
        <Signals hero={hero} />
        {trust.limitingCauseText || trust.confidenceLabel ? (
          <Quiet>
            {trust.limitingCauseText}
            {trust.limitingCauseText && trust.confidenceLabel ? ' ' : ''}
            {trust.confidenceLabel ? `Confiance : ${trust.confidenceLabel.toLowerCase()}.` : ''}
          </Quiet>
        ) : null}
        {actionRow.limitingFacts.length > 0 ? (
          <Figures>
            {actionRow.limitingFacts.map((fact) => (
              <Figure key={fact.label} hint={fact.hint} label={fact.label} value={fact.value} />
            ))}
          </Figures>
        ) : null}
      </CarnetSection>

      <CarnetSection label="La journée" title={actionRow.actionLabel}>
        <TheDay vm={vm} />
      </CarnetSection>

      {vm.insights.length > 0 ? (
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
