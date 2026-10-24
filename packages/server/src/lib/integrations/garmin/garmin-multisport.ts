import type { GarminPersonalClient } from '@sharpit/server/lib/integrations/garmin/garmin-personal-api';
import { mapWithConcurrency } from '@sharpit/server/lib/async/map-with-concurrency';
import {
  legKindLabel,
  mapGarminChildTypeToKind,
  type MultisportLeg,
} from '@sharpit/app/lib/activity/multisport';

type GCClient = GarminPersonalClient;

/** Parallel child activity fetches for triathlon parents. */
const MULTISPORT_CHILD_CONCURRENCY = 4;

interface GarminActivitySummaryDTO {
  duration?: number | null;
  movingDuration?: number | null;
  distance?: number | null;
  averageHR?: number | null;
  averageSpeed?: number | null;
  elevationGain?: number | null;
  calories?: number | null;
}

interface GarminActivityDetail {
  isMultiSportParent?: boolean;
  metadataDTO?: {
    childIds?: number[];
    childActivityTypes?: string[];
  };
  summaryDTO?: GarminActivitySummaryDTO;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function durationSec(v: unknown): number | null {
  const n = num(v);
  if (n === undefined || n === null) {
    return null;
  }
  return n > 1_000_000 ? Math.round(n / 1000) : Math.round(n);
}

function roundedMetric(value: number | null | undefined): number | null {
  return value ? Math.round(value) : null;
}

function childSummaryMetrics(summary: GarminActivitySummaryDTO | undefined) {
  return {
    movingDurationSec: durationSec(summary?.movingDuration),
    distanceM: num(summary?.distance),
    avgHr: roundedMetric(num(summary?.averageHR)),
    avgSpeedMs: num(summary?.averageSpeed),
    elevationM: roundedMetric(num(summary?.elevationGain)),
    calories: roundedMetric(num(summary?.calories)),
  };
}

function parseChildSummary(
  garminActivityId: number,
  typeKey: string,
  summary: GarminActivitySummaryDTO | undefined,
  transitionIndex: number | null,
): MultisportLeg | null {
  const kind = mapGarminChildTypeToKind(typeKey);
  const duration = durationSec(summary?.duration);
  if (duration === undefined || duration === null) {
    return null;
  }

  return {
    kind,
    label: legKindLabel(kind, transitionIndex),
    durationSec: duration,
    ...childSummaryMetrics(summary),
    garminActivityId: String(garminActivityId),
    transitionIndex: kind === 'transition' ? transitionIndex : null,
  };
}

/**
 * Récupère les jambes et transitions d'une activité multisport Garmin (parent).
 * Retourne null si l'activité n'est pas un parent multisport ou si les données sont indisponibles.
 */
function buildMultisportLegs(
  withTransitionIndex: Array<{
    childId: number;
    typeKey: string;
    kind: MultisportLeg['kind'];
    transitionIndex: number | null;
  }>,
  children: GarminActivityDetail[],
): MultisportLeg[] {
  const legs: MultisportLeg[] = [];
  for (let i = 0; i < withTransitionIndex.length; i++) {
    const meta = withTransitionIndex[i]!;
    const child = children[i];
    const leg = parseChildSummary(
      meta.childId,
      meta.typeKey,
      child?.summaryDTO,
      meta.transitionIndex,
    );
    if (leg) {
      legs.push(leg);
    }
  }
  return legs;
}

async function loadGarminMultisportDetail(
  client: GCClient,
  garminActivityId: number,
): Promise<GarminActivityDetail | null> {
  return (await client.get(
    `/activity-service/activity/${garminActivityId}`,
  )) as GarminActivityDetail;
}

function planMultisportChildren(raw: GarminActivityDetail) {
  const childIds = raw.metadataDTO?.childIds ?? [];
  const childTypes = raw.metadataDTO?.childActivityTypes ?? [];
  let transitionCount = 0;
  return childIds.map((childId, i) => {
    const typeKey = childTypes[i] ?? '';
    const kind = mapGarminChildTypeToKind(typeKey);
    return {
      childId,
      typeKey,
      kind,
      transitionIndex: kind === 'transition' ? ++transitionCount : null,
    };
  });
}

async function loadMultisportLegPayload(
  client: GCClient,
  garminActivityId: number,
): Promise<MultisportLeg[] | null> {
  const raw = await loadGarminMultisportDetail(client, garminActivityId);
  const childIds = raw?.metadataDTO?.childIds ?? [];

  if (!raw || !raw.isMultiSportParent || childIds.length === 0) {
    return null;
  }

  const withTransitionIndex = planMultisportChildren(raw);
  const children = (
    await mapWithConcurrency(
      withTransitionIndex,
      MULTISPORT_CHILD_CONCURRENCY,
      async ({ childId }) => loadGarminMultisportDetail(client, childId),
    )
  ).filter((child): child is GarminActivityDetail => child !== null);

  const legs = buildMultisportLegs(withTransitionIndex, children);
  return legs.length > 0 ? legs : null;
}

export async function fetchGarminMultisportLegs(
  client: GCClient,
  garminActivityId: number,
): Promise<MultisportLeg[] | null> {
  try {
    return await loadMultisportLegPayload(client, garminActivityId);
  } catch {
    return null;
  }
}
