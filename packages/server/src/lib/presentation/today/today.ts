import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import { isSet } from '@sharpit/shared/value';
import type { DailyPhase } from '@sharpit/app/lib/daily-phase/types';
import type { MorningOrientationResolved } from '@sharpit/app/lib/today/rich/morning-orientation';
import { snapshotHasDisplayableContent } from '@sharpit/app/athlete-state/snapshot';
import type { TodayViewModel } from '@sharpit/app/presentation/today-view-model';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import { pickAdaptationReminders } from '@sharpit/app/lib/daily-phase/narrative';
import {
  getActivitiesList,
  getAthleteProfile,
  getGoals,
  getHealthEntries,
  getPlannedSessions,
} from '@sharpit/server/lib/queries';
import { SLEEP_TARGET_MIN } from '@sharpit/core/sleep/targets';
import { computeSharpitSleepScoreForDay } from '@sharpit/app/lib/sleep/sleep-scoring';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { buildPostSessionLoop } from '@sharpit/server/lib/today/rich/post-session-loop';
import { buildFeedbackRearrangeProposal } from '@sharpit/app/lib/today/rich/feedback-rearrange-proposal';
import {
  buildHabitRearrangeProposal,
  mergeRearrangeProposals,
  type HabitCoachingSignal,
} from '@sharpit/app/lib/today/rich/habit-coaching-signal';
import { loadTodayHabitCoachingSignal } from '@sharpit/server/lib/presentation/today/today-habit-coaching';
import { buildTodayHeroReliability } from '@sharpit/server/lib/science/reliability/today-hero-reliability';
import { buildTodayDaySummary } from '@sharpit/app/lib/today/dashboard/today-day-summary';
import { findSessionPurposesByPlannedSessionIds } from '@sharpit/server/lib/decision-memory/repository';
import { prisma } from '@sharpit/db/client';
import { addDays } from 'date-fns';
import {
  findSessionLinkSuggestions,
  type SessionLinkSuggestion,
} from '@sharpit/app/lib/today/rich/session-link-suggestions';
import {
  mapConfidenceToTier,
  mapVerdictToDisplay,
  resolveVisibleConfidenceLabel,
} from '@sharpit/app/lib/today/dashboard/today-mapping';
import {
  actionRowLabels,
  buildTopActionLine,
  shouldShowForwardTrainingCopy,
} from '@sharpit/app/lib/today/rich/today-rich-view';
import {
  resolveMorningOrientation,
  type MorningRecalibrationInput,
} from '@sharpit/app/lib/today/rich/morning-orientation';
import {
  decisionTopAction,
  decisionVerdict,
  resolveConfidenceHrefFromDecision,
  resolveLimitingFactorHrefFromDecision,
} from '@sharpit/app/lib/decision/projection';
import { buildTodayLimitingFacts } from '@sharpit/server/lib/today/dashboard/today-instrument-facts';
import { buildTodayGoalAnchor } from '@sharpit/app/lib/today/rich/today-goal-anchor';
import { TWIN_DRILL_DOWN } from '@sharpit/app/lib/today/navigation/today-twin-navigation';
import { buildSignalPreviews } from '@sharpit/app/lib/today/dashboard/signal-previews';
import { endOfDay, startOfDay } from 'date-fns';
import type { ClientActivity, ClientPlannedSession } from '@sharpit/app/lib/query/types';
import type { SessionIntensity } from '@prisma/client';
import { getGarminAccount } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { getGoogleAccount } from '@sharpit/server/lib/integrations/google/google-sync';
import { getRenphoAccount } from '@sharpit/server/lib/integrations/renpho/renpho-sync';
import { getStravaAccount } from '@sharpit/server/lib/integrations/strava/strava-sync';
import { getWithingsAccount } from '@sharpit/server/lib/integrations/withings/withings-sync';
import {
  INTEGRATIONS_RECONNECT_HREF,
  reconnectProductMessage,
  reconnectProviderNames,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import { reconnectSnoozeKey } from '@sharpit/server/lib/integrations/shared/reconnect-banner-state';
import type { TodayWeather } from '@sharpit/server/lib/today/dashboard/today-weather';
import { loadTodayWeather } from '@sharpit/server/lib/today/dashboard/today-weather';
import {
  isDemoAthleteProfile,
  withDemoSnapshotFreshness,
} from '@sharpit/server/lib/demo/demo-presentation';

function localDateFromTrainingDayId(trainingDayId: string): Date {
  const [y, m, d] = trainingDayId.split('-').map(Number);
  // Midday local avoids DST edge cases when subtracting days.
  return new Date(y, m - 1, d, 12, 0, 0);
}

function mapConfidenceTone(
  tier: ReturnType<typeof mapConfidenceToTier>,
): 'good' | 'warn' | 'neutral' {
  switch (tier) {
    case 'high':
      return 'good';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

type SnapshotStatusInput = {
  snapshot: AthleteSnapshot;
  phase: DailyPhase;
  heroHeadline: string;
  heroSubline: string;
  reconnectNames: string[];
};

function snapshotStatusCandidate(snapshot: AthleteSnapshot, hasContent: boolean): string | null {
  if (hasContent) {
    return snapshot.freshness.primaryProductMessage;
  }
  return snapshot.primaryProductMessage ?? snapshot.insufficientDataMessage ?? null;
}

function resolveSnapshotStatusMessage(input: SnapshotStatusInput): {
  message: string | null;
  href: string | null;
  snoozeKey: string | null;
} {
  const reconnectMessage = reconnectProductMessage(input.reconnectNames);
  if (reconnectMessage) {
    return {
      message: reconnectMessage,
      href: INTEGRATIONS_RECONNECT_HREF,
      snoozeKey: reconnectSnoozeKey(input.reconnectNames),
    };
  }

  const hasContent = snapshotHasDisplayableContent(input.snapshot);
  if (input.phase === 'END_OF_DAY' && hasContent) {
    return { message: null, href: null, snoozeKey: null };
  }

  const candidate = snapshotStatusCandidate(input.snapshot, hasContent);
  if (!candidate) {
    return { message: null, href: null, snoozeKey: null };
  }
  if (hasContent && (candidate === input.heroHeadline || candidate === input.heroSubline)) {
    return { message: null, href: null, snoozeKey: null };
  }

  return { message: candidate, href: null, snoozeKey: null };
}

export type TodayPresentationInputs = {
  trainingDayId: string;
  day: Date;
  snapshot: AthleteSnapshot;
  /** Today's forecast for the header. Null when unavailable — the screen renders without it. */
  weather?: TodayWeather | null;
  healthEntries: Awaited<ReturnType<typeof getHealthEntries>>;
  activities: Awaited<ReturnType<typeof getActivitiesList>>;
  plannedSessions: Awaited<ReturnType<typeof getPlannedSessions>>;
  goals: Awaited<ReturnType<typeof getGoals>>;
  athleteProfile: Awaited<ReturnType<typeof getAthleteProfile>>;
  /**
   * Provider display names whose credentials are dead (row still present).
   * Empty when every linked app can still authenticate.
   */
  reconnectNames?: string[];
  /** Ensured by the API route (write side-effect stays off this projection). */
  morningRecalibration: MorningRecalibrationInput | null;
  /**
   * Journal habit → coaching signal (why fact + optional rearrange).
   * Optional so pure VM tests can omit it; load path always fills it.
   */
  habitCoaching?: HabitCoachingSignal | null;
};

function mapSessionLinkSuggestion(s: SessionLinkSuggestion) {
  return {
    id: s.id,
    plannedSessionId: s.plannedSessionId,
    activityId: s.activityId,
    activityType: s.activityType,
    score: s.score,
    matchLabel: s.matchLabel,
    plannedPrimary: s.plannedPrimary,
    plannedSecondary: s.plannedSecondary ?? null,
    activityPrimary: s.activityPrimary,
    activitySecondary: s.activitySecondary ?? null,
  };
}

function buildTodayScores(
  effectiveSnapshot: AthleteSnapshot,
  healthEntries: TodayPresentationInputs['healthEntries'],
  day: Date,
  sleepTargetMin: number,
) {
  const sleepScoreSharpit = computeSharpitSleepScoreForDay(healthEntries, day, sleepTargetMin);
  const sleepScore = sleepScoreSharpit ?? effectiveSnapshot.sleepScore;
  const effortScore =
    effectiveSnapshot.dailyStrain?.available && isSet(effectiveSnapshot.dailyStrain.strainScore)
      ? effectiveSnapshot.dailyStrain.strainScore
      : null;
  return {
    sleepScore,
    recoveryScore: effectiveSnapshot.readiness,
    effortScore,
    adaptationScore: effectiveSnapshot.adaptationIndex,
    adaptationUnavailableCaption:
      effectiveSnapshot.adaptationIndex === undefined || effectiveSnapshot.adaptationIndex === null
        ? 'Historique insuffisant'
        : null,
  };
}

function shouldPreferAdaptationReminders(input: {
  phase: DailyPhase;
  adaptationHints: string[];
  focusPriority: string | null;
  limitingFactor: AthleteSnapshot['limitingFactor'];
}): boolean {
  return (
    input.phase === 'RECOVERY_WINDOW' &&
    input.adaptationHints.length > 0 &&
    !input.focusPriority &&
    !input.limitingFactor
  );
}

function buildTodayLimitingSection(input: {
  phase: DailyPhase;
  effectiveSnapshot: AthleteSnapshot;
  focusPriority: string | null;
  adaptationHints: string[];
}) {
  if (input.phase === 'END_OF_DAY') {
    return {
      limitingMode: 'none' as const,
      limitingLines: [] as string[],
      limitingText: null as string | null,
      limitingHref: null as string | null,
      limitingFacts: [] as TodayViewModel['actionRow']['limitingFacts'],
    };
  }

  const preferReminders = shouldPreferAdaptationReminders({
    phase: input.phase,
    adaptationHints: input.adaptationHints,
    focusPriority: input.focusPriority,
    limitingFactor: input.effectiveSnapshot.limitingFactor,
  });
  const limitingBuilt = buildTodayLimitingFacts({
    limitingFactor: preferReminders ? null : input.effectiveSnapshot.limitingFactor,
    reminders: preferReminders ? input.adaptationHints : [],
  });
  const limitingHref = isSet(input.effectiveSnapshot.limitingFactor)
    ? (resolveLimitingFactorHrefFromDecision(input.effectiveSnapshot.decision) ??
      TWIN_DRILL_DOWN.recovery)
    : null;

  return {
    limitingMode:
      limitingBuilt.facts.length > 0 || limitingBuilt.emptyText
        ? ('facts' as const)
        : ('none' as const),
    limitingLines: [] as string[],
    limitingText: limitingBuilt.emptyText,
    limitingHref,
    limitingFacts: limitingBuilt.facts,
  };
}

function daySummaryLineHref(
  line: ReturnType<typeof buildTodayDaySummary>['lines'][number],
): string {
  // A brick line's id is its group: it opens on its first leg, never as an activity.
  if (line.kind === 'done' && !line.brickLegs?.length) {
    return TWIN_DRILL_DOWN.activity(line.id);
  }
  return TWIN_DRILL_DOWN.plannedSession(line.plannedSession?.id ?? line.id);
}

function morningChoiceForLine(
  plannedId: string | null,
  sessionChoice: MorningOrientationResolved['sessionChoice'],
): string | null {
  if (!sessionChoice || !plannedId || sessionChoice.sessionId !== plannedId) {
    return null;
  }
  return sessionChoice.label;
}

function plannedIdFromLine(line: ReturnType<typeof buildTodayDaySummary>['lines'][number]) {
  return line.plannedSession?.id ?? (line.kind === 'planned' ? line.id : null);
}

function daySummaryLineMetrics(
  line: ReturnType<typeof buildTodayDaySummary>['lines'][number],
): ReturnType<typeof buildTodayDaySummary>['lines'][number]['metrics'] | null {
  return line.metrics ?? null;
}

function mapDaySummaryLineForView(
  line: ReturnType<typeof buildTodayDaySummary>['lines'][number],
  sessionChoice: MorningOrientationResolved['sessionChoice'],
) {
  const plannedId = plannedIdFromLine(line);
  return {
    // Keep brickGroupId for brick lines — remapping to the first leg made link
    // exclusions and morning proposals swallow the whole brick (Course vanished).
    id: line.id,
    activityType: line.activityType,
    primary: line.primary,
    secondary: line.secondary ?? null,
    kind: line.kind,
    href: daySummaryLineHref(line),
    isDone: line.kind === 'done',
    // The real prescription behind the line. A brick's `id` is its group, so a client
    // that needs to address the session itself cannot derive it from `id` alone.
    plannedSessionId: plannedId,
    isKey: line.plannedSession?.isKey ?? false,
    metrics: daySummaryLineMetrics(line),
    morningChoiceLabel: morningChoiceForLine(plannedId, sessionChoice),
    brickLegs: line.brickLegs ?? null,
    brickTransitionsSec: line.brickTransitionsSec ?? null,
  };
}

function buildPlateLimiter(effectiveSnapshot: AthleteSnapshot): {
  text: string | null;
  href: string | null;
} {
  if (effectiveSnapshot.limitingFactor === undefined || effectiveSnapshot.limitingFactor === null) {
    return { text: null, href: null };
  }
  const text =
    buildTodayLimitingFacts({ limitingFactor: effectiveSnapshot.limitingFactor }).facts.find(
      (f) => f.label === 'Cause',
    )?.value ?? null;
  const href =
    resolveLimitingFactorHrefFromDecision(effectiveSnapshot.decision) ?? TWIN_DRILL_DOWN.recovery;
  return { text, href };
}

function phaseNarrativeText(
  narrative: AthleteSnapshot['phaseNarrative'],
  field: 'heroHeadline' | 'heroSubline' | 'heroEyebrow' | 'postureLabel',
  fallback: string,
): string {
  const value = narrative?.[field];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function heroHeadlineFrom(
  narrative: AthleteSnapshot['phaseNarrative'],
  displayVerdict: ReturnType<typeof mapVerdictToDisplay>,
): string {
  return narrative?.heroHeadline ?? displayVerdict.label;
}

function heroSublineFrom(
  narrative: AthleteSnapshot['phaseNarrative'],
  insufficientDataMessage: string | null,
): string {
  return narrative?.heroSubline ?? insufficientDataMessage ?? '';
}

function buildHeroCopy(
  effectiveSnapshot: AthleteSnapshot,
  displayVerdict: ReturnType<typeof mapVerdictToDisplay>,
) {
  const narrative = effectiveSnapshot.phaseNarrative;
  return {
    heroHeadline: heroHeadlineFrom(narrative, displayVerdict),
    heroSubline: heroSublineFrom(narrative, effectiveSnapshot.insufficientDataMessage),
    heroEyebrow: phaseNarrativeText(narrative, 'heroEyebrow', "Qu'est-ce qui compte aujourd'hui ?"),
    posture: narrative?.posture ?? 'uncertain',
    postureLabel: phaseNarrativeText(narrative, 'postureLabel', ''),
    goalLine: narrative?.goalLine ?? null,
  };
}

function buildFocusPriority(effectiveSnapshot: AthleteSnapshot, phase: DailyPhase): string | null {
  if (effectiveSnapshot.phaseNarrative?.focusPriority) {
    return effectiveSnapshot.phaseNarrative.focusPriority;
  }
  const adviceActionable = Boolean(effectiveSnapshot.adviceActionable);
  if (!adviceActionable || !shouldShowForwardTrainingCopy(phase)) {
    return null;
  }
  return buildTopActionLine(decisionTopAction(effectiveSnapshot.decision));
}

function buildConfidenceFields(effectiveSnapshot: AthleteSnapshot) {
  const adviceActionable = Boolean(effectiveSnapshot.adviceActionable);
  const confidenceTier = isSet(effectiveSnapshot.confidence)
    ? mapConfidenceToTier(effectiveSnapshot.confidence)
    : null;
  const confidenceLabel = resolveVisibleConfidenceLabel(
    effectiveSnapshot.confidenceLabel ?? null,
    confidenceTier,
    adviceActionable,
  );
  return {
    confidenceTone: isSet(confidenceTier) ? mapConfidenceTone(confidenceTier) : 'neutral',
    confidenceLabel,
    confidencePctRounded:
      isSet(confidenceLabel) && isSet(effectiveSnapshot.confidence)
        ? Math.round(effectiveSnapshot.confidence * 100)
        : null,
    confidenceHref: resolveConfidenceHrefFromDecision(effectiveSnapshot.decision),
  };
}

function prepareTodayHeroFields(
  effectiveSnapshot: AthleteSnapshot,
  displayVerdict: ReturnType<typeof mapVerdictToDisplay>,
) {
  const phase = effectiveSnapshot.dailyPhase?.phase ?? 'MORNING';
  return {
    ...buildHeroCopy(effectiveSnapshot, displayVerdict),
    focusPriority: buildFocusPriority(effectiveSnapshot, phase),
    ...buildConfidenceFields(effectiveSnapshot),
  };
}

function prepareTodayActionFields(input: {
  day: Date;
  phase: DailyPhase;
  effectiveSnapshot: AthleteSnapshot;
  focusPriority: string | null;
  activities: TodayPresentationInputs['activities'];
  plannedSessions: TodayPresentationInputs['plannedSessions'];
  goals: TodayPresentationInputs['goals'];
}) {
  const isRestDay = input.effectiveSnapshot.dailyPhase?.signals.sessionStatus === 'NONE_TODAY';
  const goalTitleById = new Map(input.goals.map((g) => [g.id, g.title] as const));
  const daySummary = buildTodayDaySummary(
    input.day,
    input.activities as unknown as ClientActivity[],
    input.plannedSessions as unknown as ClientPlannedSession[],
    goalTitleById,
  );
  const adaptationHints = pickAdaptationReminders(input.phase, 3, isRestDay);

  return {
    sessionLinkSuggestions: findSessionLinkSuggestions(
      input.day,
      input.activities as unknown as ClientActivity[],
      input.plannedSessions as unknown as ClientPlannedSession[],
    ),
    daySummary,
    labels: actionRowLabels(input.phase),
    limitingSection: buildTodayLimitingSection({
      phase: input.phase,
      effectiveSnapshot: input.effectiveSnapshot,
      focusPriority: input.focusPriority,
      adaptationHints,
    }),
  };
}

function mapPostSessionActivities(activities: TodayPresentationInputs['activities']) {
  return (
    activities as unknown as Array<{
      id: string;
      title: string | null;
      type: keyof typeof activityTypeLabels;
      date: Date | string;
      rpe: number | null;
      feeling: string | null;
    }>
  ).map((a) => ({
    id: a.id,
    title: a.title,
    typeLabel: activityTypeLabels[a.type] ?? a.type,
    date: a.date,
    rpe: a.rpe,
    feeling: a.feeling,
  }));
}

function resolveMorningEyebrow(evidencePending: boolean, heroEyebrow: string): string {
  if (evidencePending && !heroEyebrow) {
    return 'Ce matin';
  }
  return heroEyebrow;
}

function morningPresentationFromOrientation(
  morningOrientation: MorningOrientationResolved | null,
  input: {
    heroHeadline: string;
    heroSubline: string;
    heroEyebrow: string;
  },
) {
  if (!morningOrientation) {
    return {
      effectiveHeadline: input.heroHeadline,
      effectiveSubline: input.heroSubline,
      hideHeroConfidence: false,
      heroEyebrow: input.heroEyebrow,
      sessionChoice: null,
    };
  }

  const evidencePending = morningOrientation.phase === 'EVIDENCE_PENDING';
  return {
    effectiveHeadline: morningOrientation.heroHeadline ?? input.heroHeadline,
    effectiveSubline: morningOrientation.heroSubline ?? input.heroSubline,
    hideHeroConfidence: Boolean(morningOrientation.hideHeroConfidence),
    heroEyebrow: resolveMorningEyebrow(evidencePending, input.heroEyebrow),
    sessionChoice: morningOrientation.sessionChoice ?? null,
  };
}

function latestEffortForRearrange(
  activities: ReturnType<typeof mapPostSessionActivities>,
  day: Date,
): { rpe: number | null; feeling: string | null } | null {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 86_400_000;
  const today = activities
    .filter((activity) => {
      const time = new Date(activity.date).getTime();
      return time >= dayStart && time < dayEnd;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const [latest] = today;
  if (!latest) {
    return null;
  }
  return { rpe: latest.rpe, feeling: latest.feeling };
}

function mapUpcomingForRearrange(plannedSessions: TodayPresentationInputs['plannedSessions']) {
  const planned = plannedSessions as unknown as Array<{
    id: string;
    date: Date | string;
    intensity: SessionIntensity | null;
    completed: boolean;
  }>;
  return planned.map((session) => ({
    id: session.id,
    date: session.date,
    intensity: session.intensity,
    completed: session.completed,
  }));
}

function buildTodayRearrangeProposal(input: {
  phase: DailyPhase;
  effectiveSnapshot: AthleteSnapshot;
  day: Date;
  activities: ReturnType<typeof mapPostSessionActivities>;
  plannedSessions: TodayPresentationInputs['plannedSessions'];
  verdict: ReturnType<typeof decisionVerdict>;
  habitCoaching?: HabitCoachingSignal | null;
  goalLabel?: string | null;
}) {
  const upcoming = mapUpcomingForRearrange(input.plannedSessions);
  const twinProposal = buildFeedbackRearrangeProposal({
    phase: input.phase,
    overallFresh: input.effectiveSnapshot.freshness.overallFresh,
    verdict: input.verdict,
    confidence: input.effectiveSnapshot.confidence ?? null,
    day: input.day,
    upcoming,
    latestEffort: latestEffortForRearrange(input.activities, input.day),
  });
  const habitProposal = buildHabitRearrangeProposal({
    phase: input.phase,
    day: input.day,
    upcoming,
    callout: input.habitCoaching?.callout ?? null,
    goalLabel: input.goalLabel,
  });
  return mergeRearrangeProposals(twinProposal, habitProposal);
}

function prepareTodayMorningFields(input: {
  phase: DailyPhase;
  effectiveSnapshot: AthleteSnapshot;
  morningRecalibration: MorningRecalibrationInput | null;
  heroHeadline: string;
  heroSubline: string;
  heroEyebrow: string;
  day: Date;
  activities: TodayPresentationInputs['activities'];
}) {
  const morningOrientation = resolveMorningOrientation({
    phase: input.phase,
    snapshot: input.effectiveSnapshot,
    recalibration: input.morningRecalibration,
  });
  const postSessionActivities = mapPostSessionActivities(input.activities);

  return {
    morningOrientation,
    presentedRecalibration:
      input.morningRecalibration?.status === 'PRESENTED' ? input.morningRecalibration : null,
    ...morningPresentationFromOrientation(morningOrientation, input),
    postSessionLoop: buildPostSessionLoop({
      phase: input.phase,
      overallFresh: input.effectiveSnapshot.freshness.overallFresh,
      day: input.day,
      activities: postSessionActivities,
    }),
  };
}

function buildTodayEmptyState(effectiveSnapshot: AthleteSnapshot, statusMessage: string | null) {
  if (snapshotHasDisplayableContent(effectiveSnapshot)) {
    return null;
  }
  if (!statusMessage && !effectiveSnapshot.primaryProductMessage) {
    return null;
  }
  return {
    title: 'Données insuffisantes',
    description:
      effectiveSnapshot.insufficientDataMessage ??
      effectiveSnapshot.primaryProductMessage ??
      'SharpIt attend tes premières données physiologiques pour établir ton bilan.',
  };
}

function resolveEffectiveSnapshot(inputs: TodayPresentationInputs) {
  return isDemoAthleteProfile(inputs.athleteProfile)
    ? withDemoSnapshotFreshness(inputs.snapshot)
    : inputs.snapshot;
}

function prepareTodayDerivedSections(
  inputs: TodayPresentationInputs,
  effectiveSnapshot: AthleteSnapshot,
) {
  const phase = effectiveSnapshot.dailyPhase?.phase ?? 'MORNING';
  const verdict = decisionVerdict(effectiveSnapshot.decision);
  const displayVerdict = mapVerdictToDisplay(verdict);
  const hero = prepareTodayHeroFields(effectiveSnapshot, displayVerdict);
  const action = prepareTodayActionFields({
    day: inputs.day,
    phase,
    effectiveSnapshot,
    focusPriority: hero.focusPriority,
    activities: inputs.activities,
    plannedSessions: inputs.plannedSessions,
    goals: inputs.goals,
  });
  const status = resolveSnapshotStatusMessage({
    snapshot: effectiveSnapshot,
    phase,
    heroHeadline: hero.heroHeadline,
    heroSubline: hero.heroSubline,
    reconnectNames: inputs.reconnectNames ?? [],
  });
  const morning = prepareTodayMorningFields({
    phase,
    effectiveSnapshot,
    morningRecalibration: inputs.morningRecalibration,
    heroHeadline: hero.heroHeadline,
    heroSubline: hero.heroSubline,
    heroEyebrow: hero.heroEyebrow,
    day: inputs.day,
    activities: inputs.activities,
  });

  return { phase, verdict, displayVerdict, hero, action, status, morning };
}

function prepareTodayViewModelContext(inputs: TodayPresentationInputs) {
  const effectiveSnapshot = resolveEffectiveSnapshot(inputs);
  const sleepTargetMin = inputs.athleteProfile?.sleepTargetMinutes ?? SLEEP_TARGET_MIN;
  const scores = buildTodayScores(
    effectiveSnapshot,
    inputs.healthEntries,
    inputs.day,
    sleepTargetMin,
  );
  const derived = prepareTodayDerivedSections(inputs, effectiveSnapshot);
  const goalAnchor = buildTodayGoalAnchor({
    goals: inputs.goals as never,
    plannedSessions: inputs.plannedSessions as never,
    trainingDayId: inputs.trainingDayId,
    narrativeGoalLine: derived.hero.goalLine,
  });
  const goalLabel = goalAnchor?.label ?? null;
  const rearrangeProposal = buildTodayRearrangeProposal({
    phase: derived.phase,
    effectiveSnapshot,
    day: inputs.day,
    activities: mapPostSessionActivities(inputs.activities),
    plannedSessions: inputs.plannedSessions,
    verdict: derived.verdict,
    habitCoaching: inputs.habitCoaching,
    goalLabel,
  });

  return {
    day: inputs.day,
    weather: inputs.weather,
    effectiveSnapshot,
    healthEntries: inputs.healthEntries,
    scores,
    phase: derived.phase,
    verdict: derived.verdict,
    displayVerdict: derived.displayVerdict,
    ...derived.hero,
    ...derived.action,
    status: derived.status,
    emptyState: buildTodayEmptyState(effectiveSnapshot, derived.status.message),
    ...derived.morning,
    rearrangeProposal,
    plateLimiter: buildPlateLimiter(effectiveSnapshot),
    goalAnchor,
    habitCoaching: inputs.habitCoaching ?? null,
  };
}

function todayNavigationTargets(): TodayViewModel['navigationTargets'] {
  return {
    sleep: { label: 'Sommeil', href: TWIN_DRILL_DOWN.sleep },
    recovery: { label: 'Récupération', href: TWIN_DRILL_DOWN.recovery },
    effort: { label: 'Effort', href: TWIN_DRILL_DOWN.effort },
    adaptation: { label: 'Adaptation', href: TWIN_DRILL_DOWN.adaptation },
    physical: { label: 'Santé physique', href: TWIN_DRILL_DOWN.physical },
    planning: { label: 'Planning', href: TWIN_DRILL_DOWN.planning },
  };
}

function mapPresentedRecalibration(
  recalibration: MorningRecalibrationInput,
): NonNullable<TodayViewModel['actionRow']['morningRecalibration']> {
  return {
    decisionId: recalibration.decisionId,
    sessionId: recalibration.sessionId,
    sessionType: recalibration.sessionType,
    direction: recalibration.direction,
    changeSummary: recalibration.changeSummary,
    why: recalibration.why,
    status: recalibration.status,
    fromIntensity: recalibration.fromIntensity,
    toIntensity: recalibration.toIntensity,
    fromDurationMin: recalibration.fromDurationMin,
    toDurationMin: recalibration.toDurationMin,
    fromLoad: recalibration.fromLoad,
    toLoad: recalibration.toLoad,
    fromDescription: recalibration.fromDescription,
    toDescription: recalibration.toDescription,
  };
}

function assembleTodayHeroGoalFields(ctx: ReturnType<typeof prepareTodayViewModelContext>) {
  const anchor = ctx.goalAnchor;
  if (!anchor) {
    return {
      goalLine: ctx.goalLine,
      goalHref: null,
      goalId: null,
      goalLinkedToSession: false,
    };
  }
  return {
    goalLine: anchor.label,
    goalHref: anchor.href,
    goalId: anchor.goalId,
    goalLinkedToSession: anchor.linkedToSession,
  };
}

function assembleTodayHero(ctx: ReturnType<typeof prepareTodayViewModelContext>) {
  const reliabilityBundle = buildTodayHeroReliability(
    ctx.effectiveSnapshot,
    ctx.verdict as import('@sharpit/app/athlete-state/today-state').OverallVerdict | null,
  );
  const headline = reliabilityBundle.effectiveHeadlineOverride ?? ctx.effectiveHeadline;
  const { displayVerdict } = reliabilityBundle;
  const displayVerdictStyle = mapVerdictToDisplay(displayVerdict);
  const focusPriority = reliabilityBundle.reliability.withholdIntensityTopAction
    ? null
    : ctx.focusPriority;

  return {
    eyebrow: ctx.heroEyebrow,
    headline,
    subline: ctx.effectiveSubline,
    posture: ctx.posture,
    postureLabel: ctx.postureLabel,
    focusPriority,
    ...assembleTodayHeroGoalFields(ctx),
    actionLine: focusPriority,
    adaptationReminders: [],
    verdictStyle: {
      showVerdictColors: displayVerdict !== 'INSUFFICIENT_DATA',
      bgClass: displayVerdictStyle.bgClass,
      colorClass: displayVerdictStyle.colorClass,
      dotClass: displayVerdictStyle.dotClass,
      accentBarClass: displayVerdictStyle.accentBarClass,
    },
    metricsRow: {
      sleepScore: ctx.scores.sleepScore,
      recoveryScore: ctx.scores.recoveryScore,
      effortScore: ctx.scores.effortScore,
      adaptationScore: ctx.scores.adaptationScore,
      effortUnavailableCaption: null,
      adaptationUnavailableCaption: ctx.scores.adaptationUnavailableCaption,
    },
    signalPreviews: buildSignalPreviews({
      day: ctx.day,
      scores: {
        sleepScore: ctx.scores.sleepScore,
        recoveryScore: ctx.scores.recoveryScore,
        effortScore: ctx.scores.effortScore,
        adaptationScore: ctx.scores.adaptationScore,
        adaptationUnavailableCaption: ctx.scores.adaptationUnavailableCaption,
        effortUnavailableCaption: null,
      },
      snapshot: ctx.effectiveSnapshot,
      healthEntries: ctx.healthEntries,
    }),
    twinTrustStrip: {
      confidenceLabel: ctx.hideHeroConfidence ? null : ctx.confidenceLabel,
      confidencePctRounded: ctx.hideHeroConfidence ? null : ctx.confidencePctRounded,
      confidenceHref: ctx.hideHeroConfidence ? null : ctx.confidenceHref,
      limitingCauseText: ctx.plateLimiter.text,
      limitingFactorHref: ctx.plateLimiter.href,
    },
    reliability: reliabilityBundle.reliability,
  };
}

function assembleTodayActionRow(ctx: ReturnType<typeof prepareTodayViewModelContext>) {
  return {
    showLimitingColumn: false,
    limitingLabel: ctx.labels.limiting,
    limitingMode: ctx.limitingSection.limitingMode,
    limitingLines: ctx.limitingSection.limitingLines,
    limitingText: ctx.limitingSection.limitingText,
    limitingHref: ctx.limitingSection.limitingHref,
    limitingFacts: ctx.limitingSection.limitingFacts,
    actionLabel: ctx.labels.action,
    daySummaryEmptyText: 'Aucune séance prévue ni réalisée.',
    daySummaryEmptyHref: TWIN_DRILL_DOWN.planning,
    sessionLinkSuggestions: ctx.sessionLinkSuggestions.map(mapSessionLinkSuggestion),
    daySummaryLines: ctx.daySummary.lines.map((line) =>
      mapDaySummaryLineForView(line, ctx.sessionChoice),
    ),
    morningRecalibration: ctx.presentedRecalibration
      ? mapPresentedRecalibration(ctx.presentedRecalibration)
      : null,
  };
}

function assembleTodayViewModel(
  ctx: ReturnType<typeof prepareTodayViewModelContext>,
): TodayViewModel {
  return {
    hasContent: snapshotHasDisplayableContent(ctx.effectiveSnapshot),
    emptyState: ctx.emptyState,
    statusMessage: ctx.status.message,
    statusHref: ctx.status.href,
    statusSnoozeKey: ctx.status.snoozeKey,
    confidencePresentation: {
      pct: ctx.effectiveSnapshot.confidence,
      label: ctx.effectiveSnapshot.confidenceLabel,
      tone: ctx.confidenceTone,
    },
    effortUnavailableMessage: ctx.effectiveSnapshot.effortUnavailableMessage,
    morningOrientation: ctx.morningOrientation,
    navigationTargets: todayNavigationTargets(),
    hero: assembleTodayHero(ctx),
    actionRow: assembleTodayActionRow(ctx),
    insights: [],
    header: {
      weather: ctx.weather
        ? {
            city: ctx.weather.city,
            tempC: ctx.weather.tempC,
            condition: ctx.weather.condition,
            locationKnown: ctx.weather.locationKnown,
          }
        : null,
    },
    environmentContext: null,
    nutrition: null,
    postSessionLoop: ctx.postSessionLoop,
    rearrangeProposal: ctx.rearrangeProposal
      ? {
          ...ctx.rearrangeProposal,
          goalLabel: ctx.goalAnchor?.label ?? null,
          habitLever:
            'habitLever' in ctx.rearrangeProposal
              ? (ctx.rearrangeProposal.habitLever ?? null)
              : null,
        }
      : null,
    hierarchy: { rootId: 'today', order: ['hero', 'why', 'actionRow'] },
    sections: [],
  };
}

/**
 * Pure Today view-model projection from already-loaded inputs.
 * No I/O — callers (routes) ensure morning recalibration before loading.
 */
export function buildTodayViewModelFromInputs(inputs: TodayPresentationInputs): TodayViewModel {
  return assembleTodayViewModel(prepareTodayViewModelContext(inputs));
}

export type BuildTodayPresentationOptions = {
  /** Pre-ensured by the route. Defaults to null (no proposal). */
  morningRecalibration?: MorningRecalibrationInput | null;
  /** Reuse snapshot from refreshAthleteState — skips a second getOrBuild. */
  athleteSnapshot?: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>;
};

async function loadTodayPresentationInputs(
  athleteId: string,
  trainingDayId: string,
  day: Date,
  options: BuildTodayPresentationOptions,
) {
  const dayStart = startOfDay(day);

  const [
    snapshot,
    healthEntries,
    activities,
    plannedSessions,
    goals,
    athleteProfile,
    reconnectNames,
    weather,
    habitCoaching,
  ] = await Promise.all([
    options.athleteSnapshot
      ? Promise.resolve(options.athleteSnapshot)
      : getOrBuildAthleteSnapshot(athleteId, trainingDayId),
    getHealthEntries(athleteId, 14, day),
    getActivitiesList(athleteId, { sinceDays: 60 }),
    // Horizon covers Today day summary (filters to today) + rearrange detectors (14d).
    getPlannedSessions(athleteId, { from: dayStart, to: endOfDay(addDays(day, 14)) }),
    getGoals(athleteId),
    getAthleteProfile(athleteId),
    loadReconnectProviderNames(athleteId),
    loadTodayWeather(athleteId, trainingDayId),
    loadTodayHabitCoachingSignal(prisma, athleteId, trainingDayId),
  ]);

  return {
    trainingDayId,
    day,
    snapshot,
    healthEntries,
    activities,
    plannedSessions,
    goals,
    athleteProfile,
    morningRecalibration: options.morningRecalibration ?? null,
    // Demo stubs have empty credentials on purpose — never show reconnect.
    reconnectNames: isDemoAthleteProfile(athleteProfile) ? [] : reconnectNames,
    weather,
    habitCoaching,
  };
}

/**
 * Loads Today presentation inputs then projects a view-model.
 * Does not write morning recalibration — callers must ensure first when needed.
 */
export async function buildTodayPresentationViewModel(
  athleteId: string,
  trainingDayId: string,
  options: BuildTodayPresentationOptions = {},
): Promise<TodayViewModel> {
  const day = localDateFromTrainingDayId(trainingDayId);
  const inputs = await loadTodayPresentationInputs(athleteId, trainingDayId, day, options);
  const vm = buildTodayViewModelFromInputs(inputs);
  return attachSessionPurposes(athleteId, vm);
}

/** Decision Memory "why" on each planned line — kept out of the pure assembler. */
async function attachSessionPurposes(
  athleteId: string,
  vm: TodayViewModel,
): Promise<TodayViewModel> {
  const ids = vm.actionRow.daySummaryLines
    .map((line) => line.plannedSessionId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) {
    return vm;
  }
  const purposes = await findSessionPurposesByPlannedSessionIds(athleteId, ids);
  if (purposes.size === 0) {
    return vm;
  }
  return {
    ...vm,
    actionRow: {
      ...vm.actionRow,
      daySummaryLines: vm.actionRow.daySummaryLines.map((line) => ({
        ...line,
        purpose: line.plannedSessionId ? (purposes.get(line.plannedSessionId) ?? null) : null,
      })),
    },
  };
}

async function loadReconnectProviderNames(athleteId: string): Promise<string[]> {
  const [strava, garmin, withings, renpho, google] = await Promise.all([
    getStravaAccount(athleteId).catch(() => null),
    getGarminAccount(athleteId).catch(() => null),
    getWithingsAccount(athleteId).catch(() => null),
    getRenphoAccount(athleteId).catch(() => null),
    getGoogleAccount(athleteId).catch(() => null),
  ]);
  return reconnectProviderNames({ strava, garmin, withings, renpho, google });
}
