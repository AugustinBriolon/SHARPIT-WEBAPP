import {
  ADHERENCE_TARGET,
  type AdherenceWeek,
  type PlanAdherence,
} from '@sharpit/app/lib/admin/plan-adherence';

export const formatAdherence = (rate: number) => `${Math.round(rate * 100)} %`;

function WeekCell({ week }: { week: AdherenceWeek }) {
  const { all, key, status } = week;
  const onTarget = status === 'closed' && all.rate !== null && all.rate >= ADHERENCE_TARGET;
  const title =
    all.rate === null
      ? `S${week.week} · rien de prévu sur les jours passés`
      : `S${week.week} · ${all.done}/${all.planned} séances · clés ${key.done}/${key.planned}`;
  return (
    <div
      title={title}
      className={`rounded-analysis-sm w-16 px-2 py-1 text-center ${
        onTarget ? 'bg-highlight text-highlight-foreground' : 'bg-muted'
      }`}
    >
      <p className="text-muted-foreground text-[10px] leading-none">
        S{week.week}
        {status === 'running' ? ' · en cours' : ''}
      </p>
      <p className="text-data mt-1 text-sm font-semibold">
        {status === 'upcoming' || all.rate === null ? '—' : formatAdherence(all.rate)}
      </p>
    </div>
  );
}

/** Week 1–4 adherence of one athlete (ADR-102): lime once a closed week reaches the target. */
export function AdherenceWeeks({ adherence }: { adherence: PlanAdherence | null }) {
  if (!adherence) {
    return <p className="text-muted-foreground text-xs">Aucune séance planifiée</p>;
  }
  return (
    <div aria-label={`Adhérence au plan depuis le ${adherence.startsOn}`} className="flex gap-1.5">
      {adherence.weeks.map((week) => (
        <WeekCell key={week.week} week={week} />
      ))}
    </div>
  );
}
