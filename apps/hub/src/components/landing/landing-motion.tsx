'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
    .from('[data-marker]', { left: '0%', duration: 1.6, ease: 'power4.inOut' }, 0.9);

  gsap.to('[data-hero-body]', {
    yPercent: -12,
    autoAlpha: 0.2,
    ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
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

/** Desktop: the method's steps share one pinned stage and hand over as the visitor scrolls. */
function animatePinnedChain() {
  const steps = gsap.utils.toArray<HTMLElement>('[data-chain-step]');
  const labels = gsap.utils.toArray<HTMLElement>('[data-chain-label]');
  const counter = document.querySelector<HTMLElement>('[data-chain-counter]');
  let shown = 0;
  gsap.set(steps.slice(1), { autoAlpha: 0, y: 60 });
  const stage = gsap.timeline({
    scrollTrigger: {
      trigger: '[data-chain]',
      start: 'top top',
      end: `+=${steps.length * 90}%`,
      pin: true,
      scrub: 0.6,
      onUpdate: (self) => {
        const current = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
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
  stage.fromTo(
    '[data-chain-progress]',
    { scaleX: 0 },
    { scaleX: 1, ease: 'none', duration: steps.length },
    0,
  );
  steps.slice(1).forEach((step, i) => {
    stage
      .to(steps[i], { autoAlpha: 0, y: -60, duration: 0.4 }, i + 0.6)
      .to(step, { autoAlpha: 1, y: 0, duration: 0.4 }, i + 0.8);
  });
}

/** Mobile: no pin, each step rises into place. */
function animateStackedChain() {
  gsap.set('[data-chain-progress]', { scaleX: 1 });
  gsap.utils.toArray<HTMLElement>('[data-chain-step]').forEach((step) => {
    gsap.from(step, {
      autoAlpha: 0,
      y: 40,
      duration: 1,
      ease: EASE,
      scrollTrigger: { trigger: step, start: 'top 85%' },
    });
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
  ScrollTrigger.batch('[data-rule]', {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.from(batch, { autoAlpha: 0, y: 12, duration: 0.6, stagger: 0.05, ease: EASE }),
  });
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
  ScrollTrigger.batch('[data-refusal]', {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.from(batch, { autoAlpha: 0, x: -16, duration: 0.7, stagger: 0.08, ease: EASE }),
  });
}

function animateReveals() {
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.from(batch, { autoAlpha: 0, y: 32, duration: 1, stagger: 0.1, ease: EASE }),
  });
}

/**
 * Runs the landing's motion over server-rendered markup (data attributes only). Nothing moves
 * when the visitor asks for reduced motion, and every section is complete without script;
 * every animation is reverted on unmount.
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const media = gsap.matchMedia(scope);
    media.add(
      {
        motion: '(prefers-reduced-motion: no-preference)',
        wide: PIN_BREAKPOINT,
      },
      (context) => {
        const { motion, wide } = context.conditions ?? {};
        if (!motion) {
          return;
        }
        animateScrollProgress();
        animateHero();
        animateManifesto();
        animateContrasts();
        if (wide) {
          animatePinnedChain();
        } else {
          animateStackedChain();
        }
        animateMorning();
        animateGuardrails();
        animateHonesty();
        animateMemory();
        animateRefusals();
        animateReveals();
      },
    );
    return () => media.revert();
  }, []);

  return <div ref={scope}>{children}</div>;
}
