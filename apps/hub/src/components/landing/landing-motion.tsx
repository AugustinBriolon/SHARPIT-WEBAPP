'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);

/*
 * One motion language for the page (ADR-147). Two curves: `OUT` for what arrives, `IN_OUT` for
 * what travels. Entrances play once; what is tied to the scroll (the hero's depth, the statement,
 * the track, the closing block) is scrubbed, so it never runs ahead of the reader's hand. No
 * overshoot. Under Reduce Motion nothing here runs and the page reads as it was rendered.
 */
const OUT = 'power3.out';
const IN_OUT = 'power2.inOut';
const FAST = 0.4;
const BASE = 0.7;
const SLOW = 1.1;
/** How far an entering element rises, in pixels. */
const RISE = 28;
/** Where an element starts playing: its top a little above the bottom of the screen. */
const ON_ENTER = 'top 82%';
const WIDE = '(min-width: 768px)';

/** The opening: the field of daylight opens, the promise rises line by line, the phone lands. */
function playHeroEntrance() {
  gsap
    .timeline({ defaults: { ease: OUT } })
    .from('[data-hero-field]', { scale: 0.92, autoAlpha: 0, duration: SLOW })
    .from('[data-hero] [data-line]', { yPercent: 115, duration: SLOW, stagger: 0.1 }, 0.25)
    .from('[data-hero-fade]', { autoAlpha: 0, y: RISE, duration: BASE, stagger: 0.1 }, 0.6)
    .from('[data-hero-device]', { y: 220, scale: 0.9, autoAlpha: 0, duration: 1.4 }, 0.45)
    .from('[data-chip]', { autoAlpha: 0, scale: 0.85, y: 40, duration: BASE, stagger: 0.12 }, 1.1)
    .from('[data-nav]', { y: -90, autoAlpha: 0, duration: BASE }, 0.9);
}

/** Leaving the hero: the copy lifts away, the phone and each chip move at their own depth. */
function scrubHeroDepth() {
  const scrollTrigger = { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 0.6 };
  gsap.to('[data-hero-copy]', { yPercent: -35, autoAlpha: 0, ease: 'none', scrollTrigger });
  gsap.to('[data-hero-device] figure', { y: -110, ease: 'none', scrollTrigger });
  gsap.utils.toArray<HTMLElement>('[data-chip]').forEach((chip) => {
    gsap.to(chip, { y: -180 * Number(chip.dataset.depth), ease: 'none', scrollTrigger });
  });
}

/** A headline outside the hero rises from behind its mask as it enters. */
function revealLines() {
  gsap.utils
    .toArray<HTMLElement>('[data-line]')
    .filter((line) => !line.closest('[data-hero]'))
    .forEach((line) => {
      gsap.from(line, {
        yPercent: 115,
        duration: SLOW,
        ease: OUT,
        scrollTrigger: { trigger: line.parentElement, start: ON_ENTER },
      });
    });
}

/** What sits under a headline rises after it, one item after the other. */
function riseGroups() {
  gsap.utils.toArray<HTMLElement>('[data-rise-group]').forEach((group) => {
    gsap.from(group.querySelectorAll('[data-rise]'), {
      autoAlpha: 0,
      y: RISE,
      duration: BASE,
      ease: OUT,
      stagger: 0.07,
      scrollTrigger: { trigger: group, start: ON_ENTER },
    });
  });
  gsap.utils
    .toArray<HTMLElement>('[data-rise]')
    .filter((element) => !element.closest('[data-rise-group]'))
    .forEach((element) => {
      gsap.from(element, {
        autoAlpha: 0,
        y: RISE,
        duration: BASE,
        ease: OUT,
        scrollTrigger: { trigger: element, start: ON_ENTER },
      });
    });
}

/** The statement comes to ink word by word, under the reader's scroll. */
function scrubStatement() {
  gsap.fromTo(
    '[data-word]',
    { opacity: 0.14 },
    {
      opacity: 1,
      ease: 'none',
      stagger: 0.5,
      scrollTrigger: {
        trigger: '[data-statement]',
        start: 'top 80%',
        end: 'bottom 45%',
        scrub: 0.4,
      },
    },
  );
}

/** Plays one schematic: ticks and bars rise, lines draw, the outcome lands last. */
function playDiagram(diagram: Element, scrollTrigger: ScrollTrigger.Vars) {
  const timeline = gsap.timeline({ defaults: { ease: OUT }, scrollTrigger });
  const from = (selector: string, vars: gsap.TweenVars, at: number) => {
    const targets = Array.from(diagram.querySelectorAll(selector));
    if (targets.length) {
      timeline.from(targets, vars, at);
    }
  };
  from('[data-d-fade]', { autoAlpha: 0, duration: FAST }, 0);
  from('[data-d-tick]', { scaleY: 0, duration: FAST, stagger: 0.006 }, 0);
  from('[data-d-bar]', { scaleY: 0, duration: BASE, stagger: 0.05 }, 0.1);
  // DrawSVG measures each stroke; a hand-rolled dash offset is rounded to whole pixels.
  from('[data-d-draw]', { drawSVG: '0% 0%', duration: SLOW, stagger: 0.06, ease: IN_OUT }, 0.2);
  from(
    '[data-d-pop]',
    { autoAlpha: 0, scale: 0.96, transformOrigin: '50% 50%', duration: FAST, stagger: 0.06 },
    0.7,
  );
}

/** Cards outside the track rise and settle to size, a few at a time, then play their widget. */
function riseCards(inTrack: (element: Element) => boolean) {
  const cards = gsap.utils.toArray<HTMLElement>('[data-card]').filter((card) => !inTrack(card));
  gsap.set(cards, { autoAlpha: 0, y: RISE * 2, scale: 0.97 });
  ScrollTrigger.batch(cards, {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: SLOW,
        ease: OUT,
        // A long batch (a reload far down the page) still lands at once: the stagger is capped.
        stagger: Math.min(0.12, 0.36 / batch.length),
      }),
  });
  gsap.utils
    .toArray<Element>('[data-diagram]')
    .filter((diagram) => !inTrack(diagram))
    .forEach((diagram) => playDiagram(diagram, { trigger: diagram, start: ON_ENTER }));
}

/** Wide screens: the section holds still and its panels travel sideways under the scroll. */
function pinTrack() {
  const section = document.querySelector<HTMLElement>('[data-track-section]');
  const track = section?.querySelector<HTMLElement>('[data-track]');
  if (!section || !track) {
    return;
  }
  const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
  const travel = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${distance()}`,
      pin: true,
      scrub: 0.5,
      invalidateOnRefresh: true,
    },
  });
  track
    .querySelectorAll('[data-diagram]')
    .forEach((diagram, index) =>
      playDiagram(
        diagram,
        index === 0
          ? { trigger: section, start: 'top 55%' }
          : { trigger: diagram, containerAnimation: travel, start: 'left 75%' },
      ),
    );
}

/** Narrow screens: the panels stack, each rising and playing as it enters. */
function stackTrack() {
  gsap.utils.toArray<HTMLElement>('[data-track] [data-card]').forEach((card) => {
    gsap.from(card, {
      autoAlpha: 0,
      y: RISE * 2,
      duration: SLOW,
      ease: OUT,
      scrollTrigger: { trigger: card, start: 'top 88%' },
    });
    card
      .querySelectorAll('[data-diagram]')
      .forEach((diagram) => playDiagram(diagram, { trigger: diagram, start: ON_ENTER }));
  });
}

/** The morning reading assembles as the app builds it: verdict, evidence, session, the choice. */
function playMorning() {
  gsap
    .timeline({
      defaults: { ease: OUT },
      scrollTrigger: { trigger: '[data-morning]', start: 'top 72%' },
    })
    .from('[data-morning-verdict]', { autoAlpha: 0, y: 12, duration: BASE }, 0.3)
    .from('[data-morning-line]', { autoAlpha: 0, y: 12, duration: FAST, stagger: 0.1 }, 0.55)
    .from('[data-morning-session]', { autoAlpha: 0, y: 12, duration: FAST }, 1)
    .from('[data-morning-actions]', { autoAlpha: 0, y: 12, duration: FAST }, 1.2);
}

/** A bar fills to its value, a count runs up to its number, a ring draws to its share. */
function playQuantities() {
  gsap.utils.toArray<HTMLElement>('[data-fill]').forEach((fill) => {
    gsap.from(fill, {
      scaleX: 0,
      duration: SLOW,
      ease: OUT,
      scrollTrigger: { trigger: fill, start: ON_ENTER },
    });
  });
  gsap.utils.toArray<HTMLElement>('[data-count]').forEach((count) => {
    const value = { n: 0 };
    const scrollTrigger = { trigger: count, start: ON_ENTER };
    gsap.to(value, {
      n: Number(count.dataset.count),
      duration: SLOW,
      ease: OUT,
      onUpdate: () => {
        count.textContent = String(Math.round(value.n));
      },
      scrollTrigger,
    });
    gsap.from('[data-count-tick]', {
      scaleY: 0,
      duration: FAST,
      stagger: 0.04,
      ease: OUT,
      scrollTrigger,
    });
  });
  gsap.utils.toArray<SVGElement>('[data-d-ring]').forEach((ring, index) => {
    gsap.from(ring, {
      drawSVG: '0% 0%',
      duration: SLOW,
      ease: IN_OUT,
      delay: index * 0.12,
      scrollTrigger: { trigger: ring, start: ON_ENTER },
    });
  });
}

/** The closing block grows from an inset card to the page's width as it arrives. */
function scrubClosing() {
  gsap.from('[data-closing]', {
    scale: 0.88,
    ease: 'none',
    scrollTrigger: { trigger: '[data-closing]', start: 'top bottom', end: 'top 25%', scrub: 0.5 },
  });
}

/**
 * Runs the landing's motion over server-rendered markup (data attributes only). Nothing moves
 * when the visitor asks for reduced motion, and every section is complete without script;
 * every animation is reverted on unmount.
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap
        .matchMedia(scope)
        .add({ motion: '(prefers-reduced-motion: no-preference)', wide: WIDE }, (context) => {
          const { motion, wide } = context.conditions ?? {};
          if (!motion) {
            return;
          }
          const inTrack = (element: Element) => element.closest('[data-track]') !== null;
          playHeroEntrance();
          scrubHeroDepth();
          revealLines();
          riseGroups();
          scrubStatement();
          playMorning();
          if (wide) {
            pinTrack();
          } else {
            stackTrack();
          }
          riseCards(inTrack);
          playQuantities();
          scrubClosing();
          // Triggers were made by kind, not from the top of the page down: put them in page
          // order, so the ones above the pinned track are not measured past its spacer.
          ScrollTrigger.sort();
          ScrollTrigger.refresh();
          // The faces change line heights once they load: measure the triggers again.
          document.fonts.ready.then(() => ScrollTrigger.refresh());
        });
      // Every element now stands in its starting state: the content can show (globals.css).
      scope.current?.setAttribute('data-motion-ready', '');
    },
    { scope },
  );

  return (
    <div ref={scope} className="landing-style min-h-screen" data-landing-motion>
      {children}
    </div>
  );
}
