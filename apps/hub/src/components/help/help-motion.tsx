'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const EASE = 'expo.out';

/** The page's opening: the title rises line by line, then what stands around it fades in. */
function animateOpening(scope: HTMLElement) {
  const lines = scope.querySelectorAll('[data-help-line]');
  const fades = scope.querySelectorAll('[data-help-fade]');
  const opening = gsap.timeline({ defaults: { ease: EASE } });
  if (lines.length) {
    opening.from(lines, { yPercent: 110, duration: 1.1, stagger: 0.1 });
  }
  if (fades.length) {
    opening.from(fades, { autoAlpha: 0, y: 20, duration: 0.9, stagger: 0.06 }, 0.25);
  }
}

/**
 * What sits further down enters a few at a time as it scrolls into view. The starting state is
 * set now, not on arrival: set on arrival, an element already on screen would vanish to enter.
 */
function animateReveals(scope: HTMLElement) {
  const reveals = gsap.utils.toArray<HTMLElement>('[data-help-reveal]', scope);
  if (!reveals.length) {
    return;
  }
  gsap.set(reveals, { autoAlpha: 0, y: 24 });
  ScrollTrigger.batch(reveals, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        autoAlpha: 1,
        y: 0,
        ease: EASE,
        duration: 0.9,
        // A long batch (a reload far down the page) still lands at once: the stagger is capped.
        stagger: Math.min(0.08, 0.5 / batch.length),
      }),
  });
}

/**
 * The help centre's motion, in the landing's spirit and over server-rendered markup (data
 * attributes only). Nothing moves under Reduce Motion, every page reads complete without script,
 * and every animation is reverted on unmount. Keyed by page, so each navigation plays it again.
 */
export function HelpMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) {
        return;
      }
      gsap.matchMedia(scope).add('(prefers-reduced-motion: no-preference)', () => {
        animateOpening(root);
        animateReveals(root);
        // The brand faces change line heights once they load: measure the triggers again.
        document.fonts.ready.then(() => ScrollTrigger.refresh());
      });
      // Every element now stands in its starting state: the content can show (globals.css).
      root.setAttribute('data-motion-ready', '');
    },
    { scope },
  );

  return (
    <div ref={scope} data-help-motion>
      {children}
    </div>
  );
}
