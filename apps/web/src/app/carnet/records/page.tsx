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
import { readSection } from '@/components/carnet/carnet-read';

// Reads the signed-in athlete on every request (ADR-072).
export const instant = false;

function shortDate(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy', { locale: fr });
}

function BestRow({ label, entries }: { label: string; entries: RecordEntry[] }) {
  const [best, ...rest] = entries;
  if (!best) {
    return null;
  }
  return (
    <ReadingRow href={best.activityId ? `/carnet/seances/${best.activityId}` : null}>
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

export default async function CarnetRecordsPage() {
  const records = await readSection<RecordsPayload>('/api/v1/records');

  if (!records) {
    return (
      <CarnetPage kicker="Les records" title="Tes meilleurs efforts">
        <Unreadable what="Les records" />
      </CarnetPage>
    );
  }

  const runBests = records.runBests.filter((b) => b.entries.length > 0);

  return (
    <CarnetPage
      kicker="Les records"
      lead={`Lus sur ${records.totalActivities} séances, dont ${records.streamsAnalyzed} avec leur enregistrement complet.`}
      title="Tes meilleurs efforts"
    >
      <CarnetSection label="Course à pied" title="Les meilleurs temps">
        {runBests.length > 0 ? (
          <ReadingList>
            {runBests.map((best) => (
              <BestRow key={best.meters} entries={best.entries} label={best.label} />
            ))}
          </ReadingList>
        ) : null}
        <Categories categories={records.prs.run} />
      </CarnetSection>

      <CarnetSection label="Vélo" title="Puissance et distances">
        {records.powerCurve.length > 1 ? (
          <CarnetLineChart
            data={records.powerCurve.map((p) => ({ label: p.label, watts: p.watts }))}
            series={[{ key: 'watts', name: 'Puissance', stroke: CHART_RECORD_STROKE, unit: 'W' }]}
            title="Courbe de puissance"
          />
        ) : null}
        <Categories categories={records.prs.bike} />
      </CarnetSection>

      <CarnetSection label="Natation" title="Dans l'eau">
        <Categories categories={records.prs.swim} />
      </CarnetSection>
    </CarnetPage>
  );
}
