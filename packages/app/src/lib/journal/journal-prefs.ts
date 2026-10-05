/**
 * Profile-level journal visibility + diet + auto-checklist thresholds + custom items.
 * Source of truth: AthleteProfile.journalPrefs (JSON). localStorage is an optimistic cache.
 */

import {
  JOURNAL_BUILTIN_TRACKABLE_IDS,
  JOURNAL_BUILTIN_TRACKABLES,
  type JournalBuiltinTrackableId,
  createCustomTrackableId,
  isCustomTrackableId,
  journalTrackableById,
} from '@sharpit/app/lib/journal/journal-trackables';
import {
  isJournalAutoItemId,
  type JournalAutoItemId,
} from '@sharpit/app/lib/journal/journal-auto-ids';
import {
  canEnableAnotherTrackable,
  enforceJournalPrefsLimits,
} from '@sharpit/app/lib/journal/journal-limits';
import { apiFetch } from '@sharpit/app/lib/api/api-fetch';

export type JournalCustomItem = {
  id: string;
  label: string;
  enabled: boolean;
};

export type JournalThresholds = {
  steps: number;
  stressMax: number;
  cardioMinMinutes: number;
  strengthMinMinutes: number;
  sleepMinMinutes: number;
  bodyBatteryMin: number;
  hydrationMlMin: number;
};

export type JournalPrefs = {
  version: 2;
  /** Flat enable map for built-in trackables. */
  enabled: Record<JournalBuiltinTrackableId, boolean>;
  customItems: JournalCustomItem[];
  thresholds: JournalThresholds;
};

export const JOURNAL_PREFS_STORAGE_KEY = 'sharpit.journalPrefs.v2';

export const DEFAULT_JOURNAL_THRESHOLDS: JournalThresholds = {
  steps: 10_000,
  stressMax: 40,
  cardioMinMinutes: 20,
  strengthMinMinutes: 20,
  sleepMinMinutes: 420,
  bodyBatteryMin: 50,
  hydrationMlMin: 2000,
};

const DEFAULT_ON: ReadonlySet<JournalBuiltinTrackableId> = new Set([
  'metric_caffeine',
  'metric_mood',
  'metric_hydration',
  'late_meal',
  'device_in_bed',
]);

function defaultEnabledMap(): Record<JournalBuiltinTrackableId, boolean> {
  return Object.fromEntries(
    JOURNAL_BUILTIN_TRACKABLE_IDS.map((id) => [id, DEFAULT_ON.has(id)]),
  ) as Record<JournalBuiltinTrackableId, boolean>;
}

export function defaultJournalPrefs(): JournalPrefs {
  return {
    version: 2,
    enabled: defaultEnabledMap(),
    customItems: [],
    thresholds: { ...DEFAULT_JOURNAL_THRESHOLDS },
  };
}

function readRecordField(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function applyThresholdField(
  base: JournalThresholds,
  record: Record<string, unknown>,
  key: keyof JournalThresholds,
  isValid: (value: number) => boolean,
): void {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value) && isValid(value)) {
    base[key] = Math.round(value);
  }
}

function parseThresholds(raw: unknown): JournalThresholds {
  const base = { ...DEFAULT_JOURNAL_THRESHOLDS };
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const record = raw as Record<string, unknown>;
  applyThresholdField(base, record, 'steps', (value) => value > 0);
  applyThresholdField(base, record, 'stressMax', (value) => value >= 0);
  applyThresholdField(base, record, 'cardioMinMinutes', (value) => value > 0);
  applyThresholdField(base, record, 'strengthMinMinutes', (value) => value > 0);
  applyThresholdField(base, record, 'sleepMinMinutes', (value) => value > 0);
  applyThresholdField(base, record, 'bodyBatteryMin', (value) => value >= 0);
  applyThresholdField(base, record, 'hydrationMlMin', (value) => value > 0);
  return base;
}

function parseCustomItem(entry: unknown): JournalCustomItem | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!isCustomTrackableId(id) || label.length < 1 || label.length > 48) {
    return null;
  }
  return { id, label, enabled: record.enabled === true };
}

function parseCustomItems(raw: unknown): JournalCustomItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(parseCustomItem).filter((item): item is JournalCustomItem => item !== null);
}

const V1_LIFESTYLE_FACTOR_IDS = [
  'tobacco',
  'sauna',
  'intermittent_fasting',
  'fever',
  'cold_shower',
  'cupping',
  'cbd',
  'sun_exposure',
] as const;

type V1MigrationContext = {
  sections: Record<string, unknown>;
  supplements: Record<string, unknown>;
  lifestyle: Record<string, unknown>;
  cycle: Record<string, unknown>;
  autoItems: Record<string, unknown>;
  diet: Record<string, unknown>;
};

function readV1MigrationContext(record: Record<string, unknown>): V1MigrationContext {
  return {
    sections: readRecordField(record.sections),
    supplements: readRecordField(record.supplements),
    lifestyle: readRecordField(record.lifestyle),
    cycle: readRecordField(record.cycle),
    autoItems: readRecordField(record.autoItems),
    diet: readRecordField(record.diet),
  };
}

function migrateV1DayBasics(prefs: JournalPrefs, sections: Record<string, unknown>): void {
  if (sections.day_basics !== false) {
    return;
  }
  prefs.enabled.metric_caffeine = false;
  prefs.enabled.metric_mood = false;
  prefs.enabled.metric_hydration = false;
}

function migrateV1PriorNight(prefs: JournalPrefs, sections: Record<string, unknown>): void {
  if (sections.prior_night !== false) {
    return;
  }
  prefs.enabled.late_meal = false;
  prefs.enabled.device_in_bed = false;
}

function migrateV1AutoChecklist(
  prefs: JournalPrefs,
  sections: Record<string, unknown>,
  autoItems: Record<string, unknown>,
): void {
  if (sections.auto_checklist !== true) {
    return;
  }
  for (const item of JOURNAL_BUILTIN_TRACKABLES.filter((trackable) => trackable.kind === 'auto')) {
    const { autoId } = item;
    prefs.enabled[item.id] = autoId ? autoItems[autoId] !== false : true;
  }
}

function migrateV1Nutrition(prefs: JournalPrefs, sections: Record<string, unknown>): void {
  if (sections.nutrition !== true) {
    return;
  }
  prefs.enabled.nutrition_panel = true;
  prefs.enabled.added_sugar = true;
}

function migrateV1Alcohol(
  prefs: JournalPrefs,
  sections: Record<string, unknown>,
  lifestyle: Record<string, unknown>,
): void {
  if (sections.alcohol !== true && lifestyle.alcohol !== true) {
    return;
  }
  prefs.enabled.alcohol = true;
}

function migrateV1Supplements(
  prefs: JournalPrefs,
  sections: Record<string, unknown>,
  supplements: Record<string, unknown>,
): void {
  if (sections.supplements !== true) {
    return;
  }
  for (const item of JOURNAL_BUILTIN_TRACKABLES.filter(
    (trackable) =>
      trackable.kind === 'factor' && trackable.category === 'bien_etre' && trackable.factorId,
  )) {
    const { factorId } = item;
    if (factorId && factorId in supplements) {
      prefs.enabled[item.id] = supplements[factorId] === true;
    }
  }
}

function migrateV1Cycle(
  prefs: JournalPrefs,
  sections: Record<string, unknown>,
  cycle: Record<string, unknown>,
): void {
  if (sections.cycle !== true || cycle.menstruation !== true) {
    return;
  }
  prefs.enabled.menstruation = true;
}

function migrateV1Lifestyle(
  prefs: JournalPrefs,
  sections: Record<string, unknown>,
  lifestyle: Record<string, unknown>,
): void {
  const lifestyleEnabled =
    sections.lifestyle === true || Object.values(lifestyle).some((value) => value === true);
  if (!lifestyleEnabled) {
    return;
  }
  for (const id of V1_LIFESTYLE_FACTOR_IDS) {
    if (lifestyle[id] === true) {
      prefs.enabled[id] = true;
    }
  }
}

function migrateV1Diet(prefs: JournalPrefs, diet: Record<string, unknown>): void {
  for (const item of JOURNAL_BUILTIN_TRACKABLES.filter((trackable) => trackable.kind === 'diet')) {
    if (item.dietId && diet[item.dietId] === true) {
      prefs.enabled[item.id] = true;
    }
  }
}

function migrateFromV1(record: Record<string, unknown>): JournalPrefs {
  const prefs = defaultJournalPrefs();
  const ctx = readV1MigrationContext(record);

  migrateV1DayBasics(prefs, ctx.sections);
  migrateV1PriorNight(prefs, ctx.sections);
  migrateV1AutoChecklist(prefs, ctx.sections, ctx.autoItems);
  migrateV1Nutrition(prefs, ctx.sections);
  migrateV1Alcohol(prefs, ctx.sections, ctx.lifestyle);
  migrateV1Supplements(prefs, ctx.sections, ctx.supplements);
  migrateV1Cycle(prefs, ctx.sections, ctx.cycle);
  migrateV1Lifestyle(prefs, ctx.sections, ctx.lifestyle);
  migrateV1Diet(prefs, ctx.diet);

  prefs.thresholds = parseThresholds(record.thresholds);
  return prefs;
}

function parseEnabledMap(raw: unknown): Record<JournalBuiltinTrackableId, boolean> {
  const enabled = defaultEnabledMap();
  if (!raw || typeof raw !== 'object') {
    return enabled;
  }
  const map = raw as Record<string, unknown>;
  for (const id of JOURNAL_BUILTIN_TRACKABLE_IDS) {
    if (typeof map[id] === 'boolean') {
      enabled[id] = map[id];
    }
  }
  return enabled;
}

export function parseJournalPrefs(raw: unknown): JournalPrefs {
  const defaults = defaultJournalPrefs();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const record = raw as Record<string, unknown>;
  if (record.version === 1) {
    return migrateFromV1(record);
  }
  if (record.version !== 2) {
    return defaults;
  }

  return {
    version: 2,
    enabled: parseEnabledMap(record.enabled),
    customItems: parseCustomItems(record.customItems),
    thresholds: parseThresholds(record.thresholds),
  };
}

export function sanitizeJournalPrefsForPersist(raw: unknown, isPro = false): JournalPrefs {
  return enforceJournalPrefsLimits(parseJournalPrefs(raw), isPro);
}

export function isTrackableEnabled(prefs: JournalPrefs, id: JournalBuiltinTrackableId): boolean {
  return prefs.enabled[id] === true;
}

export function setTrackableEnabled(
  prefs: JournalPrefs,
  id: JournalBuiltinTrackableId,
  enabled: boolean,
  isPro = false,
): JournalPrefs {
  if (enabled && !prefs.enabled[id] && !canEnableAnotherTrackable(prefs, isPro)) {
    return prefs;
  }
  return {
    ...prefs,
    enabled: { ...prefs.enabled, [id]: enabled },
  };
}

export function addCustomTrackable(
  prefs: JournalPrefs,
  label: string,
  isPro = false,
): JournalPrefs {
  if (!isPro) {
    return prefs;
  }
  const trimmed = label.trim();
  if (trimmed.length < 1 || trimmed.length > 48) {
    return prefs;
  }
  if (!canEnableAnotherTrackable(prefs, isPro)) {
    return prefs;
  }
  const id = createCustomTrackableId();
  return {
    ...prefs,
    customItems: [...prefs.customItems, { id, label: trimmed, enabled: true }],
  };
}

export function setCustomTrackableEnabled(
  prefs: JournalPrefs,
  id: string,
  enabled: boolean,
  isPro = false,
): JournalPrefs {
  if (!isPro) {
    return prefs;
  }
  const current = prefs.customItems.find((item) => item.id === id);
  if (!current) {
    return prefs;
  }
  if (enabled && !current.enabled && !canEnableAnotherTrackable(prefs, isPro)) {
    return prefs;
  }
  return {
    ...prefs,
    customItems: prefs.customItems.map((item) => (item.id === id ? { ...item, enabled } : item)),
  };
}

export function removeCustomTrackable(prefs: JournalPrefs, id: string): JournalPrefs {
  return {
    ...prefs,
    customItems: prefs.customItems.filter((item) => item.id !== id),
  };
}

export function enabledAutoItemIds(prefs: JournalPrefs): JournalAutoItemId[] {
  return JOURNAL_BUILTIN_TRACKABLES.filter(
    (item) => item.kind === 'auto' && prefs.enabled[item.id] && item.autoId,
  )
    .map((item) => item.autoId!)
    .filter(isJournalAutoItemId);
}

export function enabledFactorIds(prefs: JournalPrefs): string[] {
  const builtin = JOURNAL_BUILTIN_TRACKABLES.filter(
    (item) => item.kind === 'factor' && prefs.enabled[item.id] && item.factorId,
  ).map((item) => item.factorId!);
  const custom = prefs.customItems.filter((item) => item.enabled).map((item) => item.id);
  return [...builtin, ...custom];
}

export function activeDietIds(prefs: JournalPrefs): string[] {
  return JOURNAL_BUILTIN_TRACKABLES.filter(
    (item) => item.kind === 'diet' && prefs.enabled[item.id] && item.dietId,
  ).map((item) => item.dietId!);
}

export function activeDietLabels(prefs: JournalPrefs): string[] {
  return JOURNAL_BUILTIN_TRACKABLES.filter(
    (item) => item.kind === 'diet' && prefs.enabled[item.id],
  ).map((item) => item.label);
}

export function showDayBasics(prefs: JournalPrefs): boolean {
  return (
    prefs.enabled.metric_caffeine ||
    prefs.enabled.metric_mood ||
    prefs.enabled.metric_hydration ||
    prefs.enabled.metric_driving
  );
}

export function showAutoChecklist(prefs: JournalPrefs): boolean {
  return enabledAutoItemIds(prefs).length > 0;
}

export function showNutritionPanel(prefs: JournalPrefs): boolean {
  return prefs.enabled.nutrition_panel;
}

export function readJournalPrefsCache(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof window === 'undefined'
    ? null
    : window.localStorage,
): JournalPrefs {
  if (!storage) {
    return defaultJournalPrefs();
  }
  try {
    const rawV2 = storage.getItem(JOURNAL_PREFS_STORAGE_KEY);
    if (rawV2) {
      return parseJournalPrefs(JSON.parse(rawV2) as unknown);
    }
    const rawV1 = storage.getItem('sharpit.journalPrefs.v1');
    if (rawV1) {
      return parseJournalPrefs(JSON.parse(rawV1) as unknown);
    }
    return defaultJournalPrefs();
  } catch {
    return defaultJournalPrefs();
  }
}

export function writeJournalPrefsCache(
  prefs: JournalPrefs,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof window === 'undefined'
    ? null
    : window.localStorage,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(JOURNAL_PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

export async function fetchJournalPrefs(): Promise<{ prefs: JournalPrefs; isPro: boolean }> {
  const response = await apiFetch('/api/journal-prefs');
  if (!response.ok) {
    throw new Error('Impossible de charger les préférences journal');
  }
  const data = (await response.json()) as { prefs?: unknown; isPro?: unknown };
  return {
    prefs: parseJournalPrefs(data.prefs),
    isPro: data.isPro === true,
  };
}

export async function putJournalPrefs(
  prefs: JournalPrefs,
): Promise<{ prefs: JournalPrefs; isPro: boolean }> {
  const response = await apiFetch('/api/journal-prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefs }),
  });
  if (!response.ok) {
    throw new Error('Impossible d’enregistrer les préférences journal');
  }
  const data = (await response.json()) as { prefs?: unknown; isPro?: unknown };
  return {
    prefs: parseJournalPrefs(data.prefs),
    isPro: data.isPro === true,
  };
}

export { journalTrackableById, isCustomTrackableId };
