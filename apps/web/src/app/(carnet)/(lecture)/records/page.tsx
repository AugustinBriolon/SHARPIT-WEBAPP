import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type {
  RecordCategory,
  RecordEntry,
  RecordsPayload,
} from '@sharpit/app/lib/training/records/record-types';
import { CHART_RECORD_STROKE } from '@sharpit/app/lib/theme/chart-theme';
import { CarnetLineChart } from '@/components/carnet/carnet-charts';
import {
  CarnetPage,
  CarnetSection,
  Quiet,
  ReadingList,
  ReadingRow,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { readCachedSection } from '@/components/carnet/carnet-read';
import { Reading, Skel } from '@/components/carnet/carnet-reading';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

function shortDate(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy', { locale: fr });
}

function BestRow({ label, entries }: { label: string; entries: RecordEntry[] }) {
  const [best, ...rest] = entries;
  if (!best) {
    return null;
  }
  return (
    <ReadingRow href={best.activityId ? `/seances/${best.activityId}` : null}>
      <div className="min-w-0">
        <p className="text-label text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm">
          {best.title ?? 'Séance'} · {shortDate(best.date)}
        </p>
        {rest.length > 0 ? (
          <p className="text-muted-foreground text-data mt-0.5 text-xs">
            puis {rest.map((e) => e.displayValue).join(' · ')}
          </p>
        ) : null}
      </div>
      <p className="text-instrument shrink-0 text-xl font-medium tabular-nums">
        {best.displayValue}
      </p>
    </ReadingRow>
  );
}

function Categories({ categories }: { categories: RecordCategory[] }) {
  const filled = categories.filter((c) => c.entries.length > 0);
  if (filled.length === 0) {
    return <Quiet>Pas encore de record.</Quiet>;
  }
  return (
    <ReadingList>
      {filled.map((category) => (
        <BestRow key={category.key} entries={category.entries} label={category.label} />
      ))}
    </ReadingList>
  );
}

const readRecords = () => readCachedSection<RecordsPayload>('/api/v1/records');

export default function CarnetRecordsPage() {
  return (
    <Reading fallback={<RecordsFrame records={undefined} />} read={readRecords}>
      {(records) => <RecordsFrame records={records} />}
    </Reading>
  );
}

/** The page's frame: drawn with skeletons while `records` is awaited, then with the reading. */
function RecordsFrame({ records }: { records: RecordsPayload | null | undefined }) {
  if (records === null) {
    return (
      <CarnetPage kicker="Les records" title="Tes meilleurs efforts">
        <Unreadable what="Les records" />
      </CarnetPage>
    );
  }

  const runBests = records?.runBests.filter((b) => b.entries.length > 0) ?? [];
  const waiting = <Skel className="block h-24 w-full" />;

  return (
    <CarnetPage
      kicker="Les records"
      title="Tes meilleurs efforts"
      lead={
        records ? (
          `Lus sur ${records.totalActivities} séances, dont ${records.streamsAnalyzed} avec leur enregistrement complet.`
        ) : (
          <Skel className="h-4 w-80 max-w-full" />
        )
      }
    >
      <CarnetSection label="Course à pied" title="Les meilleurs temps">
        {records ? (
          <>
            {runBests.length > 0 ? (
              <ReadingList>
                {runBests.map((best) => (
                  <BestRow key={best.meters} entries={best.entries} label={best.label} />
                ))}
              </ReadingList>
            ) : null}
            <Categories categories={records.prs.run} />
          </>
        ) : (
          waiting
        )}
      </CarnetSection>

      <CarnetSection label="Vélo" title="Puissance et distances">
        {records ? (
          <>
            {records.powerCurve.length > 1 ? (
              <CarnetLineChart
                data={records.powerCurve.map((p) => ({ label: p.label, watts: p.watts }))}
                title="Courbe de puissance"
                series={[
                  { key: 'watts', name: 'Puissance', stroke: CHART_RECORD_STROKE, unit: 'W' },
                ]}
              />
            ) : null}
            <Categories categories={records.prs.bike} />
          </>
        ) : (
          waiting
        )}
      </CarnetSection>

      <CarnetSection label="Natation" title="Dans l'eau">
        {records ? <Categories categories={records.prs.swim} /> : waiting}
      </CarnetSection>
    </CarnetPage>
  );
}
