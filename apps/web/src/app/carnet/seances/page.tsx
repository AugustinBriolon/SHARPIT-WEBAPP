import Link from 'next/link';
import { ActivityType } from '@prisma/client';
import { activityTypeLabels, formatDistance, formatDuration } from '@sharpit/app/lib/format';
import { SPORT_IDENTITY_HEX } from '@sharpit/app/lib/activity/sport-identity';
import { cn } from '@sharpit/app/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CarnetPage,
  CarnetSection,
  Quiet,
  ReadingList,
  ReadingRow,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { readSection } from '@/components/carnet/carnet-read';
import {
  type SessionListItem,
  sessionDistanceM,
  sessionsByMonth,
  sportsByFrequency,
} from '@/components/carnet/carnet-sessions';

// Reads the signed-in athlete on every request (ADR-072).
export const instant = false;

type PageProps = { searchParams: Promise<{ sport?: string; tout?: string }> };

const RECENT_DAYS = 365;

function parseSport(value: string | undefined): ActivityType | null {
  return value && (Object.values(ActivityType) as string[]).includes(value)
    ? (value as ActivityType)
    : null;
}

function filterHref(sport: ActivityType | null, all: boolean): string {
  const params = new URLSearchParams();
  if (sport) {
    params.set('sport', sport);
  }
  if (all) {
    params.set('tout', '1');
  }
  const query = params.toString();
  return query ? `/carnet/seances?${query}` : '/carnet/seances';
}

function SportFilter({
  sports,
  current,
  all,
}: {
  sports: ActivityType[];
  current: ActivityType | null;
  all: boolean;
}) {
  const options: Array<{ sport: ActivityType | null; label: string }> = [
    { sport: null, label: 'Tous les sports' },
    ...sports.map((sport) => ({ sport, label: activityTypeLabels[sport] })),
  ];
  return (
    <nav aria-label="Sport" className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Link
          key={option.label}
          aria-current={option.sport === current ? 'true' : undefined}
          href={filterHref(option.sport, all)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs transition-colors',
            option.sport === current
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground bg-muted/50',
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

function SessionRow({ item }: { item: SessionListItem }) {
  const distance = sessionDistanceM(item);
  return (
    <ReadingRow href={`/carnet/seances/${item.id}`}>
      <div className="flex min-w-0 items-baseline gap-3">
        <span
          className="mt-1.5 size-2 shrink-0 self-start rounded-full"
          style={{ backgroundColor: SPORT_IDENTITY_HEX[item.type] }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{item.title ?? activityTypeLabels[item.type]}</p>
          <p className="text-muted-foreground mt-0.5 text-xs first-letter:uppercase">
            {format(item.date, 'EEEE d MMMM', { locale: fr })} · {activityTypeLabels[item.type]}
          </p>
        </div>
      </div>
      <p className="text-data text-muted-foreground shrink-0 text-right text-xs">
        {[
          distance ? formatDistance(distance) : null,
          item.duration ? formatDuration(item.duration) : null,
          item.load ? `charge ${Math.round(item.load)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </ReadingRow>
  );
}

export default async function CarnetSessionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const all = params.tout === '1';
  const sport = parseSport(params.sport);
  const items = await readSection<SessionListItem[]>(
    all ? '/api/v1/activities' : `/api/v1/activities?sinceDays=${RECENT_DAYS}`,
    true,
  );

  if (!items) {
    return (
      <CarnetPage kicker="Les séances" title="Ton historique">
        <Unreadable what="L'historique" />
      </CarnetPage>
    );
  }

  const shown = sport ? items.filter((i) => i.type === sport) : items;
  const months = sessionsByMonth(shown);

  return (
    <CarnetPage
      aside={<SportFilter all={all} current={sport} sports={sportsByFrequency(items)} />}
      kicker="Les séances"
      lead={`${shown.length} séance${shown.length > 1 ? 's' : ''} ${all ? 'en tout' : 'sur les douze derniers mois'}.`}
      title="Ton historique"
    >
      {months.length === 0 ? <Quiet>Aucune séance sur cette période.</Quiet> : null}
      {months.map((month) => (
        <CarnetSection
          key={month.key}
          label={`${month.items.length} séance${month.items.length > 1 ? 's' : ''} · ${formatDuration(month.durationSec)}`}
          title={month.label.charAt(0).toUpperCase() + month.label.slice(1)}
        >
          <ReadingList>
            {month.items.map((item) => (
              <SessionRow key={item.id} item={item} />
            ))}
          </ReadingList>
        </CarnetSection>
      ))}
      {all ? null : (
        <Link
          className="text-muted-foreground hover:text-foreground text-sm"
          href={filterHref(sport, true)}
        >
          Voir tout l&apos;historique →
        </Link>
      )}
    </CarnetPage>
  );
}
