import type { AccessTier, Prisma } from '@prisma/client';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import type { DemoTranscriptMessage } from '@sharpit/app/lib/demo/demo-coach-transcript';
import type { AthleteEquipment } from '@sharpit/app/lib/equipment/types';
import type { IntegrationId } from '@sharpit/app/lib/integrations/shared/client-sync';
import type { IntegrationSourcePrefs } from '@sharpit/app/lib/integrations/source-prefs';
import type { buildJournalAnalysesViewModel } from '@sharpit/app/lib/journal/journal-analyses-view-model';
import type { HabitExperimentView } from '@sharpit/app/lib/journal/journal-habit-experiment-view';
import type { JournalHabitReading } from '@sharpit/app/lib/journal/journal-habit-reading';
import type { resolveBrickSiblingActivityLinks } from '@sharpit/app/lib/planned-session/brick/brick-sessions';
import type { ClientActivityDetail } from '@sharpit/app/lib/query/types';

/**
 * What `api.` answers under `/api/web/*` — the reads the web's server components make in place
 * of the database (ADR-048 phase 3f). The API's loaders are typed against these, so the web never
 * needs the server package to know the shapes.
 */

/** The signed-in visitor's routing context for the web shell. */
export type WebViewer = {
  isDemo: boolean;
  tier: AccessTier;
  isPro: boolean;
  /** The account was deleted: back to sign-in. */
  deleted: boolean;
  /** The consent wall to pass first, or null. */
  consentWallHref: string | null;
  needsOnboarding: boolean;
  /** The next screen after sign-in: consents, then onboarding, then Today. */
  entryPath: string;
};

export type ActivityDetailPayload = {
  activity: ClientActivityDetail;
  multisportLegs: MultisportLeg[] | null;
  goalValidations: Prisma.GoalAchievementGetPayload<{
    include: {
      goal: { select: { id: true; title: true; unit: true; metricKey: true; targetValue: true } };
    };
  }>[];
  performanceRecords: { category: string; label: string }[];
  narrativeAccess: { allowed: boolean; isPro: boolean };
  brickSiblings: ReturnType<typeof resolveBrickSiblingActivityLinks>;
  coachEnabled: boolean;
};

export type JournalAnalysesPayload = {
  analysis: {
    reading: JournalHabitReading;
    viewModel: ReturnType<typeof buildJournalAnalysesViewModel>;
  } | null;
  daysWithSignal: number;
  experiments: HabitExperimentView[];
  isPro: boolean;
  minDays: number;
};

export type OnboardingPayload = {
  initialEquipment: AthleteEquipment;
  initiallyConnected: IntegrationId[];
  initialPrefs: IntegrationSourcePrefs;
  unofficialAcknowledged: boolean;
};

/** What the integrations hub shows of an account — never a token, encrypted or not. */
export type IntegrationAccountView = {
  displayName?: string | null;
  lastSyncAt?: Date | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  fullName?: string | null;
  targetCalendarId?: string | null;
  targetCalendarName?: string | null;
};

export type IntegrationProviderView = {
  account: IntegrationAccountView | null;
  needsReconnect: boolean;
};

export type IntegrationsHubPayload = {
  strava: IntegrationProviderView & { configured: boolean };
  garmin: IntegrationProviderView;
  renpho: IntegrationProviderView;
  withings: IntegrationProviderView & { configured: boolean };
  google: IntegrationProviderView & { configured: boolean };
  /** Linked from the iPhone app; the web only shows it. */
  appleHealth: { linkedAt: string | null };
  prefs: IntegrationSourcePrefs;
};

export type AdminAthleteView = {
  id: string;
  clerkUserId: string;
  tier: AccessTier;
  createdAt: Date;
  email: string | null;
};

export type DemoCoachTranscriptPayload = {
  title: string;
  messages: DemoTranscriptMessage[];
};
