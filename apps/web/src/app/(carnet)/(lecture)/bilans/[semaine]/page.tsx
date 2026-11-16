import { Suspense } from 'react';
import { cacheLife } from 'next/cache';
import { addDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { WeeklyStats } from '@sharpit/app/lib/coach/weekly-stats';
import { activityTypeLabels, formatDuration } from '@sharpit/app/lib/format';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { loadChange } from '@/components/carnet/carnet-bilan';
import { CarnetMarkdown } from '@/components/carnet/carnet-markdown';
import {
  CarnetStepLink,
  Quiet,
  StatusPill,
  type StatusTone,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { CARNET_FRESHNESS, readSection } from '@/components/carnet/carnet-read';
import { Reading, Skel } from '@/components/carnet/carnet-reading';
import { type SeasonSession, WEEK_DAY_NAMES } from '@/components/carnet/carnet-season';
import { dayIdOf, dayOf } from '@/components/carnet/carnet-time';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

type PageProps = { params: Promise<{ semaine: string }> };

type Review = { id: string; weekStart: string; content: string; stats: WeeklyStats | null };

type Bilan = { review: Review | null; sessions: SeasonSession[] | null };

const DAY_ID = /^\d{4}-\d{2}-\d{2}$/;

async function readBilan(monday: string): Promise<Bilan | null> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  if (!DAY_ID.test(monday)) {
    return null;
  }
  const sunday = dayIdOf(addDays(dayOf(monday), 6));
  const [answer, sessions] = await Promise.all([
    readSection<{ review: Review | null }>(`/api/v1/coach/weekly-review?date=${monday}`),
    readSection<SeasonSession[]>(`/api/v1/planned-sessions?from=${monday}&to=${sunday}`),
  ]);
  return { review: answer?.review ?? null, sessions };
}

function hours(minutes: number): string {
  return formatDuration(Math.round(minutes) * 60);
}

function Tile({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="border-border flex flex-col gap-1.5 rounded-2xl border p-3.5">
      <span className="text-muted-foreground text-[0.6875rem]">{label}</span>
      <span className="text-data text-[1.375rem] leading-none">{value}</span>
      {note ? <span className="text-muted-foreground text-[0.6875rem]">{note}</span> : null}
    </div>
  );
}

const SESSION_COLUMNS =
  'grid grid-cols-[3rem_minmax(0,1fr)_4.5rem_3.5rem_5.5rem] items-center gap-3';

function sessionStatus(session: SeasonSession, sunday: string): { tone: StatusTone; word: string } {
  if (session.completed || session.activity) {
    return { tone: 'good', word: session.isKey ? 'Clé faite' : 'Faite' };
  }
  // A printed bilan is of a closed week: what was not done by its Sunday was missed.
  return session.date.slice(0, 10) <= sunday
    ? { tone: 'watch', word: 'Manquée' }
    : { tone: 'unknown', word: 'Prévue' };
}

function Sessions({ sessions, monday }: { sessions: readonly SeasonSession[]; monday: string }) {
  const sunday = dayIdOf(addDays(dayOf(monday), 6));
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length === 0) {
    return <Quiet>Aucune séance au plan cette semaine.</Quiet>;
  }
  return (
    <div>
      <div
        className={`${SESSION_COLUMNS} text-label text-muted-foreground border-b border-(--outline) py-2`}
      >
        <span>Jour</span>
        <span>Séance</span>
        <span>Durée</span>
        <span>Charge</span>
        <span className="text-right">Statut</span>
      </div>
      <ul className="divide-border divide-y">
        {ordered.map((session, i) => {
          const status = sessionStatus(session, sunday);
          const weekday = (dayOf(session.date.slice(0, 10)).getDay() + 6) % 7;
          return (
            <li
              key={session.id ?? i}
              className={`${SESSION_COLUMNS} text-data py-2 text-[0.8125rem] font-normal`}
            >
              <span className="text-muted-foreground">{WEEK_DAY_NAMES[weekday]?.slice(0, 3)}.</span>
              <span className="truncate font-medium">
                {session.title ?? (session.type ? activityTypeLabels[session.type] : 'Séance')}
              </span>
              <span>{session.durationMin ? hours(session.durationMin) : '—'}</span>
              <span>{session.load ? Math.round(session.load) : '—'}</span>
              <span className="flex justify-end">
                <StatusPill tone={status.tone}>{status.word}</StatusPill>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The week's load day by day, Monday first: seven bars, a day with no load left flat. */
function DailyLoad({ load }: { load: readonly (number | null)[] }) {
  const peak = Math.max(1, ...load.map((value) => value ?? 0));
  return (
    <ol
      aria-label="Charge de chaque jour de la semaine"
      className="border-border flex h-24 items-end gap-1.5 border-b"
    >
      {load.map((value, i) => (
        <li key={WEEK_DAY_NAMES[i]} className="flex h-full flex-1 flex-col justify-end">
          <span
            className="bg-foreground rounded-t"
            style={{ height: `${Math.round(((value ?? 0) / peak) * 100)}%` }}
            title={`${WEEK_DAY_NAMES[i]} : ${value === null ? 'pas de charge' : Math.round(value)}`}
          />
        </li>
      ))}
    </ol>
  );
}

const LABEL = 'text-label text-muted-foreground';

function Sheet({ bilan, monday }: { bilan: Bilan; monday: string }) {
  const { review, sessions } = bilan;
  const stats = review?.stats ?? null;
  const from = dayOf(monday);
  const title = `Semaine du ${format(from, 'd MMMM', { locale: fr })} au ${format(addDays(from, 6), 'd MMMM yyyy', { locale: fr })}`;
  return (
    <article className="border-border mx-auto mb-24 flex w-full max-w-[794px] flex-col gap-7 rounded-(--shape-card) border px-10 py-12 print:mb-0 print:max-w-none print:border-0 print:p-0">
      <header className="border-foreground flex items-start justify-between gap-6 border-b pb-5">
        <div>
          <p className={LABEL}>Bilan de la semaine</p>
          <h1 className="text-section-title mt-2 text-2xl">{title}</h1>
        </div>
        <p className="flex items-center gap-2 text-sm font-bold">
          <BrandMark className="size-5" />
          SharpIt
        </p>
      </header>

      {stats ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Volume" value={hours(stats.totalDurationMin)} />
          <Tile label="Charge" note={loadChange(stats)} value={`${Math.round(stats.totalLoad)}`} />
          <Tile
            label="Séances faites"
            value={`${stats.sessionsDone}${stats.sessionsPlanned > 0 ? ` / ${stats.sessionsPlanned}` : ''}`}
          />
          <Tile
            label="Sommeil moyen"
            value={stats.sleep.avgDurationMin !== null ? hours(stats.sleep.avgDurationMin) : '—'}
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <p className={LABEL}>Les séances</p>
        {sessions ? (
          <Sessions monday={monday} sessions={sessions} />
        ) : (
          <Unreadable what="Le plan" />
        )}
      </section>

      {stats?.dailyLoad.some((value) => (value ?? 0) > 0) ? (
        <section className="space-y-3">
          <p className={LABEL}>Charge, jour par jour</p>
          <DailyLoad load={stats.dailyLoad} />
        </section>
      ) : null}

      <section className="space-y-2">
        <p className={LABEL}>Ce que le coach retient</p>
        {review ? (
          <CarnetMarkdown content={review.content} />
        ) : (
          <Quiet>Le coach n’a pas encore écrit le bilan de cette semaine.</Quiet>
        )}
      </section>

      <footer className="border-border text-muted-foreground mt-auto border-t pt-3.5 text-[0.6875rem]">
        Ce bilan informe, il ne remplace pas un avis médical.
      </footer>
    </article>
  );
}

function Pending() {
  return <Skel className="mx-auto block h-[40rem] w-full max-w-[794px]" />;
}

async function BilanOfWeek({ params }: PageProps) {
  const { semaine } = await params;
  return (
    <Reading fallback={<Pending />} read={() => readBilan(semaine)}>
      {(bilan) =>
        bilan ? <Sheet bilan={bilan} monday={semaine} /> : <Unreadable what="Ce bilan" />
      }
    </Reading>
  );
}

/**
 * One week's bilan on a sheet of its own, laid out for paper: printed from the browser it is one
 * A4 page, without the carnet's rail (ADR-135). The address (URL data) is read outside the
 * private cache and handed in as a plain value.
 */
export default function CarnetBilanPage({ params }: PageProps) {
  return (
    <div className="pb-8">
      <CarnetStepLink className="mb-6 -ml-2.5 print:hidden" direction="back" href="/bilans">
        Les bilans
      </CarnetStepLink>
      <Suspense fallback={<Pending />}>
        <BilanOfWeek params={params} />
      </Suspense>
    </div>
  );
}
