'use client';

import { useEffect } from 'react';

/**
 * The old web app installed a service worker that cached its pages. The carnet has none
 * (ADR-072): on the first visit after the switch-over, unregister it and drop its caches
 * so nothing stale is ever served again. `public/sw.js` does the same from the worker's
 * side, for a browser that checks for an update before this runs.
 */
export function RetireServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
    if ('caches' in window) {
      void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    }
  }, []);

  return null;
}
