'use client';

import { type ReactNode, useEffect } from 'react';
import { MotionConfig } from 'motion/react';

let settled = false;

/**
 * Whether the page has finished its first paint. A figure shown by the server is already
 * on screen when the page hydrates, so it never counts up then — only when a navigation
 * brings it in, as the app does when a new day arrives.
 */
export function hasSettled(): boolean {
  return settled;
}

/**
 * One motion setting for the whole site: everything Motion animates follows the reader's
 * Reduce Motion, and settles with the app's spring (iOS `SharpitMotion.reveal`).
 */
export function CarnetMotion({ children }: { children: ReactNode }) {
  useEffect(() => {
    settled = true;
  }, []);

  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
      {children}
    </MotionConfig>
  );
}

/** Reduce Motion, read where Motion's own setting cannot reach (GSAP, Recharts). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
