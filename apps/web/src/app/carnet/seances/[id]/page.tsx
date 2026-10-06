import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ClientActivityDetail } from '@sharpit/app/lib/query/types';
import type { ActivityStreamPayload } from '@sharpit/app/lib/streams/stream-types';
import type { ActivityNarrative, SessionAnalysis } from '@sharpit/app/lib/validators/coach';
import {
  activityTypeLabels,
  formatDistance,
  formatDuration,
  formatPace,
  formatSwimPace,
} from '@sharpit/app/lib/format';
import { SPORT_IDENTITY_HEX } from '@sharpit/app/lib/activity/sport-identity';
import { CHART_BASE_STROKE, CHART_VO2_STROKE } from '@sharpit/app/lib/theme/chart-theme';
import { RouteMap } from '@/components/training/activity/insights/route-map';
import { CarnetLineChart } from '@/components/carnet/carnet-charts';
import {
  CarnetPage,
  CarnetSection,
  Figure,
  Figures,
  InApp,
  Quiet,
  Reasons,
} from '@/components/carnet/carnet-parts';
import { readSection } from '@/components/carnet/carnet-read';
import { streamProfile } from '@/components/carnet/carnet-stream';

// Reads the signed-in athlete on every request (ADR-072).
export const instant = false;

type PageProps = { params: Promise<{ id: string }> };

const VERDICT_LABEL: Record<SessionAnalysis['verdict'], string> = {
  AS_PLANNED: 'Conforme au plan',
  HARDER: 'Plus dure que prévu',
  EASIER: 'Plus facile que prévu',
  SHORTER: 'Plus courte que prévu',
  LONGER: 'Plus longue que prévu',
  DIFFERENT: 'Différente du plan',
};

function isNarrative(value: unknown): value is ActivityNarrative {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ActivityNarrative).headline === 'string' &&
    typeof (value as ActivityNarrative).narrative === 'string'
  );
}

function isAnalysis(value: unknown): value is SessionAnalysis {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SessionAnalysis).complianceScore === 'number' &&
    typeof (value as SessionAnalysis).summary === 'string'
  );
}

function KeyFigures({
  activity,
  stats,
}: {
  activity: ClientActivityDetail;
  stats: ActivityStreamPayload['stats'];
}) {
  const run = activity.runMetrics;
  const bike = activity.bikeMetrics;
  const swim = activity.swimMetrics;
  const hike = activity.hikeMetrics;
  const distance = run?.distanceM ?? bike?.distanceM ?? swim?.distanceM ?? hike?.distanceM ?? null;
  const avgHr = run?.avgHr ?? stats?.avgHr ?? null;
  const ascent = run?.elevationM ?? hike?.elevationM ?? stats?.totalAscent ?? null;

  return (
    <Figures>
      {distance ? <Figure label="Distance" value={formatDistance(distance)} /> : null}
      <Figure label="Durée" value={formatDuration(activity.duration)} />
      {run?.paceSecPerKm ? <Figure label="Allure" value={formatPace(run.paceSecPerKm)} /> : null}
      {swim?.avgPaceSecPer100m ? (
        <Figure label="Allure" value={formatSwimPace(swim.avgPaceSecPer100m)} />
      ) : null}
      {bike?.normalizedPower ? (
        <Figure label="Puissance normalisée" unit="W" value={Math.round(bike.normalizedPower)} />
      ) : null}
      {avgHr ? <Figure label="FC moyenne" unit="bpm" value={avgHr} /> : null}
      {ascent ? <Figure label="Dénivelé" unit="m D+" value={Math.round(ascent)} /> : null}
      {activity.load ? <Figure label="Charge" value={Math.round(activity.load)} /> : null}
      {activity.rpe ? <Figure label="Effort ressenti" unit="/10" value={activity.rpe} /> : null}
    </Figures>
  );
}

export default async function CarnetSessionPage({ params }: PageProps) {
  const { id } = await params;
  const path = `/api/v1/activities/${encodeURIComponent(id)}`;
  const [activity, streams] = await Promise.all([
    readSection<ClientActivityDetail>(path, true),
    readSection<ActivityStreamPayload>(`${path}/streams`),
  ]);

  if (!activity) {
    notFound();
  }

  const narrative = isNarrative(activity.narrativeAnalysis) ? activity.narrativeAnalysis : null;
  const planned = activity.plannedSession;
  const analysis = planned && isAnalysis(planned.analysis) ? planned.analysis : null;
  const profile = streams?.available ? streamProfile(streams.samples) : [];
  const hasProfile = profile.some((p) => p.hr !== null || p.alt !== null);
  const sport = activityTypeLabels[activity.type];

  return (
    <CarnetPage
      kicker={`${sport} · ${format(activity.date, 'EEEE d MMMM yyyy', { locale: fr })}`}
      lead={narrative?.headline}
      title={activity.title ?? sport}
    >
      <CarnetSection label="Les chiffres">
        <KeyFigures activity={activity} stats={streams?.stats ?? null} />
        {activity.notes ? <Quiet>{activity.notes}</Quiet> : null}
      </CarnetSection>

      {narrative ? (
        <CarnetSection label="La lecture" title="Ce que le coach en retient">
          <p className="max-w-prose leading-relaxed">{narrative.narrative}</p>
        </CarnetSection>
      ) : null}

      {streams?.path && streams.path.length > 1 ? (
        <CarnetSection label="Le parcours">
          <RouteMap
            className="h-[22rem] sm:h-[28rem]"
            lineColor={SPORT_IDENTITY_HEX[activity.type]}
            path={streams.path}
          />
        </CarnetSection>
      ) : null}

      {hasProfile ? (
        <CarnetSection label="Le profil">
          {profile.some((p) => p.hr !== null) ? (
            <CarnetLineChart
              data={profile.map((p) => ({ label: p.label, hr: p.hr }))}
              title="Fréquence cardiaque"
              series={[
                { key: 'hr', name: 'Fréquence cardiaque', stroke: CHART_VO2_STROKE, unit: 'bpm' },
              ]}
            />
          ) : null}
          {profile.some((p) => p.alt !== null) ? (
            <CarnetLineChart
              data={profile.map((p) => ({ label: p.label, alt: p.alt }))}
              height={140}
              series={[{ key: 'alt', name: 'Altitude', stroke: CHART_BASE_STROKE, unit: 'm' }]}
              title="Altitude"
            />
          ) : null}
        </CarnetSection>
      ) : null}

      {planned ? (
        <CarnetSection
          label="Face au plan"
          title={analysis ? VERDICT_LABEL[analysis.verdict] : (planned.title ?? 'Séance prévue')}
        >
          {analysis ? (
            <>
              <Figures>
                <Figure label="Conformité" unit="/100" value={analysis.complianceScore} />
                {planned.durationMin ? (
                  <Figure label="Durée prévue" value={formatDuration(planned.durationMin * 60)} />
                ) : null}
              </Figures>
              <p className="max-w-prose leading-relaxed">{analysis.summary}</p>
              <Reasons items={analysis.remarks} />
              {analysis.recommendation ? (
                <Quiet>
                  <span className="text-foreground font-medium">À retenir.</span>{' '}
                  {analysis.recommendation}
                </Quiet>
              ) : null}
            </>
          ) : (
            <Quiet>La comparaison avec la séance prévue n&apos;est pas encore faite.</Quiet>
          )}
        </CarnetSection>
      ) : null}

      {activity.hikeTrip ? (
        <Quiet>Fait partie du séjour « {activity.hikeTrip.name} ».</Quiet>
      ) : null}

      <InApp>Modifier, lier ou supprimer cette séance</InApp>

      <Link className="text-muted-foreground hover:text-foreground text-sm" href="/carnet/seances">
        ← Toutes les séances
      </Link>
    </CarnetPage>
  );
}
