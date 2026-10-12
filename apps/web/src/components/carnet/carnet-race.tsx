import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import type { RaceMoment } from '@sharpit/app/lib/goals/race-moment';
import { formatChronoSeconds } from '@sharpit/app/lib/goals/goal-metric-config';
import { cn } from '@sharpit/app/lib/utils';
import { CarnetIntentLink } from './carnet-intent-link';
import { CarnetSection, CarnetStepLink, Figure, Figures, Quiet, RowArrow } from './carnet-parts';
import { type RaceLegView, raceFormatLine, raceLegViews, raceResultLine } from './carnet-race-legs';

const TH = 'text-muted-foreground border-border border-b py-1.5 pe-4 font-medium';
const TD = 'border-border/50 border-b py-2 pe-4 tabular-nums';

/**
 * A race drawn to scale: each leg as wide as the time it took, then the legs named in order.
 * The bar speaks once, as a whole, to a screen reader; the list underneath reads leg by leg.
 */
export function RaceLegsStrip({
  legs,
  compact = false,
}: {
  legs: readonly RaceLegView[];
  /** The bar alone, thin: the result line beside it already says the time. */
  compact?: boolean;
}) {
  const spoken = legs.map((leg) => `${leg.label} ${formatChronoSeconds(leg.durationSec)}`);
  return (
    <div className="space-y-3">
      <div
        aria-label={`Répartition du temps : ${spoken.join(', ')}`}
        className={cn('flex w-full gap-0.5 overflow-hidden rounded-full', compact ? 'h-1' : 'h-2')}
        role="img"
      >
        {legs.map((leg) => (
          <span
            key={leg.key}
            className="bg-muted-foreground/30 h-full min-w-1"
            style={{ flexGrow: leg.share, backgroundColor: leg.color ?? undefined }}
          />
        ))}
      </div>
      {compact ? null : (
        <ol aria-label="Les étapes" className="text-data flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {legs.map((leg) => (
            <li key={leg.key} className="flex items-center gap-1.5">
              <span
                className="bg-muted-foreground/30 size-1.5 rounded-full"
                style={{ backgroundColor: leg.color ?? undefined }}
                aria-hidden
              />
              <span className="text-muted-foreground">{leg.label}</span>
              <span className="tabular-nums">{formatChronoSeconds(leg.durationSec)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function RaceLegsTable({ legs }: { legs: readonly RaceLegView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-data w-full text-left text-xs">
        <caption className="sr-only">Temps, distance et allure de chaque étape</caption>
        <thead>
          <tr>
            <th className={TH} scope="col">
              Étape
            </th>
            <th className={TH} scope="col">
              Temps
            </th>
            <th className={TH} scope="col">
              Distance
            </th>
            <th className={TH} scope="col">
              Allure
            </th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg) => (
            <tr key={leg.key}>
              <th className={`${TD} font-medium`} scope="row">
                {leg.label}
              </th>
              <td className={TD}>{formatChronoSeconds(leg.durationSec)}</td>
              <td className={TD}>{leg.distance ?? '—'}</td>
              <td className={TD}>{leg.pace ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The race's own figures: the time it took, beside the time the goal aimed for. */
export function RaceFigures({
  durationSec,
  raceFormat,
  targetPerformance,
}: {
  durationSec: number | null;
  raceFormat: string | null;
  targetPerformance: string | null;
}) {
  return (
    <Figures>
      {durationSec ? <Figure label="Temps final" value={formatChronoSeconds(durationSec)} /> : null}
      {targetPerformance ? <Figure label="Objectif" value={targetPerformance} /> : null}
      {raceFormat ? <Figure label="Format" value={raceFormat} /> : null}
    </Figures>
  );
}

/**
 * The day page's first word on a race day, and for the few days after it: the goal it was
 * all for, then — once the race is in — its time and its legs.
 */
export function RaceBand({ race }: { race: RaceMoment | null | undefined }) {
  if (!race) {
    return null;
  }
  const { activity } = race;
  if (race.phase === 'postRace' && activity) {
    return <RaceDone activity={activity} race={race} />;
  }
  const legs = activity ? raceLegViews(activity.legs) : [];
  return (
    <CarnetSection
      label={race.phase === 'raceDay' ? 'Jour J' : 'Course terminée'}
      title={race.title}
    >
      {activity ? (
        <>
          <RaceFigures
            durationSec={activity.durationSec}
            raceFormat={race.raceFormat}
            targetPerformance={race.targetPerformance}
          />
          {legs.length > 0 ? <RaceLegsStrip legs={legs} /> : null}
          <CarnetStepLink className="-ml-2.5" direction="next" href={`/seances/${activity.id}`}>
            Voir la séance
          </CarnetStepLink>
        </>
      ) : (
        <Quiet>{raceFormatLine(race.raceFormat, race.targetPerformance) ?? 'Bonne course.'}</Quiet>
      )}
    </CarnetSection>
  );
}

/**
 * After the race: said once, quietly — the result on one line, the legs to scale, and an
 * invitation to read the race back rather than a button.
 */
function RaceDone({
  race,
  activity,
}: {
  race: RaceMoment;
  activity: NonNullable<RaceMoment['activity']>;
}) {
  const legs = raceLegViews(activity.legs);
  const result = raceResultLine(activity.durationSec, race.targetPerformance);
  return (
    <CarnetSection label="Course terminée" title={race.title}>
      <div className="max-w-md space-y-2.5">
        {result ? <p className="text-data text-sm tabular-nums">{result}</p> : null}
        {legs.length > 0 ? <RaceLegsStrip legs={legs} compact /> : null}
      </div>
      <CarnetIntentLink
        className="group text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-baseline gap-2 rounded-sm text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        href={`/seances/${activity.id}`}
      >
        Reviens sur ta course : ce qui a marché, où tu peux progresser
        <RowArrow />
      </CarnetIntentLink>
    </CarnetSection>
  );
}

/** The séance page's legs: to scale first, then leg by leg with each sport's own pace. */
export function RaceLegs({ legs }: { legs: readonly MultisportLeg[] }) {
  const views = raceLegViews(legs);
  return (
    <CarnetSection label="Les étapes">
      <RaceLegsStrip legs={views} />
      <RaceLegsTable legs={views} />
    </CarnetSection>
  );
}
