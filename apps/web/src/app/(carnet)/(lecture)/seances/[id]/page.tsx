import { Suspense } from 'react';
import { cacheLife } from 'next/cache';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ClientActivityDetail } from '@sharpit/app/lib/query/types';
import type { ActivityDetailPayload } from '@sharpit/app/lib/web/payloads';
import type { ActivityStreamPayload } from '@sharpit/app/lib/streams/stream-types';
import type { ActivityNarrative, SessionAnalysis } from '@sharpit/app/lib/validators/coach';
import type { SplitRow, ZoneBucket } from '@sharpit/app/lib/activity/detail/activity-analysis';
import { SESSION_ANALYSIS_SCORE_TAG_LABELS_FR } from '@sharpit/app/lib/coach/session-analysis-labels';
import { sessionAnalysisNeedsFeelingGate } from '@sharpit/app/lib/coach/session-feeling-gate';
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
  StatusPill,
  type StatusTone,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { CARNET_FRESHNESS, readSection } from '@/components/carnet/carnet-read';
import { Reading, Skel } from '@/components/carnet/carnet-reading';
import { RaceReading } from '@/components/carnet/carnet-race-analysis';
import {
  heartRateLine,
  type PowerBar,
  powerBars,
  streamProfile,
} from '@/components/carnet/carnet-stream';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

type PageProps = { params: Promise<{ id: string }> };

const SESSIONS = { href: '/seances', label: 'Les séances' };

const VERDICT_LABEL: Record<SessionAnalysis['verdict'], string> = {
  AS_PLANNED: 'Conforme au plan',
  HARDER: 'Plus dure que prévu',
  EASIER: 'Plus facile que prévu',
  SHORTER: 'Plus courte que prévu',
  LONGER: 'Plus longue que prévu',
  DIFFERENT: 'Différente du plan',
};

/** As planned reads good; a drift from the plan is to watch; a different session is not judged. */
const VERDICT_TONE: Record<SessionAnalysis['verdict'], StatusTone> = {
  AS_PLANNED: 'good',
  HARDER: 'watch',
  EASIER: 'watch',
  SHORTER: 'watch',
  LONGER: 'watch',
  DIFFERENT: 'unknown',
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
  analysisHr,
}: {
  activity: ClientActivityDetail;
  stats: ActivityStreamPayload['stats'];
  analysisHr: { avgHr: number | null; maxHr: number | null } | null;
}) {
  const run = activity.runMetrics;
  const bike = activity.bikeMetrics;
  const swim = activity.swimMetrics;
  const hike = activity.hikeMetrics;
  const distance = run?.distanceM ?? bike?.distanceM ?? swim?.distanceM ?? hike?.distanceM ?? null;
  const avgHr = run?.avgHr ?? analysisHr?.avgHr ?? stats?.avgHr ?? null;
  const maxHr = analysisHr?.maxHr ?? stats?.maxHr ?? null;
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
      {maxHr ? <Figure label="FC max" unit="bpm" value={maxHr} /> : null}
      {ascent ? <Figure label="Dénivelé" unit="m D+" value={Math.round(ascent)} /> : null}
      {activity.load ? <Figure label="Charge" value={Math.round(activity.load)} /> : null}
      {activity.rpe ? <Figure label="Effort ressenti" unit="/10" value={activity.rpe} /> : null}
    </Figures>
  );
}

/** The five-step intensity scale (ADR-130); zones above the fifth take its colour. */
function zoneColor(index: number): string {
  return `var(--zone-${Math.min(index + 1, 5)})`;
}

/** Time in each zone, one line a zone: its share as a bar on the scale, then the time. */
function ZoneTimes({ zones }: { zones: readonly ZoneBucket[] }) {
  return (
    <ul className="divide-border divide-y">
      {zones.map((zone, i) => (
        <li key={zone.id} className="flex items-center gap-3 py-2.5">
          <span className="w-8 text-sm font-semibold">{zone.shortLabel}</span>
          <span className="bg-border flex h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
            <span
              className="h-full rounded-full"
              style={{ width: `${Math.max(zone.percent, 0)}%`, backgroundColor: zoneColor(i) }}
            />
          </span>
          <span className="text-data text-muted-foreground w-14 text-right text-xs font-normal">
            {formatDuration(zone.seconds)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const TRACE_WIDTH = 600;
const POWER_HEIGHT = 150;
const HEART_HEIGHT = 90;

/**
 * Power as steps coloured by zone, heart rate as a line under them, on one time axis: a block
 * and what it cost the heart read one above the other.
 */
function SessionTraces({
  bars,
  heartLine,
  durationSec,
}: {
  bars: readonly PowerBar[];
  heartLine: string;
  durationSec: number | null;
}) {
  const slot = TRACE_WIDTH / bars.length;
  return (
    <figure>
      <svg
        aria-label="Puissance au fil de la séance, par tranche de temps, colorée par zone"
        className="block h-44 w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${TRACE_WIDTH} ${POWER_HEIGHT}`}
      >
        {bars.map((bar, i) => (
          <rect
            key={i}
            fill={bar.zone === null ? 'var(--foreground)' : zoneColor(bar.zone)}
            height={bar.share * POWER_HEIGHT}
            width={Math.max(slot - 1, 0.5)}
            x={i * slot}
            y={POWER_HEIGHT - bar.share * POWER_HEIGHT}
          />
        ))}
      </svg>
      {heartLine ? (
        <svg
          aria-label="Fréquence cardiaque au fil de la séance"
          className="border-border block h-24 w-full border-t"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${TRACE_WIDTH} ${HEART_HEIGHT}`}
        >
          <polyline
            fill="none"
            points={heartLine}
            stroke="var(--foreground)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      <figcaption className="text-data text-muted-foreground mt-2 flex justify-between text-xs font-normal">
        <span>0:00</span>
        <span>Puissance par zone{heartLine ? ' · fréquence cardiaque dessous' : ''}</span>
        <span>{durationSec ? formatDuration(durationSec) : ''}</span>
      </figcaption>
    </figure>
  );
}

const SPLIT_COLUMNS = 'grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center gap-3';

/** The session cut in equal distances, as the analysis sends it: one line a stretch. */
function Splits({ splits, byPower }: { splits: readonly SplitRow[]; byPower: boolean }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[30rem]">
        <div
          className={`${SPLIT_COLUMNS} text-label text-muted-foreground border-b border-(--outline) py-2.5`}
        >
          <span>Tronçon</span>
          <span>Durée</span>
          <span>{byPower ? 'Puissance' : 'Allure'}</span>
          <span>FC</span>
          <span>Dénivelé</span>
        </div>
        <ul className="divide-border divide-y">
          {splits.map((split) => (
            <li
              key={split.index}
              className={`${SPLIT_COLUMNS} text-data py-2.5 text-sm font-normal`}
            >
              <span>{split.label}</span>
              <span>{formatDuration(split.durationSec)}</span>
              <span className="font-semibold">
                {byPower
                  ? split.avgWatts !== null
                    ? `${Math.round(split.avgWatts)} W`
                    : '—'
                  : split.paceSecPerKm !== null
                    ? formatPace(split.paceSecPerKm)
                    : '—'}
              </span>
              <span>{split.avgHr !== null ? `${Math.round(split.avgHr)} bpm` : '—'}</span>
              <span>
                {split.elevationGainM !== null ? `${Math.round(split.elevationGainM)} m` : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// The address (URL data) is read outside the private cache and handed in as plain values:
// read inside, it would keep the route's App Shell from ever settling.
export default function CarnetSessionPage({ params }: PageProps) {
  return (
    <Suspense fallback={<SessionPending />}>
      <SessionWithId params={params} />
    </Suspense>
  );
}

async function SessionWithId({ params }: PageProps) {
  const { id } = await params;
  return <SessionReading id={id} />;
}

function PlanDebrief({
  analysis,
  activity,
  plannedDurationMin,
}: {
  analysis: SessionAnalysis;
  activity: Pick<ClientActivityDetail, 'rpe' | 'notes'>;
  plannedDurationMin: number | null | undefined;
}) {
  if (
    sessionAnalysisNeedsFeelingGate({
      rpe: activity.rpe,
      notes: activity.notes,
      hasAnalysis: true,
    })
  ) {
    return (
      <Quiet>
        Ajoute ton effort ressenti (RPE) ou une note dans l&apos;app pour débloquer le debrief
        complet (forces, axes, tags).
      </Quiet>
    );
  }

  const reassessments = (analysis.physicalReassessments ?? []).map((item) => {
    const severity =
      item.suggestedSeverity !== null && item.suggestedSeverity !== undefined
        ? ` (sévérité suggérée ${item.suggestedSeverity}/10)`
        : '';
    return `${item.noteTitle} — ${item.question}${severity}`;
  });

  return (
    <>
      <Figures>
        <Figure label="Conformité" unit="/100" value={analysis.complianceScore} />
        {plannedDurationMin ? (
          <Figure label="Durée prévue" value={formatDuration(plannedDurationMin * 60)} />
        ) : null}
      </Figures>
      <p className="max-w-prose leading-relaxed">{analysis.summary}</p>
      {(analysis.strengths?.length ?? 0) > 0 ? (
        <>
          <Quiet>
            <span className="text-foreground font-medium">Forces.</span>
          </Quiet>
          <Reasons items={analysis.strengths ?? []} />
        </>
      ) : null}
      {(analysis.improvements?.length ?? 0) > 0 ? (
        <>
          <Quiet>
            <span className="text-foreground font-medium">À travailler.</span>
          </Quiet>
          <Reasons items={analysis.improvements ?? []} />
        </>
      ) : null}
      {(analysis.scoreTags?.length ?? 0) > 0 ? (
        <Quiet>
          {(analysis.scoreTags ?? [])
            .map((tag) => SESSION_ANALYSIS_SCORE_TAG_LABELS_FR[tag] ?? tag)
            .join(' · ')}
        </Quiet>
      ) : null}
      <Reasons items={analysis.remarks} />
      {analysis.recommendation ? (
        <Quiet>
          <span className="text-foreground font-medium">À retenir.</span> {analysis.recommendation}
        </Quiet>
      ) : null}
      {reassessments.length > 0 ? (
        <>
          <Quiet>
            <span className="text-foreground font-medium">Zones à réévaluer.</span>
          </Quiet>
          <Reasons items={reassessments} />
          <Quiet>
            Dans l&apos;app : ouvre le coach pour choisir Continuer / Alléger / Reporter / Pause
            selon le playbook douleur.
          </Quiet>
        </>
      ) : null}
    </>
  );
}

type SessionRead = {
  detail: ActivityDetailPayload | null;
  streams: ActivityStreamPayload | null;
};

async function readSession(id: string): Promise<SessionRead> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const encodedId = encodeURIComponent(id);
  const [detail, streams] = await Promise.all([
    readSection<ActivityDetailPayload>(`/api/web/activity-detail/${encodedId}`, true),
    readSection<ActivityStreamPayload>(`/api/v1/activities/${encodedId}/streams`),
  ]);
  return { detail, streams };
}

function SessionReading({ id }: { id: string }) {
  return (
    <Reading fallback={<SessionPending />} read={() => readSession(id)}>
      {({ detail, streams }) => <SessionLoaded detail={detail} streams={streams} />}
    </Reading>
  );
}

/** The page while the session is read: its frame stays, the values and the sections wait. */
function SessionPending() {
  return (
    <div className="activity-reading">
      <CarnetPage
        back={SESSIONS}
        kicker={<Skel className="h-3 w-48" />}
        title={<Skel className="h-8 w-64" />}
      >
        <CarnetSection label="Les chiffres">
          <Skel className="block h-16 w-full" />
        </CarnetSection>
        <InApp>Modifier, lier ou supprimer cette séance</InApp>
      </CarnetPage>
    </div>
  );
}

function SessionLoaded({
  detail,
  streams,
}: {
  detail: ActivityDetailPayload | null;
  streams: ActivityStreamPayload | null;
}) {
  // A private cache cannot answer « not found »: a session that cannot be read says so.
  if (!detail) {
    return (
      <CarnetPage back={SESSIONS} kicker="Les séances" title="Cette séance">
        <Unreadable what="Cette séance" />
      </CarnetPage>
    );
  }

  const { activity, goal, multisportLegs, raceAnalysis } = detail;
  const narrative = isNarrative(activity.narrativeAnalysis) ? activity.narrativeAnalysis : null;
  const planned = activity.plannedSession;
  const analysis = planned && isAnalysis(planned.analysis) ? planned.analysis : null;
  const profile = streams?.available ? streamProfile(streams.samples) : [];
  const sport = activityTypeLabels[activity.type];
  const liveHrBle = streams?.liveHr?.source === 'ble';
  const powerZones = streams?.analysis?.power?.zones ?? [];
  const hrZones = streams?.analysis?.hr.zones ?? [];
  // Power zones when the session has power, else the heart's: one reading of intensity a page.
  const zones = powerZones.some((z) => z.seconds > 0) ? powerZones : hrZones;
  const samples = streams?.available ? streams.samples : [];
  const bars = powerBars(samples, streams?.analysis?.thresholds.ftp ?? null);
  const heartLine = bars.length > 0 ? heartRateLine(samples, TRACE_WIDTH, HEART_HEIGHT) : '';
  const bikeSplits = streams?.analysis?.bike?.splits ?? [];
  const runSplits = streams?.analysis?.run?.splits ?? [];
  const splits = bikeSplits.length > 0 ? bikeSplits : runSplits;
  const hasProfile = profile.some((p) => p.alt !== null || (bars.length === 0 && p.hr !== null));

  return (
    <div className="activity-reading">
      <CarnetPage
        back={SESSIONS}
        kicker={`${sport} · ${format(activity.date, 'EEEE d MMMM yyyy', { locale: fr })}`}
        lead={narrative?.headline}
        title={activity.title ?? sport}
        side={
          <>
            {streams?.path && streams.path.length > 1 ? (
              <CarnetSection label="Le parcours">
                <RouteMap
                  className="h-64 overflow-hidden rounded-(--shape-card)"
                  lineColor={SPORT_IDENTITY_HEX[activity.type]}
                  path={streams.path}
                />
              </CarnetSection>
            ) : null}

            {zones.some((z) => z.seconds > 0) ? (
              <CarnetSection label="Temps par zone">
                <ZoneTimes zones={zones} />
              </CarnetSection>
            ) : null}

            {narrative ? (
              <CarnetSection label="La lecture" title="Ce que le coach en retient">
                <p className="max-w-prose leading-relaxed">{narrative.narrative}</p>
              </CarnetSection>
            ) : null}
          </>
        }
        status={
          analysis ? (
            <StatusPill tone={VERDICT_TONE[analysis.verdict]}>
              {VERDICT_LABEL[analysis.verdict]}
            </StatusPill>
          ) : null
        }
        top={
          <div className="space-y-4 pb-8">
            <KeyFigures
              activity={activity}
              analysisHr={streams?.analysis?.hr ?? null}
              stats={streams?.stats ?? null}
            />
            {liveHrBle ? (
              <Quiet>
                <span className="text-foreground font-medium">FC captée en direct</span>
              </Quiet>
            ) : null}
            {activity.notes ? <Quiet>{activity.notes}</Quiet> : null}
          </div>
        }
      >
        <RaceReading
          analysis={raceAnalysis}
          durationSec={activity.duration}
          goal={goal}
          legs={multisportLegs}
        />

        {bars.length > 0 ? (
          <CarnetSection label={heartLine ? 'Puissance et fréquence cardiaque' : 'Puissance'}>
            <SessionTraces bars={bars} durationSec={activity.duration} heartLine={heartLine} />
          </CarnetSection>
        ) : null}

        {splits.length > 0 ? (
          <CarnetSection label="Les tronçons">
            <Splits byPower={bikeSplits.length > 0} splits={splits} />
          </CarnetSection>
        ) : null}

        {hasProfile ? (
          <CarnetSection label="Le profil">
            {bars.length === 0 && profile.some((p) => p.hr !== null) ? (
              <CarnetLineChart
                data={profile.map((p) => ({ label: p.label, hr: p.hr }))}
                title="Fréquence cardiaque"
                series={[
                  {
                    key: 'hr',
                    name: 'Fréquence cardiaque',
                    stroke: CHART_VO2_STROKE,
                    unit: 'bpm',
                    connectNulls: false,
                  },
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
          <CarnetSection label="Face au plan" title={planned.title ?? 'Séance prévue'}>
            {analysis ? (
              <PlanDebrief
                activity={activity}
                analysis={analysis}
                plannedDurationMin={planned.durationMin}
              />
            ) : (
              <Quiet>La comparaison avec la séance prévue n&apos;est pas encore faite.</Quiet>
            )}
          </CarnetSection>
        ) : null}

        <InApp>Modifier, lier ou supprimer cette séance</InApp>
      </CarnetPage>
    </div>
  );
}
