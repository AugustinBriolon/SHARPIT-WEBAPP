/**
 * How often Today re-reads the device position after the athlete has already
 * granted geolocation once.
 *
 * The first save is explicit ("Utiliser ma position"). After that the city on
 * the morning header must not freeze forever — travel without a travel-context
 * entry would keep showing yesterday's town. Soft refresh is throttled (1h)
 * and attempted silently on Safari when the Permissions API cannot answer.
 * It is checked on load, whenever the page comes back (visibility or window
 * focus) and on a timer while it stays open, so a tab left open does not
 * freeze on the first city either.
 */

/** Soft auto-refresh window when visiting Today with permission already granted. */
export const HOME_LOCATION_REFRESH_MS = 60 * 60 * 1000;

/** How often an open, visible Today checks whether the refresh window has elapsed. */
export const HOME_LOCATION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Minimum gap between two silent attempts. Focus and visibility fire together
 * when a tab comes back, and a failed attempt records no refresh, so without
 * it one return would read the position twice.
 */
export const HOME_LOCATION_ATTEMPT_COOLDOWN_MS = 60 * 1000;

/** Ignore GPS jitter below this distance when deciding whether to persist. */
export const HOME_LOCATION_MOVE_METERS = 2_000;

/**
 * Whether a silent `getCurrentPosition` is allowed without risking a prompt.
 *
 * - `granted` — safe.
 * - `unknown` — Safari often cannot answer `permissions.query`; try silently
 *   (a denial fails the callback without a prompt).
 * - `denied` / `prompt` — do not call; would either fail or re-prompt.
 */
export function canAttemptSilentGeolocation(permission: PermissionState | 'unknown'): boolean {
  return permission === 'granted' || permission === 'unknown';
}

const EARTH_RADIUS_M = 6_371_000;

export function shouldRefreshHomeLocation(
  lastRefreshAtMs: number | null,
  nowMs: number,
  intervalMs = HOME_LOCATION_REFRESH_MS,
): boolean {
  if (lastRefreshAtMs === undefined || lastRefreshAtMs === null) {
    return true;
  }
  return nowMs - lastRefreshAtMs >= intervalMs;
}

/**
 * Whether a silent refresh is due: the refresh window has elapsed and no other
 * attempt started within the cooldown.
 */
export function isSilentHomeLocationRefreshDue(
  lastRefreshAtMs: number | null,
  lastAttemptAtMs: number | null,
  nowMs: number,
): boolean {
  if (!shouldRefreshHomeLocation(lastRefreshAtMs, nowMs)) {
    return false;
  }
  return lastAttemptAtMs === null || nowMs - lastAttemptAtMs >= HOME_LOCATION_ATTEMPT_COOLDOWN_MS;
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function hasMovedSignificantly(
  prev: { lat: number; lng: number },
  next: { lat: number; lng: number },
  minMeters = HOME_LOCATION_MOVE_METERS,
): boolean {
  return distanceMeters(prev.lat, prev.lng, next.lat, next.lng) >= minMeters;
}

export const HOME_LOCATION_REFRESH_STORAGE_KEY = 'sharpit:home-location:last-refresh-ms';

/** Set after a successful device-position save — enables silent refresh on return visits. */
export const HOME_LOCATION_EVER_GRANTED_STORAGE_KEY = 'sharpit:home-location:ever-granted';

export function readHomeLocationEverGranted(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): boolean {
  if (!storage) {
    return false;
  }
  return storage.getItem(HOME_LOCATION_EVER_GRANTED_STORAGE_KEY) === '1';
}

export function writeHomeLocationEverGranted(
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  storage?.setItem(HOME_LOCATION_EVER_GRANTED_STORAGE_KEY, '1');
}

export function readLastHomeLocationRefreshMs(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): number | null {
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(HOME_LOCATION_REFRESH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function writeLastHomeLocationRefreshMs(
  nowMs: number,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  storage?.setItem(HOME_LOCATION_REFRESH_STORAGE_KEY, String(nowMs));
}
