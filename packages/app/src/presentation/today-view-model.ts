import type { ProductInsight } from '@sharpit/core/product-insight/types';
import type { ActivityType } from '@prisma/client';
import type {
  PresentationAction,
  PresentationConfidence,
  PresentationEmptyState,
  PresentationHierarchy,
  PresentationNavigationTarget,
  PresentationSection,
} from '@sharpit/app/presentation/types';
import type { BrickLegSummary } from '@sharpit/app/lib/planned-session/brick/brick-sessions';

export type TodayViewModel = {
  /** Indique si la page peut être rendue (données suffisantes). */
  hasContent: boolean;
  emptyState: PresentationEmptyState | null;

  /** Texte affiché par le statut principal. */
  statusMessage: string | null;
  /** Optional recovery action for a status that the athlete can fix (reconnect). */
  statusHref?: string | null;
  /** Fingerprint for snoozing the reconnect banner until the next local midnight. */
  statusSnoozeKey?: string | null;

  confidencePresentation: PresentationConfidence;

  effortUnavailableMessage: string | null;

  /**
   * Morning Today flow (forward-advice phases only):
   * EVIDENCE_PENDING → ORIENTATION_READY → POST_CHOICE.
   */
  morningOrientation: {
    phase: 'EVIDENCE_PENDING' | 'ORIENTATION_READY' | 'POST_CHOICE';
    evidenceLine: string | null;
    showRefreshEvidence: boolean;
    showFirmActions: boolean;
    hideHeroConfidence: boolean;
    /** Overrides hero headline when set (evidence pending only). */
    heroHeadline: string | null;
    heroSubline: string | null;
    confirmEase: {
      decisionId: string;
      sessionId: string;
      changeSummary: string;
      why: string;
      current: {
        intensityLabel: string | null;
        durationMin: number | null;
        load: number | null;
        description: string | null;
      };
      proposed: {
        intensityLabel: string | null;
        durationMin: number | null;
        load: number | null;
        description: string | null;
      };
    } | null;
    confirmIncrease: {
      decisionId: string;
      sessionId: string;
      changeSummary: string;
      why: string;
      current: {
        intensityLabel: string | null;
        durationMin: number | null;
        load: number | null;
        description: string | null;
      };
      proposed: {
        intensityLabel: string | null;
        durationMin: number | null;
        load: number | null;
        description: string | null;
      };
    } | null;
    /** Reject recalibration (= Tenir) when a proposal is open. */
    holdDecisionId: string | null;
    /** Annotate the planned session chip — no separate post-choice card. */
    sessionChoice: {
      sessionId: string;
      kind: 'HOLD' | 'EASING_CONFIRMED' | 'INCREASE_CONFIRMED';
      label: string;
    } | null;
  } | null;

  /** Navigation targets are pre-resolved hrefs (client is renderer only). */
  navigationTargets: {
    sleep: PresentationNavigationTarget;
    recovery: PresentationNavigationTarget;
    effort: PresentationNavigationTarget;
    adaptation: PresentationNavigationTarget;
    planning: PresentationNavigationTarget;
    physical: PresentationNavigationTarget;
  };

  /** HERO = What to do now */
  hero: {
    eyebrow: string;
    headline: string;
    subline: string;
    posture: 'protect' | 'steady' | 'push' | 'uncertain';
    postureLabel: string;
    focusPriority: string | null;
    goalLine: string | null;
    /** Deep-link to `/moi/objectifs#goal-{id}` when a goal context exists. */
    goalHref: string | null;
    goalId: string | null;
    /** Today's planned session carries this goal. */
    goalLinkedToSession: boolean;
    actionLine: string | null;
    adaptationReminders: string[];
    verdictStyle: {
      showVerdictColors: boolean;
      bgClass: string;
      colorClass: string;
      dotClass: string;
      accentBarClass: string;
    };
    metricsRow: {
      sleepScore: number | null;
      recoveryScore: number | null;
      effortScore: number | null;
      adaptationScore: number | null;
      effortUnavailableCaption: string | null;
      adaptationUnavailableCaption: string | null;
    };
    /** Compact visual evidence for the Comprendre signal strip. */
    signalPreviews: Array<{
      key: 'sleep' | 'recovery' | 'adaptation' | 'effort';
      scoreDisplay: string;
      unit: string | null;
      subtitle: string | null;
      visual:
        | {
            kind: 'gauge';
            score: number;
            statusLabel: string | null;
            baselineTitle: string | null;
            baselineDetail: string | null;
            trend: 'up' | 'down' | 'flat' | null;
          }
        | {
            kind: 'stages';
            stages: Array<{ key: 'deep' | 'rem' | 'light' | 'awake'; fraction: number }>;
          }
        | { kind: 'spark'; values: (number | null)[]; stroke: string }
        | { kind: 'spectrum'; position: number }
        | { kind: 'none' };
    }>;
    twinTrustStrip: {
      confidenceLabel: string | null;
      confidencePctRounded: number | null;
      confidenceHref: string | null;
      /** Why the limiting dimension is limiting — not its name. */
      limitingCauseText: string | null;
      /** Drill-down when plate limiter is shown. */
      limitingFactorHref: string | null;
    };
    /** Science Sport reliability V0 — packTier soft-hero + provenance. */
    reliability: {
      packTier: 'FULL' | 'PARTIAL' | 'LOW' | 'INSUFFICIENT';
      softHero: boolean;
      estimationChip: string | null;
      visibleGaps: readonly string[];
      ctaCompleteSources: boolean;
      withholdIntensityTopAction: boolean;
      provenance: {
        packTier: 'FULL' | 'PARTIAL' | 'LOW' | 'INSUFFICIENT';
        estimationChip: string | null;
        series: ReadonlyArray<{
          key: string;
          label: string;
          detail: string;
          status: 'ok' | 'gap' | 'partial';
        }>;
        gaps: readonly string[];
        gapLabels: readonly string[];
        goalVsJournalWeight: string;
        rationaleCodes: readonly string[];
        rationaleLabels: readonly string[];
      };
    } | null;
  };

  actionRow: {
    showLimitingColumn: boolean;
    limitingLabel: string;
    limitingMode: 'facts' | 'list' | 'link' | 'text' | 'none';
    limitingLines: string[];
    limitingText: string | null;
    limitingHref: string | null;
    limitingFacts: Array<{ label: string; value: string; hint?: string | null }>;
    actionLabel: string;
    daySummaryEmptyText: string;
    daySummaryEmptyHref: string;
    /** Unlinked same-day pairs the athlete can associate in one action. */
    sessionLinkSuggestions: Array<{
      id: string;
      plannedSessionId: string;
      activityId: string;
      activityType: ActivityType;
      score: number;
      matchLabel: string;
      plannedPrimary: string;
      plannedSecondary?: string | null;
      activityPrimary: string;
      activitySecondary?: string | null;
    }>;
    /** Rendered list already contains resolved links. */
    daySummaryLines: Array<{
      id: string;
      activityType: ActivityType;
      primary: string;
      secondary?: string | null;
      kind: 'done' | 'planned';
      href: string;
      isDone: boolean;
      /**
       * The prescription behind this line, when there is one. Distinct from `id`: a brick
       * line is identified by its group, so only this addresses the session itself.
       */
      plannedSessionId?: string | null;
      /** One of the week's key sessions (F2) — a brick by its first leg. */
      isKey?: boolean;
      /**
       * Why the coach wrote this prescription — Decision Memory proposal rationale.
       * Null when the session was never linked to a decision or carried no prose.
       */
      purpose?: string | null;
      /** Key KPIs for session preview cards (done + planned — max 3). */
      metrics?: Array<{ label: string; value: string; unit: string }> | null;
      /** Morning choice annotation on this session (post-choice). */
      morningChoiceLabel?: string | null;
      /** Set for a brick line — render one card with each leg behind a dropdown. */
      brickLegs?: BrickLegSummary[] | null;
      /** Set for a brick under way: seconds from each leg's end to the next's start. */
      brickTransitionsSec?: Array<number | null> | null;
    }>;
    primaryAction?: PresentationAction | null;
    /** Bidirectional morning session adjustment — athlete must confirm. */
    morningRecalibration: {
      decisionId: string;
      sessionId: string;
      sessionType: string;
      direction: 'DOWN' | 'UP';
      changeSummary: string;
      why: string;
      status: 'PRESENTED' | 'ACCEPTED' | 'REJECTED' | 'MODIFIED' | 'EXPIRED';
      fromIntensity: string | null;
      toIntensity: string | null;
      fromDurationMin: number | null;
      toDurationMin: number | null;
      fromLoad: number | null;
      toLoad: number | null;
      fromDescription: string | null;
      toDescription: string | null;
    } | null;
  };

  insights: ProductInsight[];

  /** Environmental context when training impact is significant (Phase 3). */
  /** Weather at the top of the morning screen. The date needs no fetch. */
  header: {
    weather: {
      city: string;
      tempC: number;
      condition: string;
      /** False when the reading is for hard-coded coordinates. */
      locationKnown: boolean;
    } | null;
  };

  environmentContext: {
    visible: boolean;
    summaryLine: string | null;
    detailLine: string | null;
    thermalLabel: string | null;
  } | null;

  nutrition: {
    visible: boolean;
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
  } | null;

  /**
   * Post-effort loop on Today (SESSION_COMPLETED / RECOVERY_WINDOW):
   * ressenti CTA + récit link + sync freshness affirmation.
   */
  postSessionLoop: {
    visible: true;
    activityId: string;
    activityTitle: string;
    needsFeeling: boolean;
    narrativeHref: string;
    freshnessLine: string | null;
  } | null;

  /**
   * Feedback → rearrange CTA (presentation only). Deep-links to PlanAdapter;
   * never applies calendar mutations without athlete confirmation.
   * Visual Plan vivant panel: goal band + session preview chips.
   */
  rearrangeProposal: {
    visible: true;
    headline: string;
    why: string;
    ctaLabel: string;
    href: string;
    focus: string;
    trigger: 'POST_SESSION' | 'MORNING_MISMATCH' | 'HABIT_ASSOCIATION' | 'HABIT_EXPERIMENT';
    kind: 'protect' | 'push' | 'effort' | 'habit';
    goalLabel: string | null;
    /** Journal lever when habit drives or annotates the same Plan vivant CTA. */
    habitLever: {
      label: string;
      source: 'association' | 'experiment';
    } | null;
    previewSessions: Array<{
      id: string;
      dateLabel: string;
      intensityLabel: string;
      intensity: import('@prisma/client').SessionIntensity | null;
      tone: 'tension' | 'calm' | 'neutral';
    }>;
  } | null;

  hierarchy: PresentationHierarchy;
  sections: PresentationSection[];
};

// Alias de nommage demandé (Presentation Layer naming).
export type TodayPresentationViewModel = TodayViewModel;
