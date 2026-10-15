import type { TodayViewModel } from '@sharpit/app/presentation/today-view-model';
import type { DailyPhase } from '@sharpit/app/lib/daily-phase/types';
import { TWIN_DRILL_DOWN } from '@sharpit/app/lib/today/navigation/today-twin-navigation';
import { actionRowLabels } from '@sharpit/app/lib/today/rich/today-rich-view';

function shellPhaseFromLocalHour(hour: number): DailyPhase {
  if (hour >= 22) {
    return 'END_OF_DAY';
  }
  if (hour >= 18) {
    return 'RECOVERY_WINDOW';
  }
  if (hour >= 14) {
    return 'SESSION_COMPLETED';
  }
  if (hour >= 10) {
    return 'BEFORE_SESSION';
  }
  return 'MORNING';
}

/** Fixed reference for prerender-safe loading labels (morning phase). */
const LOADING_SHELL_REFERENCE = new Date('2026-01-01T08:00:00');

function shellNavigationTargets(): TodayViewModel['navigationTargets'] {
  return {
    sleep: { label: 'Sommeil', href: TWIN_DRILL_DOWN.sleep },
    recovery: { label: 'Récupération', href: TWIN_DRILL_DOWN.recovery },
    effort: { label: 'Effort', href: TWIN_DRILL_DOWN.effort },
    adaptation: { label: 'Adaptation', href: TWIN_DRILL_DOWN.adaptation },
    physical: { label: 'Santé physique', href: TWIN_DRILL_DOWN.physical },
    planning: { label: 'Planning', href: TWIN_DRILL_DOWN.planning },
  };
}

function shellSignalPreviews(): TodayViewModel['hero']['signalPreviews'] {
  const placeholder = {
    scoreDisplay: '—',
    unit: null,
    subtitle: null,
    visual: { kind: 'none' as const },
  };
  return [
    { key: 'sleep', ...placeholder },
    { key: 'recovery', ...placeholder },
    { key: 'adaptation', ...placeholder },
    { key: 'effort', ...placeholder },
  ];
}

function shellHeroSection(): TodayViewModel['hero'] {
  return {
    eyebrow: 'Ce matin',
    headline: '',
    subline: '',
    posture: 'uncertain',
    postureLabel: '',
    focusPriority: null,
    goalLine: null,
    goalHref: null,
    goalId: null,
    goalLinkedToSession: false,
    actionLine: null,
    adaptationReminders: [],
    verdictStyle: {
      showVerdictColors: false,
      bgClass: 'bg-primary/8',
      colorClass: 'text-foreground',
      dotClass: 'bg-primary/50',
      accentBarClass: '',
    },
    metricsRow: {
      sleepScore: null,
      recoveryScore: null,
      effortScore: null,
      adaptationScore: null,
      effortUnavailableCaption: null,
      adaptationUnavailableCaption: null,
    },
    signalPreviews: shellSignalPreviews(),
    twinTrustStrip: {
      confidenceLabel: null,
      confidencePctRounded: null,
      confidenceHref: null,
      limitingCauseText: null,
      limitingFactorHref: null,
      limiterSignal: null,
      limiterSignals: [],
      limiterCountLabel: null,
      supportSignal: null,
      supportSignals: [],
      supportCountLabel: null,
      explanation: null,
      instruction: null,
      stateCode: null,
      showHeadline: null,
      vsYesterday: null,
      vsYesterdayLabel: null,
    },
    reliability: null,
  };
}

function shellActionRow(phase: DailyPhase): TodayViewModel['actionRow'] {
  const labels = actionRowLabels(phase);
  return {
    showLimitingColumn: false,
    limitingLabel: labels.limiting,
    limitingMode: 'none',
    limitingLines: [],
    limitingText: null,
    limitingHref: null,
    limitingFacts: [],
    actionLabel: labels.action,
    daySummaryEmptyText: '',
    daySummaryEmptyHref: TWIN_DRILL_DOWN.planning,
    daySummaryLines: [],
    sessionLinkSuggestions: [],
    morningRecalibration: null,
  };
}

/** Stable Today chrome for cold-start / placeholder micro-skeletons. */
export function todayLoadingShell(now: Date = LOADING_SHELL_REFERENCE): TodayViewModel {
  const phase = shellPhaseFromLocalHour(now.getHours());

  return {
    hasContent: true,
    emptyState: null,
    statusMessage: null,
    confidencePresentation: { pct: null, label: null, tone: 'neutral' },
    effortUnavailableMessage: null,
    morningOrientation: null,
    navigationTargets: shellNavigationTargets(),
    hero: shellHeroSection(),
    actionRow: shellActionRow(phase),
    insights: [],
    header: { weather: null },
    environmentContext: null,
    nutrition: null,
    postSessionLoop: null,
    rearrangeProposal: null,
    hierarchy: { rootId: 'today', order: [] },
    sections: [],
  };
}
