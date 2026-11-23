import type { ReactNode } from 'react';
import Image, { type StaticImageData } from 'next/image';
import { Plus } from 'lucide-react';
import {
  LANDING_CLOSING,
  LANDING_CONFIDENCE_STEPS,
  LANDING_FAQ,
  LANDING_GATE_RULE_COUNT,
  LANDING_HERO,
  LANDING_MODEL,
  LANDING_MORNING,
  LANDING_PLAN,
  LANDING_PRICING,
  LANDING_SOURCES,
  LANDING_STATEMENT,
  type LandingCard,
} from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { DIAGRAMS } from './landing-diagrams';
import { ConfidenceBar, MorningWidget } from './landing-morning';
import { Phone } from './landing-phone';
// The integrations' marks live once, with the web app that lists them in Connexions.
import appleHealth from '../../../../web/public/images/applehealth.svg';
import garmin from '../../../../web/public/images/garmin.png';
import googleCalendar from '../../../../web/public/images/googleagenda.png';
import strava from '../../../../web/public/images/strava.png';
import withings from '../../../../web/public/images/withings.png';

const SOURCE_LOGOS: Record<(typeof LANDING_SOURCES.connected)[number], StaticImageData> = {
  Garmin: garmin,
  Strava: strava,
  'Apple Santé': appleHealth,
  Withings: withings,
  'Google Agenda': googleCalendar,
};

/* The guide's type roles (LANDING_STYLE.md): weight 600, -0.03em, one line of leading. */
const TIGHT = 'font-semibold tracking-[-0.03em] leading-none text-balance';
// The size comes first: merged after it, a size class would drop the leading.
const HERO_DISPLAY = cn('text-[clamp(2.75rem,7.6vw,5rem)]', TIGHT);
const DISPLAY = cn('text-[clamp(2.25rem,6vw,4rem)]', TIGHT);
const CARD_HEADING = cn('text-[clamp(1.625rem,3.1vw,2.5rem)]', TIGHT);
const BODY = 'text-muted-foreground text-[clamp(1.0625rem,1.9vw,1.5rem)] leading-[1.3] text-pretty';
const SECTION_LABEL = 'text-2xl leading-[0.9] font-semibold tracking-[-0.01em]';

const WRAP = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8';
const SECTION = 'py-20 sm:py-24';
const CLOUD_CARD = 'bg-card rounded-[32px] p-6 sm:p-8';

/** The one conversion control: a short charcoal capsule. */
export function DownloadPill({ className }: { className?: string }) {
  return (
    <a
      href={LANDING_HERO.download.href}
      className={cn(
        'bg-primary text-primary-foreground focus-visible:ring-ring inline-flex h-11 items-center rounded-full px-5 text-base font-medium transition-transform duration-200 ease-out hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none',
        className,
      )}
    >
      {LANDING_HERO.download.label}
    </a>
  );
}

/** A line of a headline behind a mask, so it can rise into place. */
function Line({ children }: { children: ReactNode }) {
  return (
    <span className="block overflow-hidden pb-[0.14em]">
      <span className="block" data-line>
        {children}
      </span>
    </span>
  );
}

/** A small product fact floating beside the phone, at its own depth. */
function Chip({
  depth,
  className,
  children,
}: {
  depth: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-depth={depth}
      className={cn(
        'bg-background float-lift absolute hidden rounded-3xl px-5 py-4 text-left lg:block',
        className,
      )}
      aria-hidden
      data-chip
    >
      {children}
    </div>
  );
}

function HeroChips() {
  const { example } = LANDING_MORNING;
  return (
    <>
      <Chip className="top-16 -left-64 w-60" depth={0.6}>
        <p className="text-muted-foreground text-xs">{example.sessionLabel}</p>
        <p className="mt-1.5 text-base leading-snug font-medium">{example.proposed}</p>
        <p className="text-muted-foreground mt-1 text-xs line-through">{example.planned}</p>
      </Chip>
      <Chip className="top-56 -right-60 w-56" depth={1}>
        <p className="text-muted-foreground text-xs">{example.confidenceLabel}</p>
        <p className="mt-1.5 text-2xl leading-none font-semibold tracking-[-0.03em]">
          {example.confidenceValue.toLocaleString('fr')}
        </p>
        <ConfidenceBar className="bg-card mt-3" value={example.confidenceValue} />
      </Chip>
      <Chip className="top-96 -left-52 w-48" depth={1.4}>
        <p className="text-2xl leading-none font-semibold tracking-[-0.03em]">
          {LANDING_GATE_RULE_COUNT} / {LANDING_GATE_RULE_COUNT}
        </p>
        <p className="text-muted-foreground mt-1.5 text-xs">{LANDING_MODEL.gate.title}</p>
      </Chip>
    </>
  );
}

/**
 * The opening screen: a tall rounded field of daylight that holds the promise and the app. The
 * field contains the composition; the phone runs off its foot.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="p-2 sm:p-3" data-hero>
      <div
        className="hero-sky relative flex min-h-[calc(100svh-1rem)] flex-col items-center overflow-hidden rounded-[32px] px-5 pt-32 text-center sm:min-h-[calc(100svh-1.5rem)] sm:pt-40"
        data-hero-field
      >
        <div data-hero-copy>
          <h1 className={HERO_DISPLAY} id="hero-title">
            {LANDING_HERO.titleLines.map((line) => (
              <Line key={line}>{line}</Line>
            ))}
          </h1>
          <p className={cn(BODY, 'mx-auto mt-6 max-w-2xl')} data-hero-fade>
            {LANDING_HERO.body}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3" data-hero-fade>
            <DownloadPill />
            <p className="text-muted-foreground text-xs">{LANDING_HERO.downloadNote}</p>
          </div>
        </div>
        <div className="relative mt-14 -mb-32" data-hero-device>
          <HeroChips />
          <Phone />
        </div>
      </div>
    </section>
  );
}

/** The compatibility proof: one row of marks, no cards. */
export function Sources() {
  return (
    <section aria-labelledby="sources-title" className={SECTION}>
      <div className={cn(WRAP, 'text-center')} data-rise-group>
        <h2 className={SECTION_LABEL} id="sources-title" data-rise>
          {LANDING_SOURCES.title}
        </h2>
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {LANDING_SOURCES.connected.map((name) => (
            <li key={name} className="flex items-center gap-3 text-lg font-medium" data-rise>
              <Image
                alt=""
                className="size-9 rounded-lg object-contain"
                sizes="36px"
                src={SOURCE_LOGOS[name]}
              />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The problem, said once and large: each word comes to ink as the reader scrolls through it. */
export function Statement() {
  return (
    <section aria-label={LANDING_STATEMENT} className="py-24 sm:py-40">
      <p className={cn(WRAP, DISPLAY, 'max-w-[1000px] text-center leading-[1.08]')} data-statement>
        {LANDING_STATEMENT.split(' ').map((word, index) => (
          <span key={`${index}-${word}`} data-word>
            {word}{' '}
          </span>
        ))}
      </p>
    </section>
  );
}

function SectionIntro({ id, title, lead }: { id: string; title: string; lead: string }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16" data-rise-group>
      <h2 className={DISPLAY} id={id}>
        <Line>{title}</Line>
      </h2>
      <p className={cn(BODY, 'mt-5')} data-rise>
        {lead}
      </p>
    </div>
  );
}

/** A feature card on the cloud surface: the widget, then its name and one sentence. */
function FeatureCard({
  card,
  className,
  children,
}: {
  card: LandingCard;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(CLOUD_CARD, 'flex flex-col justify-between gap-10', className)}
      data-card
    >
      {children}
      <div>
        <h3 className={CARD_HEADING}>{card.title}</h3>
        <p className={cn(BODY, 'mt-3')}>{card.body}</p>
      </div>
    </article>
  );
}

export function Morning() {
  return (
    <section aria-labelledby="morning-title" className={SECTION}>
      <div className={WRAP}>
        <SectionIntro
          id="morning-title"
          lead={LANDING_MORNING.lead}
          title={LANDING_MORNING.title}
        />
        <div className="grid gap-4 lg:grid-cols-5">
          <article className={cn(CLOUD_CARD, 'lg:col-span-3')} data-card>
            <MorningWidget />
          </article>
          <FeatureCard card={LANDING_MORNING.arbitrate} className="lg:col-span-2">
            <DIAGRAMS.Arbitrate />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

const PLAN_PANELS = [
  { card: LANDING_PLAN.programme, Diagram: DIAGRAMS.Programme },
  { card: LANDING_PLAN.repair, Diagram: DIAGRAMS.Repair },
  { card: LANDING_MODEL.observe, Diagram: DIAGRAMS.Observe },
  { card: LANDING_MODEL.compare, Diagram: DIAGRAMS.Compare },
] as const;

/**
 * The plan and the model behind it, as panels on one track. On a wide screen the section holds
 * still and the track travels sideways under the scroll; on a narrow one the panels stack.
 */
export function Plan() {
  return (
    <section aria-labelledby="plan-title" className="overflow-hidden" data-track-section>
      <div className={cn(SECTION, 'md:flex md:min-h-svh md:flex-col md:justify-center')}>
        <div className={WRAP}>
          <SectionIntro id="plan-title" lead={LANDING_PLAN.lead} title={LANDING_PLAN.title} />
        </div>
        <div
          className="flex flex-col gap-4 px-5 sm:px-8 md:w-max md:flex-row md:pr-[20vw] md:pl-[max(2rem,calc((100vw-1200px)/2+2rem))]"
          data-track
        >
          {PLAN_PANELS.map(({ card, Diagram }) => (
            <FeatureCard
              key={card.title}
              card={card}
              className="md:w-[min(640px,62vw)] md:shrink-0"
            >
              <Diagram />
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The Gate's count, and one tick per rule. */
function GateCount() {
  return (
    <div>
      <p className={cn('text-8xl tabular-nums', TIGHT)} data-count={LANDING_GATE_RULE_COUNT}>
        {LANDING_GATE_RULE_COUNT}
      </p>
      <div className="mt-6 flex gap-1.5" aria-hidden>
        {Array.from({ length: LANDING_GATE_RULE_COUNT }, (_, i) => (
          <span
            key={i}
            className="bg-foreground h-6 w-1 origin-bottom rounded-full"
            data-count-tick
          />
        ))}
      </div>
    </div>
  );
}

/** The confidence scale and the three ways advice is given along it. */
function ConfidenceScale() {
  const { example } = LANDING_MORNING;
  return (
    <div>
      <p className={cn('text-8xl tabular-nums', TIGHT)}>
        {example.confidenceValue.toLocaleString('fr')}
      </p>
      <ConfidenceBar className="mt-6" value={example.confidenceValue} />
      <ol className="text-muted-foreground mt-2.5 flex justify-between gap-3 text-xs">
        {LANDING_CONFIDENCE_STEPS.map((step) => (
          <li key={step.label}>{step.label}</li>
        ))}
      </ol>
    </div>
  );
}

/** The three rings of the app's readings, in the data hues the guide keeps for visuals. */
function ConsentRings() {
  const rings = ['var(--metric-blue)', 'var(--recovery-green)', 'var(--sleep-lilac)'];
  return (
    <div className="flex gap-3" aria-hidden>
      {rings.map((stroke, index) => (
        <svg key={stroke} className="size-20 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" fill="none" r="42" stroke="var(--paper)" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            fill="none"
            r="42"
            stroke={stroke}
            strokeDasharray={`${170 + index * 34} 264`}
            strokeLinecap="round"
            strokeWidth="9"
            data-d-ring
          />
        </svg>
      ))}
    </div>
  );
}

export function Model() {
  return (
    <section aria-labelledby="model-title" className={SECTION}>
      <div className={WRAP}>
        <SectionIntro id="model-title" lead={LANDING_MODEL.lead} title={LANDING_MODEL.title} />
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard card={LANDING_MODEL.gate}>
            <GateCount />
          </FeatureCard>
          <FeatureCard card={LANDING_MODEL.honesty}>
            <ConfidenceScale />
          </FeatureCard>
          <FeatureCard card={LANDING_MODEL.consent}>
            <ConsentRings />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section aria-labelledby="pricing-title" className={SECTION}>
      <div className={WRAP}>
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <h2 className={DISPLAY} id="pricing-title">
            <Line>{LANDING_PRICING.title}</Line>
          </h2>
        </div>
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          {LANDING_PRICING.tiers.map((tier) => (
            <article key={tier.name} className={cn(CLOUD_CARD, 'flex flex-col gap-4')} data-card>
              <h3 className={CARD_HEADING}>{tier.name}</h3>
              <p className="text-lg font-medium">{tier.price}</p>
              <p className={BODY}>{tier.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section aria-labelledby="faq-title" className={SECTION}>
      <div className={cn(WRAP, 'max-w-[840px]')}>
        <h2 className={cn(DISPLAY, 'mb-12 text-center')} id="faq-title">
          <Line>{LANDING_FAQ.title}</Line>
        </h2>
        <div className="divide-border border-border divide-y border-y" data-rise-group>
          {LANDING_FAQ.items.map((item) => (
            <details key={item.question} className="group" data-rise>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-xl font-medium [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus
                  className="text-muted-foreground size-5 shrink-0 transition-transform duration-200 ease-out group-open:rotate-45 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="text-muted-foreground max-w-2xl pb-7 text-lg leading-[1.4] text-pretty">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The last word on a charcoal block that grows to the page's width as it arrives. */
export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="p-2 sm:p-3">
      <div
        className="landing-night flex flex-col items-center rounded-[32px] px-5 py-24 text-center sm:py-40"
        data-closing
      >
        <h2 className={cn(DISPLAY, 'max-w-4xl')} id="closing-title">
          <Line>{LANDING_CLOSING.title}</Line>
        </h2>
        <p className={cn(BODY, 'mt-6')} data-rise>
          {LANDING_CLOSING.body}
        </p>
        <a
          className="bg-card text-card-foreground focus-visible:ring-ring mt-9 inline-flex h-11 items-center rounded-full px-5 text-base font-medium transition-transform duration-200 ease-out hover:scale-[1.04] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
          href={LANDING_HERO.download.href}
        >
          {LANDING_HERO.download.label}
        </a>
      </div>
    </section>
  );
}
