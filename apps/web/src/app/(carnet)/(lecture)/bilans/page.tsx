import { connection } from 'next/server';
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
import { readPro, readSection } from '@/components/carnet/carnet-read';
import { dayIdOf, dayOf, weekLabel, weekStartsEndingAt } from '@/components/carnet/carnet-time';

// Reads the signed-in athlete on every request (ADR-072).
export const instant = false;

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

export default async function CarnetReviewsPage() {
  await connection();
  const today = dayOf(trainingDayIdForNow());
  const mondays = weekStartsEndingAt(today, WEEKS).reverse();

  const pro = await readPro();
  if (pro && pro.tier !== 'PRO') {
    return (
      <CarnetPage
        kicker="Les bilans"
        lead="Chaque lundi, le coach relit ta semaine : ce qui a marché, ce qui reste à surveiller, la semaine qui vient."
        title="Le bilan de la semaine"
      >
        <InApp>Le passage à SharpIt Pro</InApp>
      </CarnetPage>
    );
  }

  const answers = await Promise.all(
    mondays.map((monday) =>
      readSection<{ review: Review | null }>(
        `/api/v1/coach/weekly-review?date=${encodeURIComponent(dayIdOf(monday))}`,
      ),
    ),
  );
  const seen = new Set<string>();
  const reviews = answers
    .map((answer) => answer?.review ?? null)
    .filter((review): review is Review => {
      if (!review || seen.has(review.id)) {
        return false;
      }
      seen.add(review.id);
      return true;
    });

  return (
    <CarnetPage
      kicker="Les bilans"
      lead="Les relectures du coach, semaine après semaine."
      title="Tes semaines"
    >
      {reviews.length === 0 ? (
        <>
          <Quiet>Aucun bilan sur les {WEEKS} dernières semaines.</Quiet>
          <InApp>Demander le bilan de la semaine</InApp>
        </>
      ) : (
        reviews.map((review) => (
          <CarnetSection
            key={review.id}
            label="Semaine"
            title={weekLabel(dayOf(review.weekStart.slice(0, 10)))}
          >
            {review.stats ? <ReviewFigures stats={review.stats} /> : null}
            <CarnetMarkdown content={review.content} />
          </CarnetSection>
        ))
      )}
    </CarnetPage>
  );
}
