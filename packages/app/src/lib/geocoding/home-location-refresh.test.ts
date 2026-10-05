import { describe, expect, it } from 'vitest';
import {
  HOME_LOCATION_ATTEMPT_COOLDOWN_MS,
  HOME_LOCATION_CHECK_INTERVAL_MS,
  HOME_LOCATION_MOVE_METERS,
  HOME_LOCATION_REFRESH_MS,
  canAttemptSilentGeolocation,
  isSilentHomeLocationRefreshDue,
  distanceMeters,
  hasMovedSignificantly,
  readHomeLocationEverGranted,
  shouldRefreshHomeLocation,
  writeHomeLocationEverGranted,
} from '@sharpit/app/lib/geocoding/home-location-refresh';

describe('shouldRefreshHomeLocation', () => {
  const now = 1_700_000_000_000;

  it('refreshes about once an hour so Today does not freeze on the first city', () => {
    expect(HOME_LOCATION_REFRESH_MS).toBe(60 * 60 * 1000);
  });

  it('refreshes when nothing has been recorded yet', () => {
    expect(shouldRefreshHomeLocation(null, now)).toBe(true);
  });

  it('holds off inside the refresh window', () => {
    expect(shouldRefreshHomeLocation(now - HOME_LOCATION_REFRESH_MS + 1, now)).toBe(false);
  });

  it('refreshes once the window has elapsed', () => {
    expect(shouldRefreshHomeLocation(now - HOME_LOCATION_REFRESH_MS, now)).toBe(true);
    expect(shouldRefreshHomeLocation(now - HOME_LOCATION_REFRESH_MS - 1, now)).toBe(true);
  });
});

describe('isSilentHomeLocationRefreshDue', () => {
  const now = 1_700_000_000_000;
  const stale = now - HOME_LOCATION_REFRESH_MS;

  it('checks well inside the refresh window so an open tab catches it', () => {
    expect(HOME_LOCATION_CHECK_INTERVAL_MS).toBeLessThan(HOME_LOCATION_REFRESH_MS);
  });

  it('is due once the window has elapsed and nothing was attempted', () => {
    expect(isSilentHomeLocationRefreshDue(stale, null, now)).toBe(true);
    expect(isSilentHomeLocationRefreshDue(null, null, now)).toBe(true);
  });

  it('is not due inside the refresh window', () => {
    expect(isSilentHomeLocationRefreshDue(now - 1_000, null, now)).toBe(false);
  });

  it('does not start a second attempt when focus and visibility fire together', () => {
    expect(isSilentHomeLocationRefreshDue(stale, now - 10, now)).toBe(false);
  });

  it('retries a failed attempt once the cooldown has passed', () => {
    expect(
      isSilentHomeLocationRefreshDue(stale, now - HOME_LOCATION_ATTEMPT_COOLDOWN_MS, now),
    ).toBe(true);
  });
});

describe('canAttemptSilentGeolocation', () => {
  it('allows a silent re-read when the OS already granted access', () => {
    expect(canAttemptSilentGeolocation('granted')).toBe(true);
  });

  it('allows a silent attempt when the Permissions API is unknown (Safari)', () => {
    expect(canAttemptSilentGeolocation('unknown')).toBe(true);
  });

  it('never re-prompts after an explicit denial or unresolved prompt', () => {
    expect(canAttemptSilentGeolocation('denied')).toBe(false);
    expect(canAttemptSilentGeolocation('prompt')).toBe(false);
  });
});

describe('distanceMeters / hasMovedSignificantly', () => {
  it('reports ~0 for the same point', () => {
    expect(distanceMeters(48.92, 2.25, 48.92, 2.25)).toBeLessThan(1);
  });

  it('ignores GPS jitter under the move threshold', () => {
    expect(hasMovedSignificantly({ lat: 48.92, lng: 2.25 }, { lat: 48.92, lng: 2.2513 })).toBe(
      false,
    );
  });

  it('flags a real relocation past the move threshold', () => {
    expect(hasMovedSignificantly({ lat: 48.92, lng: 2.25 }, { lat: 48.8566, lng: 2.3522 })).toBe(
      true,
    );
    expect(HOME_LOCATION_MOVE_METERS).toBeGreaterThan(500);
  });
});

describe('home location ever-granted flag', () => {
  it('persists a marker after the athlete saves device position once', () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
    };
    expect(readHomeLocationEverGranted(storage)).toBe(false);
    writeHomeLocationEverGranted(storage);
    expect(readHomeLocationEverGranted(storage)).toBe(true);
  });
});
