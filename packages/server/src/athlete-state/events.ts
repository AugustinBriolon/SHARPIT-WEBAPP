/**
 * Athlete State — domain events
 *
 * Events drive synchronization, feature extraction, inference, and background work.
 * Every handler must be idempotent: replays produce the same athlete state.
 */

export type AthleteStateEventKind =
  | 'ApplicationOpened'
  | 'ProviderSyncRequested'
  | 'ProviderSyncCompleted'
  | 'ObservationIngested'
  | 'ActivityImported'
  | 'SleepImported'
  | 'BodyCompositionUpdated'
  | 'ManualWellnessSubmitted'
  | 'PlanChanged'
  | 'SessionCompleted'
  | 'InferenceRequested'
  | 'InferenceCompleted';

export type DataProvider =
  'garmin' | 'strava' | 'renpho' | 'withings' | 'google' | 'manual' | 'apple-health';

export type AthleteStateEventBase = {
  readonly eventId: string;
  readonly athleteId: string;
  readonly trainingDayId: string;
  readonly emittedAt: Date;
  readonly traceId: string;
};

export type ApplicationOpened = AthleteStateEventBase & {
  readonly kind: 'ApplicationOpened';
  readonly source: 'app_shell' | 'today_refresh' | 'cron';
};

export type ProviderSyncRequested = AthleteStateEventBase & {
  readonly kind: 'ProviderSyncRequested';
  readonly providers: readonly DataProvider[];
  readonly reason: string;
};

export type ProviderSyncCompleted = AthleteStateEventBase & {
  readonly kind: 'ProviderSyncCompleted';
  readonly provider: DataProvider;
  readonly imported: number;
  readonly updated: number;
  readonly observationCount: number;
};

export type ObservationIngestedState = AthleteStateEventBase & {
  readonly kind: 'ObservationIngested';
  readonly observationId: string;
  readonly observationType: string;
};

export type ActivityImported = AthleteStateEventBase & {
  readonly kind: 'ActivityImported';
  readonly activityIds: readonly string[];
  readonly provider: DataProvider;
};

export type SleepImported = AthleteStateEventBase & {
  readonly kind: 'SleepImported';
  readonly observationIds: readonly string[];
  readonly provider: DataProvider;
};

export type BodyCompositionUpdated = AthleteStateEventBase & {
  readonly kind: 'BodyCompositionUpdated';
  readonly provider: DataProvider;
};

export type ManualWellnessSubmitted = AthleteStateEventBase & {
  readonly kind: 'ManualWellnessSubmitted';
};

export type PlanChanged = AthleteStateEventBase & {
  readonly kind: 'PlanChanged';
  readonly change: 'created' | 'updated' | 'deleted' | 'linked';
};

export type SessionCompleted = AthleteStateEventBase & {
  readonly kind: 'SessionCompleted';
  readonly activityId: string;
};

export type InferenceRequested = AthleteStateEventBase & {
  readonly kind: 'InferenceRequested';
  readonly mode: 'fast' | 'background';
  readonly domains: readonly string[];
  readonly reason: string;
};

export type InferenceCompleted = AthleteStateEventBase & {
  readonly kind: 'InferenceCompleted';
  readonly mode: 'fast' | 'background';
  readonly domains: readonly string[];
};

export type AthleteStateEvent =
  | ApplicationOpened
  | ProviderSyncRequested
  | ProviderSyncCompleted
  | ObservationIngestedState
  | ActivityImported
  | SleepImported
  | BodyCompositionUpdated
  | ManualWellnessSubmitted
  | PlanChanged
  | SessionCompleted
  | InferenceRequested
  | InferenceCompleted;

export function createTraceId(): string {
  return `as-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEventId(kind: AthleteStateEventKind): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
