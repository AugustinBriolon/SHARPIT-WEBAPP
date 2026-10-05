'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  HOME_LOCATION_CHECK_INTERVAL_MS,
  canAttemptSilentGeolocation,
  isSilentHomeLocationRefreshDue,
  readHomeLocationEverGranted,
  readLastHomeLocationRefreshMs,
  writeHomeLocationEverGranted,
  writeLastHomeLocationRefreshMs,
} from '@sharpit/app/lib/geocoding/home-location-refresh';
import { invalidateAfterAthleteProfileSave } from '@/client/query/invalidate-after-athlete-profile-save';
import { postAthleteHomeLocation } from '@/client/query/fetchers';
import { beginGeolocationRequest } from '@/components/today/dashboard/use-device-location-helpers';
import type { DeviceLocationState } from '@/components/today/dashboard/use-device-location-types';

export type { DeviceLocationState } from '@/components/today/dashboard/use-device-location-types';

type DeviceLocationContextValue = {
  state: DeviceLocationState;
  ask: (opts?: { silent?: boolean; maximumAge?: number }) => void;
};

const DeviceLocationContext = createContext<DeviceLocationContextValue | null>(null);

async function queryGeolocationPermission(): Promise<PermissionState | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

function useDeviceLocationController(): DeviceLocationContextValue {
  const queryClient = useQueryClient();
  const [state, setState] = useState<DeviceLocationState>('idle');
  const lastSilentAttemptMs = useRef<number | null>(null);

  const persist = useCallback(
    async (latitude: number, longitude: number) => {
      await postAthleteHomeLocation({ latitude, longitude });
      writeLastHomeLocationRefreshMs(Date.now());
      writeHomeLocationEverGranted();
      await invalidateAfterAthleteProfileSave(queryClient);
    },
    [queryClient],
  );

  const ask = useCallback(
    (opts?: { silent?: boolean; maximumAge?: number }) => {
      beginGeolocationRequest(persist, setState, opts);
    },
    [persist],
  );

  const trySilentRefresh = useCallback(async () => {
    const now = Date.now();
    if (
      !isSilentHomeLocationRefreshDue(
        readLastHomeLocationRefreshMs(),
        lastSilentAttemptMs.current,
        now,
      )
    ) {
      return;
    }
    lastSilentAttemptMs.current = now;

    const everGranted = readHomeLocationEverGranted();
    const permission = await queryGeolocationPermission();
    if (!everGranted && !canAttemptSilentGeolocation(permission)) {
      return;
    }
    if (permission === 'denied' || permission === 'prompt') {
      if (!everGranted) {
        return;
      }
    }

    ask({ silent: true, maximumAge: 300_000 });
  }, [ask]);

  useEffect(() => {
    void trySilentRefresh();
  }, [trySilentRefresh]);

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void trySilentRefresh();
    }

    // A tab left open never changes visibility: the timer and window focus
    // keep the city from freezing on the first read.
    const timer = window.setInterval(refreshIfVisible, HOME_LOCATION_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [trySilentRefresh]);

  return { state, ask };
}

export function DeviceLocationProvider({ children }: { children: ReactNode }) {
  const value = useDeviceLocationController();
  return <DeviceLocationContext.Provider value={value}>{children}</DeviceLocationContext.Provider>;
}

/** Shared device location — one permission flow for the whole app session. */
export function useDeviceLocation(): DeviceLocationContextValue {
  const ctx = useContext(DeviceLocationContext);
  if (!ctx) {
    throw new Error('useDeviceLocation must be used within DeviceLocationProvider');
  }
  return ctx;
}
