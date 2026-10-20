'use client';

import { createContext, type ReactNode, useContext, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { animate } from 'motion/react';
import { motionTokens, springs } from '@/client/motion/tokens';
import { type CountableText, formatCountable, parseCountable } from './carnet-count';
import { hasSettled, prefersReducedMotion } from './carnet-motion';
import { headingBetween } from './carnet-pages';

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
    let currentVal = from;
    element.textContent = formatCountable(shape, from);
    const controls = animate(from, shape.value, {
      duration: 0.6,
      ease: motionTokens.easing.smooth,
      onUpdate: (latest) => {
        currentVal = latest;
        element.textContent = formatCountable(shape, latest);
      },
      onComplete: () => {
        element.textContent = text;
      },
    });
    return () => {
      // Interrupted (a new value, or React running the effect again): the next count
      // starts from where this one got to.
      shown.current = currentVal;
      controls.stop();
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
 * view, a few at a time (IntersectionObserver + motion, capped stagger like `SharpitMotion`).
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
      still
        ? { duration: motionTokens.duration.fast, ease: motionTokens.easing.smooth }
        : springs.snappy,
    );
    return () => {
      controls.stop();
    };
  }, [pathname, nested]);

  useLayoutEffect(() => {
    const root = ref.current;
    // Not on the first paint: the server drew those sections, and React is still hydrating them.
    if (!root || !hasSettled() || prefersReducedMotion()) {
      return;
    }

    const below = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]')).filter(
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
      element.style.opacity = '0';
      element.style.transform = 'translateY(24px)';
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            observer.unobserve(el);
            animate(
              el,
              { opacity: [0, 1], y: [24, 0] },
              {
                duration: motionTokens.duration.slow,
                ease: motionTokens.easing.smooth,
                delay: Math.min(index * 0.06, 0.24),
              },
            );
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px' },
    );

    below.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      root.querySelectorAll<HTMLElement>('[data-reveal-armed]').forEach((element) => {
        delete element.dataset.revealArmed;
      });
    };
  }, [pathname]);

  return (
    <div ref={ref} data-heading={direction}>
      {children}
    </div>
  );
}
