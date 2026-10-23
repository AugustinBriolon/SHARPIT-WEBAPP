import { apiFetch } from '@sharpit/app/lib/api/api-fetch';
/**
 * Athlete activity status — longer-lived mode, independent of the day journal.
 *
 * Source of truth: DB (`AthleteActivityStatus` + history). localStorage is an
 * optimistic cache for Instant UX until the network round-trip completes.
 *
 * Presentation impact (not Core): Today reminders, planning chrome, coach discuss labels.
 */

export const ACTIVITY_STATUS_IDS = ['active', 'paused', 'injured', 'sick'] as const;

export type ActivityStatusId = (typeof ACTIVITY_STATUS_IDS)[number];

export const ACTIVITY_STATUS_DEFAULT: ActivityStatusId = 'active';

export type ActivityStatusRetentionKind = 'until_modified' | 'until_date';

export type ActivityStatusRetention =
  { kind: 'until_modified' } | { kind: 'until_date'; untilDate: string };

export type ActivityStatusOption = {
  id: ActivityStatusId;
  label: string;
  hint: string;
  /** How planning / coach should bias while this mode is on. */
  planningImpact: string;
};

export const ACTIVITY_STATUS_OPTIONS: readonly ActivityStatusOption[] = [
  {
    id: 'active',
    label: 'Actif',
    hint: 'En routine d’entraînement',
    planningImpact: 'Charge et séances suivent le plan.',
  },
  {
    id: 'paused',
    label: 'En pause',
    hint: 'Pause dans l’entraînement',
    planningImpact: 'Pas de charge volontaire — plan en veille jusqu’à reprise.',
  },
  {
    id: 'injured',
    label: 'Blessé',
    hint: 'En convalescence après une blessure',
    planningImpact: 'Priorité sécurité — adapter ou reporter les séances à risque.',
  },
  {
    id: 'sick',
    label: 'Malade',
    hint: 'Repos pour cause de maladie',
    planningImpact: 'Repos avant la charge — reprendre seulement quand le corps suit.',
  },
] as const;

export const ACTIVITY_STATUS_STORAGE_KEY = 'sharpit.activityStatus.v2';
/** Legacy key — migrated on first read. */
const ACTIVITY_STATUS_STORAGE_KEY_V1 = 'sharpit.activityStatus.v1';

export type ActivityStatusStore = {
  version: 2;
  status: ActivityStatusId;
  retention: ActivityStatusRetention;
  /** Optional travel context id when status is paused. */
  travelId: string | null;
  updatedAt: string;
};

export type ActivityStatusWriteInput = {
  status: ActivityStatusId;
  retention?: ActivityStatusRetention;
  travelId?: string | null;
};

/** Draft shape used by the activity-status drawer before commit. */
export type ActivityStatusDraft = {
  status: ActivityStatusId;
  retentionKind: ActivityStatusRetentionKind;
  untilDate: string;
  travelId: string | null;
};

export function activityStatusWriteFromDraft(draft: ActivityStatusDraft): ActivityStatusWriteInput {
  if (draft.status === 'active') {
    return { status: 'active' };
  }
  const retention: ActivityStatusRetention =
    draft.retentionKind === 'until_date'
      ? { kind: 'until_date', untilDate: draft.untilDate }
      : { kind: 'until_modified' };
  return {
    status: draft.status,
    retention,
    travelId: draft.status === 'paused' ? draft.travelId : null,
  };
}

export function activityStatusDraftMatchesStore(
  store: ActivityStatusStore,
  draft: ActivityStatusDraft,
): boolean {
  if (store.status !== draft.status) {
    return false;
  }
  if (draft.status === 'active') {
    return true;
  }
  if (store.retention.kind !== draft.retentionKind) {
    return false;
  }
  if (
    draft.retentionKind === 'until_date' &&
    store.retention.kind === 'until_date' &&
    store.retention.untilDate !== draft.untilDate
  ) {
    return false;
  }
  const expectedTravel = draft.status === 'paused' ? draft.travelId : null;
  return store.travelId === expectedTravel;
}

const STATUS_SET = new Set<string>(ACTIVITY_STATUS_IDS);
const listeners = new Set<() => void>();

export function isActivityStatus(value: string): value is ActivityStatusId {
  return STATUS_SET.has(value);
}

export function activityStatusLabel(status: ActivityStatusId): string {
  return ACTIVITY_STATUS_OPTIONS.find((option) => option.id === status)?.label ?? status;
}

export function activityStatusOption(status: ActivityStatusId): ActivityStatusOption {
  return (
    ACTIVITY_STATUS_OPTIONS.find((option) => option.id === status) ?? ACTIVITY_STATUS_OPTIONS[0]!
  );
}

export function defaultRetentionForStatus(status: ActivityStatusId): ActivityStatusRetention {
  if (status === 'active') {
    return { kind: 'until_modified' };
  }
  return { kind: 'until_modified' };
}

export function formatUntilDateFr(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function todayIsoDate(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * A training day that can no longer change by itself: older than yesterday. Yesterday stays
 * live — its night ends this morning and late sessions still arrive.
 */
export function isSettledTrainingDay(trainingDayId: string, now: Date = new Date()): boolean {
  return trainingDayId < todayIsoDate(new Date(now.getTime() - 24 * 60 * 60_000));
}

export function emptyActivityStatusStore(
  updatedAt = '1970-01-01T00:00:00.000Z',
): ActivityStatusStore {
  return {
    version: 2,
    status: ACTIVITY_STATUS_DEFAULT,
    retention: { kind: 'until_modified' },
    travelId: null,
    updatedAt,
  };
}

function normalizeRetention(raw: unknown): ActivityStatusRetention {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'until_modified' };
  }
  const record = raw as { kind?: unknown; untilDate?: unknown };
  if (
    record.kind === 'until_date' &&
    typeof record.untilDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.untilDate)
  ) {
    return { kind: 'until_date', untilDate: record.untilDate };
  }
  return { kind: 'until_modified' };
}

function migrateLegacyStatus(rawStatus: string): ActivityStatusId {
  if (rawStatus === 'vacation') {
    return 'paused';
  }
  if (isActivityStatus(rawStatus)) {
    return rawStatus;
  }
  return ACTIVITY_STATUS_DEFAULT;
}

type RawActivityStatusRecord = {
  version?: unknown;
  status?: unknown;
  retention?: unknown;
  travelId?: unknown;
  updatedAt?: unknown;
};

function parseUpdatedAt(raw: unknown): string {
  return typeof raw === 'string' ? raw : new Date().toISOString();
}

function parseV2ActivityStatusStore(record: RawActivityStatusRecord): ActivityStatusStore | null {
  if (record.version !== 2 || typeof record.status !== 'string') {
    return null;
  }
  const status = migrateLegacyStatus(record.status);
  return {
    version: 2,
    status,
    retention:
      status === 'active' ? { kind: 'until_modified' } : normalizeRetention(record.retention),
    travelId: status === 'paused' && typeof record.travelId === 'string' ? record.travelId : null,
    updatedAt: parseUpdatedAt(record.updatedAt),
  };
}

function parseV1ActivityStatusStore(record: RawActivityStatusRecord): ActivityStatusStore | null {
  if (record.version !== 1 || typeof record.status !== 'string') {
    return null;
  }
  const status = migrateLegacyStatus(record.status);
  return {
    version: 2,
    status,
    retention: { kind: 'until_modified' },
    travelId: null,
    updatedAt: parseUpdatedAt(record.updatedAt),
  };
}

export function parseActivityStatusStore(raw: unknown): ActivityStatusStore {
  if (!raw || typeof raw !== 'object') {
    return emptyActivityStatusStore();
  }
  const record = raw as RawActivityStatusRecord;
  return (
    parseV2ActivityStatusStore(record) ??
    parseV1ActivityStatusStore(record) ??
    emptyActivityStatusStore()
  );
}

/** If until_date is past, resolve back to Actif. */
export function resolveActivityStatusStore(
  store: ActivityStatusStore,
  today: string = todayIsoDate(),
): ActivityStatusStore {
  if (store.status === 'active') {
    return store;
  }
  if (store.retention.kind === 'until_date' && store.retention.untilDate < today) {
    return {
      ...emptyActivityStatusStore(),
      updatedAt: new Date().toISOString(),
    };
  }
  return store;
}

function readRawActivityStatusJson(): unknown {
  const rawV2 = window.localStorage.getItem(ACTIVITY_STATUS_STORAGE_KEY);
  if (rawV2) {
    return JSON.parse(rawV2) as unknown;
  }
  const rawV1 = window.localStorage.getItem(ACTIVITY_STATUS_STORAGE_KEY_V1);
  if (rawV1) {
    return JSON.parse(rawV1) as unknown;
  }
  return null;
}

function shouldPersistResolvedStore(
  resolved: ActivityStatusStore,
  parsed: ActivityStatusStore,
  hadV1Only: boolean,
): boolean {
  if (resolved.status !== parsed.status) {
    return true;
  }
  if (resolved.version !== parsed.version) {
    return true;
  }
  return hadV1Only;
}

export function readActivityStatusStore(): ActivityStatusStore {
  if (typeof window === 'undefined') {
    return emptyActivityStatusStore();
  }
  try {
    const rawV2 = window.localStorage.getItem(ACTIVITY_STATUS_STORAGE_KEY);
    const rawV1 = window.localStorage.getItem(ACTIVITY_STATUS_STORAGE_KEY_V1);
    const parsed = parseActivityStatusStore(readRawActivityStatusJson());
    const resolved = resolveActivityStatusStore(parsed);
    const hadV1Only = Boolean(rawV1 && !rawV2);
    if (shouldPersistResolvedStore(resolved, parsed, hadV1Only)) {
      writeActivityStatusStore(resolved);
    }
    return resolved;
  } catch {
    return emptyActivityStatusStore();
  }
}

export function writeActivityStatusStore(store: ActivityStatusStore): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ACTIVITY_STATUS_STORAGE_KEY, JSON.stringify(store));
  window.localStorage.removeItem(ACTIVITY_STATUS_STORAGE_KEY_V1);
  listeners.forEach((listener) => listener());
}

export function setActivityStatus(
  input: ActivityStatusWriteInput | ActivityStatusId,
): ActivityStatusStore {
  const payload: ActivityStatusWriteInput = typeof input === 'string' ? { status: input } : input;
  const { status } = payload;
  const retention =
    status === 'active'
      ? ({ kind: 'until_modified' } as const)
      : (payload.retention ?? defaultRetentionForStatus(status));
  const travelId = status === 'paused' ? (payload.travelId ?? null) : null;
  const next: ActivityStatusStore = {
    version: 2,
    status,
    retention,
    travelId,
    updatedAt: new Date().toISOString(),
  };
  writeActivityStatusStore(next);
  void persistActivityStatusToServer({
    status,
    retention: status === 'active' ? undefined : retention,
    travelId,
  });
  return next;
}

async function persistActivityStatusToServer(payload: ActivityStatusWriteInput): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const res = await apiFetch('/api/activity-status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as { store?: unknown };
    const parsed = parseActivityStatusStore(data.store);
    writeActivityStatusStore(parsed);
  } catch {
    // Keep optimistic local cache; next hydrate will reconcile.
  }
}

/** Pull canonical status from DB into the local cache (Today / planning chrome). */
export async function hydrateActivityStatusFromServer(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const res = await apiFetch('/api/activity-status');
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as { store?: unknown };
    writeActivityStatusStore(parseActivityStatusStore(data.store));
  } catch {
    // Keep local cache.
  }
}

export function subscribeActivityStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActivityStatusSnapshot(): ActivityStatusId {
  return readActivityStatusStore().status;
}

export function getActivityStatusServerSnapshot(): ActivityStatusId {
  return ACTIVITY_STATUS_DEFAULT;
}

export function getActivityStatusStoreSnapshot(): string {
  return JSON.stringify(readActivityStatusStore());
}

export function getActivityStatusStoreServerSnapshot(): string {
  return JSON.stringify(emptyActivityStatusStore());
}
