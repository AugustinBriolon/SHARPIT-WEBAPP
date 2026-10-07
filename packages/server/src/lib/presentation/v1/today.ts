import type { ActivityType } from '@prisma/client';
import type { V1TodayConsistency } from '@sharpit/server/lib/presentation/v1/consistency';
import type { PresentationEmptyState } from '@sharpit/app/presentation/types';
import type { TodayViewModel } from '@sharpit/app/presentation/today-view-model';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { morningIntensityLabel } from '@sharpit/app/lib/morning-recalibration/sport-intensity-labels';
import { CONNECT_GARMIN_PATH } from '@sharpit/app/lib/integrations/garmin/garmin-connect-handoff';

export type V1TodayPackTier = 'FULL' | 'PARTIAL' | 'LOW' | 'INSUFFICIENT';

export type V1TodaySource = {
  hasContent: boolean;
  emptyState: PresentationEmptyState | null;
  hero: {
    eyebrow: string;
    headline: string;
    subline: string;
    posture: 'protect' | 'steady' | 'push' | 'uncertain';
    postureLabel?: string | null;
    focusPriority?: string | null;
    actionLine?: string | null;
    twinTrustStrip: {
      confidencePctRounded: number | null;
      limitingCauseText: string | null;
      confidenceLabel?: string | null;
    };
    reliability?: {
      packTier: V1TodayPackTier;
      visibleGaps: readonly string[];
    } | null;
    signalPreviews: Array<{
      key: 'sleep' | 'recovery' | 'adaptation' | 'effort';
      scoreDisplay: string;
      subtitle: string | null;
    }>;
  };
  header: {
    weather: { city: string; tempC: number; condition: string } | null;
  };
  actionRow: {
    daySummaryLines: Array<{
      id: string;
      kind: 'done' | 'planned';
      primary: string;
      secondary?: string | null;
      activityType?: ActivityType;
      plannedSessionId?: string | null;
      isKey?: boolean;
      /** Why the coach wrote this session — Decision Memory rationale. */
      purpose?: string | null;
      metrics?: Array<{ label: string; value: string; unit: string }> | null;
      brickLegs?: ReadonlyArray<BrickLegSource> | null;
      brickTransitionsSec?: ReadonlyArray<number | null> | null;
    }>;
    morningRecalibration?: TodayViewModel['actionRow']['morningRecalibration'];
  };
};

/** A leg as the view model holds it: the planned leg, and what it was once done. */
type BrickLegSource = V1TodayBrickLeg & {
  completed?: boolean;
  activityId?: string | null;
  actual?: {
    durationSec: number | null;
    load: number | null;
    rpe: number | null;
    feeling: string | null;
  } | null;
};

/** One leg of a brick line, in the order it is done. */
export type V1TodayBrickLeg = {
  id: string;
  type: ActivityType;
  title: string;
  durationMin: number | null;
  /** Added fields — optional, so an app that does not know them still decodes the leg. */
  completed?: boolean;
  /** The activity that realized the leg, to open it. */
  activityId?: string | null;
  /** What the leg actually was, with the athlete's notes; null while only planned. */
  actual?: {
    durationSec: number | null;
    load: number | null;
    rpe: number | null;
    feeling: string | null;
  } | null;
};

export type V1TodayResponse = {
  apiVersion: 1;
  trainingDayId: string;
  empty: {
    title: string;
    message: string | null;
    code: 'NO_CONTENT';
    /** Absolute Garmin handoff URL on the canonical origin (ADR-040). */
    webURL: string;
    /** CTA label for `webURL`; null when Garmin is already connected — nothing to do. */
    actionLabel: string | null;
  } | null;
  verdict: {
    eyebrow: string;
    headline: string;
    subline: string;
    posture: 'protect' | 'steady' | 'push' | 'uncertain';
    confidencePct: number | null;
    limitingCause: string | null;
    statusLabel: string;
    actionLine: string | null;
    confidenceLabel: string | null;
    packTier: V1TodayPackTier | null;
    estimationGaps: string[];
  };
  weather: { city: string; tempC: number; condition: string } | null;
  sessions: Array<{
    id: string;
    kind: 'planned' | 'done';
    title: string;
    subtitle: string | null;
    metrics: Array<{ label: string; value: string; unit: string }>;
    sport: string | null;
    priority: boolean;
    /**
     * The prescription this line stands for, when there is one. Distinct from `id`: a
     * brick line is identified by its group, so only this addresses the session itself.
     */
    plannedSessionId: string | null;
    /** One of the week's key sessions (F2): the ones that carry the preparation. */
    isKey: boolean;
    /** Why the coach wrote this session — Decision Memory rationale; null when unknown. */
    rationale: string | null;
    /**
     * Set on a brick line: its legs, so a client opens the chain as one session rather
     * than its first leg alone. Null on any other line.
     */
    brickLegs: V1TodayBrickLeg[] | null;
    /**
     * Set on a brick line: the group that addresses the brick as a whole (its evaluation,
     * its analysis). `id` cannot carry it — a done brick's `id` is its first activity.
     */
    brickGroupId?: string | null;
    /** Set on a brick under way: seconds from each leg's end to the next's start (T2, …). */
    brickTransitionsSec?: Array<number | null> | null;
  }>;
  signals: Array<{
    key: 'sleep' | 'recovery' | 'effort' | 'adaptation';
    score: string;
    caption: string | null;
  }>;
  /** Null when the caller could not resolve the athlete's recent activities. */
  consistency: V1TodayConsistency | null;
  /**
   * The night's proposal for today's session — eased (`DOWN`) or raised (`UP`) — while it waits
   * for the athlete's answer (`/api/v1/morning-recalibration/action`); null otherwise.
   */
  morningProposal: V1TodayMorningProposal | null;
};

export type V1TodayMorningSide = {
  intensityLabel: string | null;
  durationMin: number | null;
  description: string | null;
};

export type V1TodayMorningProposal = {
  /** False until the morning check-in: the card then invites to it, to refine the proposal. */
  checkInDone: boolean;
  decisionId: string;
  sessionId: string;
  direction: 'DOWN' | 'UP';
  changeSummary: string;
  why: string;
  from: V1TodayMorningSide;
  to: V1TodayMorningSide;
};

const CONNECT_GARMIN_EMPTY = {
  title: 'Pas encore de données',
  message: 'Connecte Garmin pour que ton Twin lise ton sommeil, ta récupération et tes séances.',
  actionLabel: 'Connecter Garmin',
} as const;

function projectEmpty(
  source: V1TodaySource,
  input: V1TodayProjectionInput,
): V1TodayResponse['empty'] {
  if (source.hasContent && source.emptyState === null) {
    return null;
  }
  return emptyPayload(source.emptyState, input);
}

/**
 * Without Garmin the gap is the missing source, so the empty state says so and offers
 * the handoff. With Garmin connected the data is on its way: the Twin's own message
 * stands and there is no action.
 */
function emptyPayload(
  emptyState: V1TodaySource['emptyState'],
  input: V1TodayProjectionInput,
): NonNullable<V1TodayResponse['empty']> {
  const webURL = `${input.webOrigin.replace(/\/$/, '')}${CONNECT_GARMIN_PATH}`;
  if (!input.garminConnected) {
    return { ...CONNECT_GARMIN_EMPTY, code: 'NO_CONTENT', webURL };
  }
  return {
    title: emptyState?.title ?? 'Pas encore de données',
    message: emptyState?.description ?? null,
    code: 'NO_CONTENT',
    webURL,
    actionLabel: null,
  };
}

function sportLabel(activityType: ActivityType | undefined): string | null {
  if (!activityType) {
    return null;
  }
  return activityTypeLabels[activityType] ?? null;
}

function resolveStatusLabel(hero: V1TodaySource['hero']): string {
  const fromPosture = hero.postureLabel?.trim();
  if (fromPosture) {
    return fromPosture;
  }
  return hero.eyebrow;
}

function resolveActionLine(hero: V1TodaySource['hero']): string | null {
  const fromFocus = hero.focusPriority?.trim();
  if (fromFocus) {
    return fromFocus;
  }
  const fromAction = hero.actionLine?.trim();
  if (fromAction) {
    return fromAction;
  }
  return hero.subline || null;
}

function projectVerdict(
  hero: V1TodaySource['hero'],
  empty: V1TodayResponse['empty'],
): V1TodayResponse['verdict'] {
  return {
    eyebrow: hero.eyebrow,
    headline: empty ? empty.title : hero.headline,
    subline: hero.subline,
    posture: hero.posture,
    confidencePct: hero.twinTrustStrip.confidencePctRounded,
    limitingCause: hero.twinTrustStrip.limitingCauseText,
    statusLabel: resolveStatusLabel(hero),
    actionLine: resolveActionLine(hero),
    confidenceLabel: hero.twinTrustStrip.confidenceLabel ?? null,
    packTier: hero.reliability?.packTier ?? null,
    estimationGaps: [...(hero.reliability?.visibleGaps ?? [])],
  };
}

function projectSessions(
  lines: V1TodaySource['actionRow']['daySummaryLines'],
): V1TodayResponse['sessions'] {
  return lines.map((line, index) => ({
    id: v1SessionId(line),
    kind: line.kind,
    title: line.primary,
    subtitle: line.secondary ?? null,
    metrics: line.metrics ?? [],
    sport: sportLabel(line.activityType),
    priority: index === 0,
    plannedSessionId: line.plannedSessionId ?? null,
    isKey: line.isKey ?? false,
    rationale: line.purpose ?? null,
    brickLegs:
      line.brickLegs?.map(({ id, type, title, durationMin, completed, activityId, actual }) => ({
        id,
        type,
        title,
        durationMin,
        completed: completed ?? false,
        activityId: activityId ?? null,
        actual: actual ?? null,
      })) ?? null,
    brickTransitionsSec: line.brickTransitionsSec ? [...line.brickTransitionsSec] : null,
    brickGroupId: line.brickLegs?.length ? line.id : null,
  }));
}

/**
 * A done brick line's id is its group, yet app versions before brick legs open a done line as the
 * activity it names: they get the first done leg's activity, a real one. Clients that know
 * `brickLegs` open the whole brick and do not read this id.
 */
function v1SessionId(line: V1TodaySource['actionRow']['daySummaryLines'][number]): string {
  if (line.kind !== 'done' || !line.brickLegs?.length) {
    return line.id;
  }
  return line.brickLegs.find((leg) => leg.completed && leg.activityId)?.activityId ?? line.id;
}

function projectOvernightSignals(
  previews: V1TodaySource['hero']['signalPreviews'],
): V1TodayResponse['signals'] {
  return previews
    .filter((signal) => signal.key === 'sleep' || signal.key === 'recovery')
    .map((signal) => ({
      key: signal.key,
      score: signal.scoreDisplay,
      caption: signal.subtitle,
    }));
}

export type V1TodayProjectionInput = {
  trainingDayId: string;
  webOrigin: string;
  /**
   * Regularity is not part of the Today view model — the web computes it client-side
   * from a separate activity fetch — so the caller resolves it and passes it in.
   */
  consistency?: V1TodayConsistency | null;
  /** Decides the empty state's copy and action; unknown reads as not connected. */
  garminConnected?: boolean;
  /** Whether the morning check-in is done; unknown reads as done (no invitation). */
  morningCheckInDone?: boolean;
};

export function projectV1Today(
  source: V1TodaySource,
  input: V1TodayProjectionInput,
): V1TodayResponse {
  const empty = projectEmpty(source, input);
  return {
    apiVersion: 1,
    trainingDayId: input.trainingDayId,
    empty,
    verdict: projectVerdict(source.hero, empty),
    weather: source.header.weather,
    sessions: projectSessions(source.actionRow.daySummaryLines),
    signals: projectOvernightSignals(source.hero.signalPreviews),
    consistency: input.consistency ?? null,
    morningProposal: projectMorningProposal(
      source.actionRow.morningRecalibration ?? null,
      input.morningCheckInDone ?? true,
    ),
  };
}

function projectMorningProposal(
  recalibration: V1TodaySource['actionRow']['morningRecalibration'] | null,
  checkInDone: boolean,
): V1TodayMorningProposal | null {
  if (!recalibration || recalibration.status !== 'PRESENTED') {
    return null;
  }
  const label = (intensity: string | null) =>
    morningIntensityLabel(recalibration.sessionType, intensity);
  return {
    checkInDone,
    decisionId: recalibration.decisionId,
    sessionId: recalibration.sessionId,
    direction: recalibration.direction,
    changeSummary: recalibration.changeSummary,
    why: recalibration.why,
    from: {
      intensityLabel: label(recalibration.fromIntensity),
      durationMin: recalibration.fromDurationMin,
      description: recalibration.fromDescription,
    },
    to: {
      intensityLabel: label(recalibration.toIntensity),
      durationMin: recalibration.toDurationMin,
      description: recalibration.toDescription,
    },
  };
}

function sourceFromViewModel(vm: TodayViewModel): V1TodaySource {
  return {
    hasContent: vm.hasContent,
    emptyState: vm.emptyState,
    hero: {
      eyebrow: vm.hero.eyebrow,
      headline: vm.hero.headline,
      subline: vm.hero.subline,
      posture: vm.hero.posture,
      postureLabel: vm.hero.postureLabel,
      focusPriority: vm.hero.focusPriority,
      actionLine: vm.hero.actionLine,
      twinTrustStrip: {
        confidencePctRounded: vm.hero.twinTrustStrip.confidencePctRounded,
        limitingCauseText: vm.hero.twinTrustStrip.limitingCauseText,
        confidenceLabel: vm.hero.twinTrustStrip.confidenceLabel,
      },
      reliability: vm.hero.reliability
        ? {
            packTier: vm.hero.reliability.packTier,
            visibleGaps: vm.hero.reliability.visibleGaps,
          }
        : null,
      signalPreviews: vm.hero.signalPreviews.map((signal) => ({
        key: signal.key,
        scoreDisplay: signal.scoreDisplay,
        subtitle: signal.subtitle,
      })),
    },
    header: {
      weather: vm.header.weather
        ? {
            city: vm.header.weather.city,
            tempC: vm.header.weather.tempC,
            condition: vm.header.weather.condition,
          }
        : null,
    },
    actionRow: {
      daySummaryLines: vm.actionRow.daySummaryLines.map((line) => ({
        id: line.id,
        kind: line.kind,
        primary: line.primary,
        secondary: line.secondary,
        activityType: line.activityType,
        plannedSessionId: line.plannedSessionId,
        isKey: line.isKey,
        purpose: line.purpose,
        metrics: line.metrics,
        brickLegs: line.brickLegs,
        brickTransitionsSec: line.brickTransitionsSec,
      })),
      morningRecalibration: vm.actionRow.morningRecalibration,
    },
  };
}

export function projectV1TodayFromViewModel(
  vm: TodayViewModel,
  input: V1TodayProjectionInput,
): V1TodayResponse {
  return projectV1Today(sourceFromViewModel(vm), input);
}
