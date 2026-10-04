import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { saveSnapshot, loadSnapshot, clearSnapshot } from './snapshot-store';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function fakeSnapshot(overrides: Partial<AthleteSnapshot> = {}): AthleteSnapshot {
  return {
    snapshotId: 'snap-1',
    generatedAt: NOW.toISOString(),
    freshness: { computedAt: NOW.toISOString() } as never,
    ...overrides,
  } as AthleteSnapshot;
}

describe('snapshot-store (IndexedDB, fake-indexeddb)', () => {
  it('round-trips a saved snapshot for the same owner', async () => {
    await saveSnapshot({ ownerKey: 'user_123', snapshot: fakeSnapshot(), now: NOW });
    const loaded = await loadSnapshot({ ownerKey: 'user_123', now: NOW });

    expect(loaded).not.toBeNull();
    expect(loaded?.snapshot.snapshotId).toBe('snap-1');
    expect(loaded?.ownerKey).toBe('user_123');
  });

  it('returns null when nothing has ever been saved', async () => {
    await clearSnapshot();
    const loaded = await loadSnapshot({ ownerKey: 'user_123', now: NOW });
    expect(loaded).toBeNull();
  });

  it('clear then load returns null', async () => {
    await saveSnapshot({ ownerKey: 'user_123', snapshot: fakeSnapshot(), now: NOW });
    await clearSnapshot();
    const loaded = await loadSnapshot({ ownerKey: 'user_123', now: NOW });
    expect(loaded).toBeNull();
  });

  it('enforces ownership isolation — a different signed-in athlete never sees a prior athlete’s cached snapshot', async () => {
    await saveSnapshot({ ownerKey: 'user_123', snapshot: fakeSnapshot(), now: NOW });
    const loadedAsOther = await loadSnapshot({ ownerKey: 'user_456', now: NOW });
    expect(loadedAsOther).toBeNull();
  });

  it('clears the record on load when ownership no longer matches, instead of leaving stale data behind', async () => {
    await saveSnapshot({ ownerKey: 'user_123', snapshot: fakeSnapshot(), now: NOW });
    await loadSnapshot({ ownerKey: 'user_456', now: NOW }); // triggers the mismatch-clear path
    const loadedAsOriginalOwner = await loadSnapshot({ ownerKey: 'user_123', now: NOW });
    expect(loadedAsOriginalOwner).toBeNull();
  });

  it('a save overwrites the previous entry rather than accumulating records', async () => {
    await saveSnapshot({
      ownerKey: 'user_123',
      snapshot: fakeSnapshot({ snapshotId: 'snap-1' }),
      now: NOW,
    });
    await saveSnapshot({
      ownerKey: 'user_123',
      snapshot: fakeSnapshot({ snapshotId: 'snap-2' }),
      now: NOW,
    });
    const loaded = await loadSnapshot({ ownerKey: 'user_123', now: NOW });
    expect(loaded?.snapshot.snapshotId).toBe('snap-2');
  });

  it('stays quiet when the browser cannot open the database (Safari, private browsing)', async () => {
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('Unable to open database file on disk', 'UnknownError');
    });

    await expect(loadSnapshot({ ownerKey: 'athlete-1', now: NOW })).resolves.toBeNull();
    await expect(
      saveSnapshot({ ownerKey: 'athlete-1', snapshot: fakeSnapshot(), now: NOW }),
    ).resolves.toBeUndefined();
    await expect(clearSnapshot()).resolves.toBeUndefined();

    open.mockRestore();
  });
});
