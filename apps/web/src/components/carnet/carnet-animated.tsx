'use client';

import { createContext, type ReactNode, useContext, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { animate } from 'motion/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { type CountableText, formatCountable, parseCountable } from './carnet-count';
import { hasSettled, prefersReducedMotion } from './carnet-motion';
import { headingBetween } from './carnet-pages';

gsap.registerPlugin(ScrollTrigger);

/**
 * A figure's number, counting to its value when a navigation brings it in and from the
 * last value when the day changes under it (the app's figures move between days). Never
 * on the first paint: the server already drew the value there. Reduce Motion: no count.
 */
export function CarnetCount({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const shape: CountableText | null = parseCountable(text);
    if (!element || !shape) {
      return;
    }
    const from = shown.current ?? (hasSettled() ? 0 : shape.value);
    shown.current = shape.value;
    if (from === shape.value || prefersReducedMotion()) {
      element.textContent = text;
      return;
    }
    const state = { value: from };
    element.textContent = formatCountable(shape, from);
    const tween = gsap.to(state, {
      value: shape.value,
      duration: 0.6,
      ease: 'power3.out',
      onUpdate: () => {
        element.textContent = formatCountable(shape, state.value);
      },
      onComplete: () => {
        element.textContent = text;
      },
    });
    return () => {
      // Interrupted (a new value, or React running the effect again): the next count
      // starts from where this one got to.
      shown.current = tween.progress() < 1 ? state.value : shape.value;
      tween.kill();
    };
  }, [text]);

  return <span ref={ref}>{text}</span>;
}

const HeadingContext = createContext<-1 | 0 | 1>(0);

/**
 * Holds which way the reader headed on the last navigation, for the page that arrives. It
 * sits in the layout, which outlives every page, so a page brought back from Next's cache
 * reads the heading of this navigation rather than the one it was first drawn with.
 */
export function CarnetHeading({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  const heading = useRef<-1 | 0 | 1>(0);
  if (previous.current !== pathname) {
    heading.current = headingBetween(previous.current, pathname);
    previous.current = pathname;
  }
  return <HeadingContext value={heading.current}>{children}</HeadingContext>;
}

/**
 * A page arriving: it slides in from the side the reader is heading along the row of
 * pages, as the app's onboarding steps do, and rises when it opens one level deeper (a
 * session from the list). Then its sections below the fold rise in as they scroll into
 * view, a few at a time (GSAP ScrollTrigger, capped stagger like `SharpitMotion`).
 */
export function CarnetPageTransition({
  children,
  nested = false,
}: {
  children: ReactNode;
  /** Under another transition: only moves when the reader goes deeper, never across pages. */
  nested?: boolean;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const direction = useContext(HeadingContext);
  const heading = useRef(direction);
  heading.current = direction;

  // The arrival runs in an effect, not as Motion's `initial`: Next brings a page seen before
  // back from its cache without mounting it again, and only effects run again then.
  useLayoutEffect(() => {
    const root = ref.current;
    const toward = heading.current;
    if (!root || !hasSettled() || (nested && toward !== 0)) {
      return;
    }
    const still = prefersReducedMotion();
    const controls = animate(
      root,
      still
        ? { opacity: [0, 1] }
        : { opacity: [0, 1], x: [toward * 16, 0], y: [toward === 0 ? 8 : 0, 0] },
      { duration: still ? 0.14 : 0.22, ease: [0.22, 1, 0.36, 1] },
    );
    return () => controls.complete();
  }, [pathname, nested]);

  useLayoutEffect(() => {
    const root = ref.current;
    // Not on the first paint: the server drew those sections, and React is still hydrating them.
    if (!root || !hasSettled() || prefersReducedMotion()) {
      return;
    }
    const context = gsap.context(() => {
      const below = gsap.utils.toArray<HTMLElement>('[data-reveal]', root).filter(
        // Below the fold, and not already armed by a transition around this one.
        (element) =>
          element.dataset.revealArmed === undefined &&
          element.getBoundingClientRect().top > window.innerHeight,
      );
      if (below.length === 0) {
        return;
      }
      below.forEach((element) => {
        element.dataset.revealArmed = '';
      });
      gsap.set(below, { autoAlpha: 0, y: 24 });
      ScrollTrigger.batch(below, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            autoAlpha: 1,
            y: 0,
            duration: 0.45,
            ease: 'power3.out',
            stagger: { each: 0.06, amount: 0.24 },
            overwrite: true,
          }),
      });
    }, root);
    return () => {
      context.revert();
      root.querySelectorAll<HTMLElement>('[data-reveal-armed]').forEach((element) => {
        delete element.dataset.revealArmed;
      });
    };
  }, [pathname]);

  return (
    <div data-heading={direction} ref={ref}>
      {children}
    </div>
  );
}
