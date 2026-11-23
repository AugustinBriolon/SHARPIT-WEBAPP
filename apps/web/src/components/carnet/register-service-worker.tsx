'use client';

import { useEffect } from 'react';

/**
 * Registers the carnet's service worker (ADR-145): what makes it installable and gives it a
 * page to show offline. The worker caches no reading; on its first activation it also drops the
 * caches the old web app's worker left behind (ADR-072).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
  }, []);

  return null;
}
