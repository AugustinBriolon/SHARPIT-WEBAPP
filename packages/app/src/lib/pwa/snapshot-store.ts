/**
 * Offline Snapshot persistence — the only module in this feature that touches
 * IndexedDB. Validation logic lives in snapshot-store-validation.ts (pure);
 * this file is a thin I/O wrapper around it.
 *
 * The offline copy is best effort: when the browser cannot open the database (Safari's
 * « Unable to open database file on disk », private browsing) a read finds nothing and a write
 * or a clear does nothing — never an error the page did not ask for (Sentry SHARPIT-WEBAPP-1).
 */

import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import {
  OFFLINE_SNAPSHOT_SCHEMA_VERSION,
  validatePersistedSnapshot,
  type PersistedSnapshotEntry,
} from './snapshot-store-validation';

const DB_NAME = 'sharpit-pwa';
const DB_VERSION = 1;
const STORE_NAME = 'athlete-snapshot';
/** Singleton record — this is a single-athlete app; ownership is still checked on read. */
const RECORD_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error as Error);
  });
}

async function bestEffort<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch {
    return fallback;
  }
}

export function saveSnapshot(input: {
  ownerKey: string;
  snapshot: AthleteSnapshot;
  now?: Date;
}): Promise<void> {
  return bestEffort(() => writeSnapshot(input), undefined);
}

async function writeSnapshot(input: {
  ownerKey: string;
  snapshot: AthleteSnapshot;
  now?: Date;
}): Promise<void> {
  const entry: PersistedSnapshotEntry = {
    schemaVersion: OFFLINE_SNAPSHOT_SCHEMA_VERSION,
    ownerKey: input.ownerKey,
    snapshot: input.snapshot,
    generatedAt: input.snapshot.generatedAt,
    freshnessComputedAt: input.snapshot.freshness.computedAt,
    cachedAt: (input.now ?? new Date()).toISOString(),
  };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  } finally {
    db.close();
  }
}

export function loadSnapshot(input: {
  ownerKey: string;
  now?: Date;
}): Promise<PersistedSnapshotEntry | null> {
  return bestEffort(() => readSnapshot(input), null);
}

async function readSnapshot(input: {
  ownerKey: string;
  now?: Date;
}): Promise<PersistedSnapshotEntry | null> {
  const db = await openDb();
  let raw: unknown;
  try {
    raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error as Error);
    });
  } finally {
    db.close();
  }

  if (raw === undefined || raw === null) {
    return null;
  }

  const result = validatePersistedSnapshot(raw, {
    currentOwnerKey: input.ownerKey,
    now: input.now ?? new Date(),
  });
  if (!result.valid) {
    await clearSnapshot();
    return null;
  }
  return raw as PersistedSnapshotEntry;
}

export function clearSnapshot(): Promise<void> {
  return bestEffort(deleteSnapshot, undefined);
}

async function deleteSnapshot(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  } finally {
    db.close();
  }
}
