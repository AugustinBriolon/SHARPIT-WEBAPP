import type { ReactNode } from 'react';
import type { RaceMoment } from '@sharpit/app/lib/goals/race-moment';
import { CarnetPage, InApp } from './carnet-parts';
import { RaceBand } from './carnet-race';

/**
 * A day with nothing read yet. A race on it still comes first: the goal is known even
 * when no source has spoken for the day.
 */
export function CarnetEmptyDay({
  aside,
  kicker,
  title,
  description,
  race,
}: {
  aside: ReactNode;
  kicker: ReactNode;
  title: string;
  description?: string;
  race: RaceMoment | null | undefined;
}) {
  return (
    <CarnetPage aside={aside} kicker={kicker} lead={description} title={title}>
      <RaceBand race={race} />
      <InApp>Relier une source</InApp>
    </CarnetPage>
  );
}
