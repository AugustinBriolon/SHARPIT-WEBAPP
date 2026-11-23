'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);

/*
 * One motion language for the page. Two curves: `OUT` for what arrives, `IN_OUT` for what
 * travels. Three durations, one entrance distance, one direction (up). No overshoot, no pin, no
 * parallax, no scroll-scrubbed text: each widget plays once as it enters the view, and what moves
 * says a quantity filled, a line was drawn or a decision landed.
 */
const OUT = 'power3.out';
const IN_OUT = 'power2.inOut';
const FAST = 0.4;
const BASE = 0.6;
const SLOW = 0.9;
/** How far an entering element rises, in pixels. */
const RISE = 16;
/** Where a widget starts playing: its top a little above the bottom of the screen. */
const ON_ENTER = 'top 80%';

function animateHero() {
  gsap
    .timeline({ defaults: { ease: OUT } })
    .from('[data-hero-line]', { yPercent: 110, duration: SLOW, stagger: 0.08 })
    .from('[data-hero-fade]', { autoAlpha: 0, y: RISE, duration: BASE, stagger: 0.06 }, 0.25)
    .from('[data-phone]', { autoAlpha: 0, y: RISE * 2, duration: SLOW }, 0.3);
}

/**
 * Cards and headings entering a few at a time. Their starting state is set now, not on arrival:
 * set on arrival, an element already on screen would vanish to enter.
 */
function animateReveals() {
  gsap.set('[data-reveal]', { autoAlpha: 0, y: RISE });
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        autoAlpha: 1,
        y: 0,
        ease: OUT,
        duration: BASE,
        // A long batch (a reload far down the page) still lands at once: the stagger is capped.
        stagger: Math.min(0.08, 0.3 / batch.length),
      }),
  });
}

/** Plays one schematic: ticks and bars rise, lines draw, the outcome lands last. */
function animateDiagram(diagram: Element) {
  const parts = (selector: string) => Array.from(diagram.querySelectorAll(selector));
  const timeline = gsap.timeline({
    defaults: { ease: OUT },
    scrollTrigger: { trigger: diagram, start: ON_ENTER },
  });
  const from = (selector: string, vars: gsap.TweenVars, at: number) => {
    const targets = parts(selector);
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

/** The morning reading assembles as the app builds it: verdict, evidence, session, confidence. */
function animateMorning() {
  gsap
    .timeline({
      defaults: { ease: OUT },
      scrollTrigger: { trigger: '[data-morning]', start: ON_ENTER },
    })
    .from('[data-morning-verdict]', { autoAlpha: 0, y: 8, duration: FAST }, 0.15)
    .from('[data-morning-line]', { autoAlpha: 0, y: 8, duration: FAST, stagger: 0.08 }, 0.3)
    .from('[data-morning-session]', { autoAlpha: 0, y: 8, duration: FAST }, 0.7)
    .from('[data-morning-actions]', { autoAlpha: 0, y: 8, duration: FAST }, 0.9);
}

/** A bar fills to its value, a count runs up to its number, its ticks rise with it. */
function animateQuantities() {
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
    const trigger = { trigger: count, start: ON_ENTER };
    gsap.to(value, {
      n: Number(count.dataset.count),
      duration: SLOW,
      ease: OUT,
      onUpdate: () => {
        count.textContent = String(Math.round(value.n));
      },
      scrollTrigger: trigger,
    });
    gsap.from('[data-count-tick]', {
      scaleY: 0,
      duration: FAST,
      stagger: 0.04,
      ease: OUT,
      scrollTrigger: trigger,
    });
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
      gsap.matchMedia(scope).add('(prefers-reduced-motion: no-preference)', () => {
        animateHero();
        animateReveals();
        gsap.utils.toArray<Element>('[data-diagram]').forEach(animateDiagram);
        animateMorning();
        animateQuantities();
        // The brand faces change line heights once they load: measure the triggers again.
        document.fonts.ready.then(() => ScrollTrigger.refresh());
      });
      // Every element now stands in its starting state: the content can show (globals.css).
      scope.current?.setAttribute('data-motion-ready', '');
    },
    { scope },
  );

  return (
    <div ref={scope} data-landing-motion>
      {children}
    </div>
  );
}
