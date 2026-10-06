'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);

const EASE = 'expo.out';
const PIN_BREAKPOINT = '(min-width: 768px)';
/** Where a section starts playing: its top a little above the bottom of the screen. */
const ON_ENTER = 'top 80%';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function animateScrollProgress() {
  gsap.to('[data-scroll-progress]', {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
  });
}

function animateHero() {
  const intro = gsap.timeline({ defaults: { ease: EASE } });
  intro
    .from('[data-hero-line]', { yPercent: 110, duration: 1.2, stagger: 0.12 })
    .from('[data-hero-fade]', { autoAlpha: 0, y: 24, duration: 1, stagger: 0.08 }, 0.35)
    .from('[data-tick]', { scaleY: 0, duration: 0.6, stagger: 0.012, ease: 'power3.out' }, 0.6)
    // From the ruler's start to its place: a transform, never `left`.
    .from(
      '[data-marker]',
      {
        x: (_, marker: HTMLElement) => -marker.offsetLeft,
        duration: 1.6,
        ease: 'power4.inOut',
      },
      0.9,
    );

  intro
    .from('[data-phone]', { autoAlpha: 0, y: 80, rotate: 2, duration: 1.4 }, 0.2)
    .from('[data-phone-item]', { autoAlpha: 0, y: 16, duration: 0.8, stagger: 0.1 }, 0.8)
    .from('[data-phone-tick]', { scaleY: 0, duration: 0.4, stagger: 0.02, ease: 'power3.out' }, 1.2)
    .from(
      '[data-phone-badge]',
      { autoAlpha: 0, scale: 0.6, duration: 0.6, ease: 'back.out(2)' },
      1.8,
    );

  gsap.to('[data-phone]', {
    yPercent: -10,
    ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
  });

  gsap.to('[data-hero-body]', {
    yPercent: -12,
    autoAlpha: 0.2,
    ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
  });
}

/**
 * Elements entering a few at a time as they scroll into view. Their starting state is set now,
 * not when they arrive: set on arrival, an element already on screen would vanish to enter.
 */
function enterInBatches(
  selector: string,
  offset: { x?: number; y?: number },
  timing: { duration: number; stagger: number },
  start = 'top 90%',
) {
  gsap.set(selector, { autoAlpha: 0, ...offset });
  ScrollTrigger.batch(selector, {
    start,
    once: true,
    // A long batch (a reload far down the page) still lands at once: the stagger is capped.
    onEnter: (batch) =>
      gsap.to(batch, {
        autoAlpha: 1,
        x: 0,
        y: 0,
        ease: EASE,
        duration: timing.duration,
        stagger: Math.min(timing.stagger, 0.5 / batch.length),
      }),
  });
}

/** The manifesto lights up word by word under the reader's scroll. */
function animateManifesto() {
  gsap.fromTo(
    '[data-manifesto] [data-word]',
    { opacity: 0.15 },
    {
      opacity: 1,
      ease: 'none',
      stagger: 0.1,
      scrollTrigger: {
        trigger: '[data-manifesto]',
        start: 'top 75%',
        end: 'bottom 45%',
        scrub: 0.5,
      },
    },
  );
}

/** Each other tool is crossed out, then SharpIt's answer arrives. */
function animateContrasts() {
  gsap.utils.toArray<HTMLElement>('[data-contrast]').forEach((row) => {
    gsap
      .timeline({ scrollTrigger: { trigger: row, start: ON_ENTER } })
      .from(row.querySelector('[data-strike]'), { scaleX: 0, duration: 0.6, ease: 'power3.inOut' })
      .from(
        row.querySelector('[data-contrast-answer]'),
        { autoAlpha: 0, x: -16, duration: 0.9, ease: EASE },
        0.35,
      );
  });
}

/** Plays one method schematic: ticks and bars rise, lines draw, the outcome lands last. */
function diagramTimeline(step: Element, scrollTrigger: ScrollTrigger.Vars) {
  const parts = (selector: string) => Array.from(step.querySelectorAll(selector));
  const timeline = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger });
  const fade = parts('[data-d-fade]');
  const ticks = parts('[data-d-tick]');
  const bars = parts('[data-d-bar]');
  const lines = parts('[data-d-draw]');
  const pops = parts('[data-d-pop]');
  if (fade.length) {
    timeline.from(fade, { autoAlpha: 0, duration: 0.6 }, 0);
  }
  if (ticks.length) {
    timeline.from(ticks, { scaleY: 0, duration: 0.4, stagger: 0.008 }, 0);
  }
  if (bars.length) {
    timeline.from(bars, { scaleY: 0, duration: 0.7, stagger: 0.08 }, 0.1);
  }
  if (lines.length) {
    // DrawSVG measures each stroke; a hand-rolled dash offset is rounded to whole pixels.
    timeline.fromTo(
      lines,
      { drawSVG: '0% 0%' },
      { drawSVG: '0% 100%', duration: 1.1, stagger: 0.08, ease: 'power2.inOut' },
      0.25,
    );
  }
  if (pops.length) {
    timeline.from(
      pops,
      {
        autoAlpha: 0,
        scale: 0.85,
        transformOrigin: '50% 50%',
        duration: 0.6,
        stagger: 0.12,
        ease: 'back.out(2)',
      },
      0.9,
    );
  }
  return timeline;
}

/** Desktop: the section pins and the method's steps travel sideways under the scroll. */
function animateMethodTrack() {
  const track = document.querySelector<HTMLElement>('[data-chain-track]');
  if (!track) {
    return;
  }
  const steps = gsap.utils.toArray<HTMLElement>('[data-chain-step]');
  const labels = gsap.utils.toArray<HTMLElement>('[data-chain-label]');
  const counter = document.querySelector<HTMLElement>('[data-chain-counter]');
  const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
  let shown = 0;
  const travel = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '[data-chain]',
      start: 'top top',
      end: () => `+=${distance()}`,
      pin: true,
      scrub: 0.6,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const current = Math.round(self.progress * (steps.length - 1));
        if (current === shown) {
          return;
        }
        shown = current;
        if (counter) {
          counter.textContent = `${pad(current + 1)} / ${pad(steps.length)}`;
        }
        labels.forEach((label, i) => label.toggleAttribute('data-active', i <= current));
      },
    },
  });
  travel
    .to(track, { x: () => -distance(), duration: 1 }, 0)
    .fromTo('[data-chain-progress]', { scaleX: 0 }, { scaleX: 1, duration: 1 }, 0);
  steps.forEach((step, i) =>
    diagramTimeline(
      step,
      i === 0
        ? { trigger: '[data-chain]', start: 'top 60%' }
        : { trigger: step, containerAnimation: travel, start: 'left 70%' },
    ),
  );
}

/** Mobile: no pin, each step rises into place and plays its schematic. */
function animateStackedMethod() {
  gsap.set('[data-chain-progress]', { scaleX: 1 });
  gsap.utils.toArray<HTMLElement>('[data-chain-step]').forEach((step) => {
    gsap.from(step, {
      autoAlpha: 0,
      y: 40,
      duration: 1,
      ease: EASE,
      scrollTrigger: { trigger: step, start: 'top 85%' },
    });
    diagramTimeline(step, { trigger: step, start: 'top 70%' });
  });
}

/** The morning reading assembles as the app builds it: verdict, evidence, proposal, confidence. */
function animateMorning() {
  gsap
    .timeline({
      defaults: { ease: EASE },
      scrollTrigger: { trigger: '[data-morning-panel]', start: 'top 70%' },
    })
    .from('[data-morning-panel]', { autoAlpha: 0, y: 40, duration: 1 })
    .from('[data-morning-verdict]', { autoAlpha: 0, y: 16, duration: 0.9 }, 0.3)
    .from('[data-morning-line]', { autoAlpha: 0, x: -12, duration: 0.7, stagger: 0.12 }, 0.6)
    .from('[data-morning-strike]', { scaleX: 0, duration: 0.5, ease: 'power3.inOut' }, 1.4)
    .from('[data-morning-swap]', { autoAlpha: 0, x: -8, duration: 0.6 }, 1.7)
    .from('[data-morning-confidence]', { scaleX: 0, duration: 1.2, ease: 'power3.out' }, 1.6)
    // The marker climbs down the ladder from the first domain to the one that limits.
    .from('[data-priority-marker]', { yPercent: -100, duration: 1, ease: 'power3.inOut' }, 1.2);
}

/** The Gate's count runs up to its number of rules, then the rules list in. */
function animateGuardrails() {
  const count = document.querySelector<HTMLElement>('[data-count]');
  if (count) {
    const target = Number(count.dataset.count);
    const value = { n: 0 };
    count.textContent = '0';
    gsap.to(value, {
      n: target,
      duration: 1.6,
      ease: 'power2.out',
      onUpdate: () => {
        count.textContent = String(Math.round(value.n));
      },
      scrollTrigger: { trigger: count, start: ON_ENTER },
    });
  }
  enterInBatches('[data-rule]', { y: 12 }, { duration: 0.6, stagger: 0.05 });
}

/** The confidence scale fills tier by tier; the learning line draws with the scroll. */
function animateHonesty() {
  gsap.from('[data-tier-bar]', {
    scaleX: 0,
    duration: 0.8,
    stagger: 0.15,
    ease: 'power3.out',
    scrollTrigger: { trigger: '[data-tier]', start: ON_ENTER },
  });
  gsap.from('[data-ramp-line]', {
    scaleX: 0,
    ease: 'none',
    scrollTrigger: { trigger: '[data-ramp]', start: 'top 85%', end: 'bottom 55%', scrub: 0.5 },
  });
  gsap.from('[data-ramp-stage]', {
    autoAlpha: 0,
    y: 16,
    duration: 0.8,
    stagger: 0.18,
    ease: EASE,
    scrollTrigger: { trigger: '[data-ramp]', start: ON_ENTER },
  });
}

/** Advised, chosen, what followed: one after the other, joined by the line. */
function animateMemory() {
  gsap
    .timeline({ scrollTrigger: { trigger: '[data-trail]', start: ON_ENTER } })
    .from('[data-trail]', { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.35, ease: EASE })
    .from('[data-trail-line]', { scaleY: 0, duration: 0.5, stagger: 0.35, ease: 'none' }, 0.3);
}

function animateRefusals() {
  enterInBatches('[data-refusal]', { x: -16 }, { duration: 0.7, stagger: 0.08 });
}

function animateReveals() {
  enterInBatches('[data-reveal]', { y: 32 }, { duration: 1, stagger: 0.1 }, 'top 88%');
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
      gsap.matchMedia(scope).add(
        {
          motion: '(prefers-reduced-motion: no-preference)',
          wide: PIN_BREAKPOINT,
        },
        (context) => {
          const { motion, wide } = context.conditions ?? {};
          if (!motion) {
            return;
          }
          // The pin comes before every trigger below it, so each one is measured past its spacer.
          animateScrollProgress();
          animateHero();
          animateManifesto();
          animateContrasts();
          if (wide) {
            animateMethodTrack();
          } else {
            animateStackedMethod();
          }
          animateMorning();
          animateGuardrails();
          animateHonesty();
          animateMemory();
          animateRefusals();
          animateReveals();
          // The brand faces change line heights once they load: measure the triggers again.
          document.fonts.ready.then(() => ScrollTrigger.refresh());
        },
      );
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
