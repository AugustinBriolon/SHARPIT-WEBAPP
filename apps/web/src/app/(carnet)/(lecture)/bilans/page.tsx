import { cacheLife } from 'next/cache';
import type { WeeklyStats } from '@sharpit/app/lib/coach/weekly-stats';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { CarnetMarkdown } from '@/components/carnet/carnet-markdown';
import {
  CarnetPage,
  CarnetSection,
  Figure,
  Figures,
  InApp,
  Quiet,
} from '@/components/carnet/carnet-parts';
import { CARNET_FRESHNESS, readPro, readSection } from '@/components/carnet/carnet-read';
import { Reading, Skel } from '@/components/carnet/carnet-reading';
import { dayIdOf, dayOf, weekLabel, weekStartsEndingAt } from '@/components/carnet/carnet-time';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

const WEEKS = 8;

type Review = {
  id: string;
  weekStart: string;
  content: string;
  stats: WeeklyStats | null;
  generatedAt: string;
};

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

function ReviewFigures({ stats }: { stats: WeeklyStats }) {
  return (
    <Figures>
      <Figure
        label="Séances"
        value={`${stats.sessionsDone}${stats.sessionsPlanned > 0 ? ` / ${stats.sessionsPlanned}` : ''}`}
      />
      <Figure label="Volume" value={hours(stats.totalDurationMin)} />
      <Figure
        label="Charge"
        value={Math.round(stats.totalLoad)}
        hint={
          stats.prevTotalLoad > 0
            ? `${Math.round(stats.prevTotalLoad)} la semaine d'avant`
            : undefined
        }
      />
      <Figure
        label="Sommeil moyen"
        value={stats.sleep.avgDurationMin !== null ? hours(stats.sleep.avgDurationMin) : '—'}
      />
    </Figures>
  );
}

/** The reviews of the last weeks, or `'free'` for an account the weekly review is not part of. */
async function readReviews(): Promise<Review[] | 'free'> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const today = dayOf(trainingDayIdForNow());
  const mondays = weekStartsEndingAt(today, WEEKS).reverse();

  const pro = await readPro();
  if (pro && pro.tier !== 'PRO') {
    return 'free';
  }

  const answers = await Promise.all(
    mondays.map((monday) =>
      readSection<{ review: Review | null }>(
        `/api/v1/coach/weekly-review?date=${encodeURIComponent(dayIdOf(monday))}`,
      ),
    ),
  );
  const seen = new Set<string>();
  return answers
    .map((answer) => answer?.review ?? null)
    .filter((review): review is Review => {
      if (!review || seen.has(review.id)) {
        return false;
      }
      seen.add(review.id);
      return true;
    });
}

export default function CarnetReviewsPage() {
  return (
    <CarnetPage kicker="Les bilans" title="Tes semaines">
      <Reading
        read={readReviews}
        fallback={
          <CarnetSection label="Semaine" title={<Skel className="h-5 w-40" />}>
            <Skel className="block h-32 w-full" />
          </CarnetSection>
        }
      >
        {(reviews) => <ReviewList reviews={reviews} />}
      </Reading>
      <InApp>Régénérer une semaine · Discuter du bilan avec le coach</InApp>
    </CarnetPage>
  );
}

function ReviewList({ reviews }: { reviews: Review[] | 'free' }) {
  if (reviews === 'free') {
    return <InApp>Le passage à SharpIt Pro</InApp>;
  }
  if (reviews.length === 0) {
    return (
      <>
        <Quiet>Aucun bilan sur les {WEEKS} dernières semaines.</Quiet>
        <InApp>Demander le bilan de la semaine</InApp>
      </>
    );
  }
  return reviews.map((review) => (
    <CarnetSection
      key={review.id}
      label="Semaine"
      title={weekLabel(dayOf(review.weekStart.slice(0, 10)))}
    >
      {review.stats ? <ReviewFigures stats={review.stats} /> : null}
      <CarnetMarkdown content={review.content} />
      <Quiet>
        Dans l&apos;app : régénère la semaine à partir de ce bilan, ou ouvre le coach avec « Discute
        de mon bilan de la semaine du {weekLabel(dayOf(review.weekStart.slice(0, 10)))} ».
      </Quiet>
    </CarnetSection>
  ));
}
