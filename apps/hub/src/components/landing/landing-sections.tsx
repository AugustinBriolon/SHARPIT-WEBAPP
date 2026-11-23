import type { ReactNode } from 'react';
import Image, { type StaticImageData } from 'next/image';
import { Plus } from 'lucide-react';
import { buttonTapScale, buttonVariants } from '@sharpit/ui/components/ui/button';
import {
  LANDING_CONFIDENCE_STEPS,
  LANDING_FAQ,
  LANDING_GATE_RULE_COUNT,
  LANDING_HERO,
  LANDING_MODEL,
  LANDING_MORNING,
  LANDING_PLAN,
  LANDING_PRICING,
  LANDING_SOURCES,
  type LandingCard,
} from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { DIAGRAMS } from './landing-diagrams';
import { ConfidenceBar, MorningWidget } from './landing-morning';
import { CONTAINER, DATA, HEADING, LEAD } from './landing-parts';
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

const SECTION = 'border-border border-t py-20 sm:py-28';
const SECTION_TITLE = cn(HEADING, 'text-3xl leading-tight text-balance sm:text-4xl');
const SPLIT = 'grid gap-12 lg:grid-cols-2 lg:gap-20';

export function DownloadButton() {
  return (
    <a
      className={cn(buttonVariants({ size: 'lg' }), buttonTapScale, 'px-5')}
      href={LANDING_HERO.download.href}
    >
      {LANDING_HERO.download.label}
    </a>
  );
}

const LIST = new Intl.ListFormat('fr', { type: 'conjunction' });

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pt-16 sm:pt-24">
      <div className={cn(CONTAINER, 'flex flex-col items-center text-center')}>
        <h1 className={cn(HEADING, 'text-[clamp(2.5rem,7vw,5rem)] leading-[1.05]')} id="hero-title">
          {LANDING_HERO.titleLines.map((line) => (
            <span key={line} className="block overflow-hidden pb-[0.12em]">
              <span className="block" data-hero-line>
                {line}
              </span>
            </span>
          ))}
        </h1>
        <p className={cn(LEAD, 'mt-5 max-w-xl')} data-hero-fade>
          {LANDING_HERO.body}
        </p>
        <div
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
          data-hero-fade
        >
          <DownloadButton />
          <a className="text-sm underline underline-offset-4" href={LANDING_HERO.demo.href}>
            {LANDING_HERO.demo.label}
          </a>
        </div>
        <p className="text-muted-foreground mt-4 text-sm" data-hero-fade>
          {LANDING_HERO.downloadNote}
        </p>
        <div className="mt-14 pb-16 sm:pb-24">
          <Phone />
        </div>
      </div>
    </section>
  );
}

/** One cell of a bento: the widget on top, then a title and at most one sentence. */
function Card({
  card,
  className,
  children,
}: {
  card?: LandingCard;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        'bg-card border-border flex flex-col justify-between gap-8 rounded-3xl border p-6 sm:p-8',
        className,
      )}
      data-reveal
    >
      {children}
      {card ? (
        <div>
          <h3 className="text-lg font-medium text-balance">{card.title}</h3>
          <p className="text-muted-foreground mt-1.5 text-pretty">{card.body}</p>
        </div>
      ) : null}
    </article>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 className={cn(SECTION_TITLE, 'mb-10 sm:mb-14 sm:text-5xl')} id={id} data-reveal>
      {children}
    </h2>
  );
}

export function Morning() {
  return (
    <section aria-labelledby="morning-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionTitle id="morning-title">{LANDING_MORNING.title}</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
          <Card className="lg:col-span-3">
            <MorningWidget />
          </Card>
          <Card card={LANDING_MORNING.arbitrate} className="lg:col-span-2">
            <DIAGRAMS.Arbitrate />
          </Card>
        </div>
      </div>
    </section>
  );
}

export function Plan() {
  return (
    <section aria-labelledby="plan-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionTitle id="plan-title">{LANDING_PLAN.title}</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
          <Card card={LANDING_PLAN.programme}>
            <DIAGRAMS.Programme />
          </Card>
          <Card card={LANDING_PLAN.repair}>
            <DIAGRAMS.Repair />
          </Card>
        </div>
      </div>
    </section>
  );
}

/** The Gate's count, and one tick per rule. */
function GateCount() {
  return (
    <div>
      <p
        className={cn(DATA, HEADING, 'text-8xl leading-none')}
        data-count={LANDING_GATE_RULE_COUNT}
      >
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
      <p className={cn(DATA, HEADING, 'text-8xl leading-none')}>
        {example.confidenceValue.toLocaleString('fr')}
      </p>
      <ConfidenceBar className="mt-6" value={example.confidenceValue} />
      <ol className="text-muted-foreground mt-2.5 flex justify-between gap-3 text-sm">
        {LANDING_CONFIDENCE_STEPS.map((step) => (
          <li key={step.label}>{step.label}</li>
        ))}
      </ol>
    </div>
  );
}

export function Model() {
  return (
    <section aria-labelledby="model-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionTitle id="model-title">{LANDING_MODEL.title}</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
          <Card card={LANDING_MODEL.observe}>
            <DIAGRAMS.Observe />
          </Card>
          <Card card={LANDING_MODEL.compare}>
            <DIAGRAMS.Compare />
          </Card>
          <Card card={LANDING_MODEL.gate}>
            <GateCount />
          </Card>
          <Card card={LANDING_MODEL.honesty}>
            <ConfidenceScale />
          </Card>
        </div>
      </div>
    </section>
  );
}

export function SourcesAndPricing() {
  return (
    <section aria-label={LANDING_SOURCES.title} className={SECTION}>
      <div className={cn(CONTAINER, SPLIT)}>
        <div>
          <h2 className={SECTION_TITLE}>{LANDING_SOURCES.title}</h2>
          <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-5">
            {LANDING_SOURCES.connected.map((name) => (
              <li key={name} className="flex items-center gap-3">
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
          <p className="text-muted-foreground mt-6 text-sm">
            {LANDING_SOURCES.upcomingLabel} : {LIST.format(LANDING_SOURCES.upcoming)}.
          </p>
        </div>
        <div>
          <h2 className={SECTION_TITLE}>{LANDING_PRICING.title}</h2>
          <dl className="divide-border border-border mt-8 divide-y border-y">
            {LANDING_PRICING.tiers.map((tier) => (
              <div key={tier.name} className="py-5">
                <dt className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="font-medium">{tier.name}</span>
                  <span className={cn(DATA, 'text-muted-foreground text-sm')}>{tier.price}</span>
                </dt>
                <dd className="text-muted-foreground mt-2 leading-relaxed">{tier.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section aria-labelledby="faq-title" className={SECTION}>
      <div className={cn(CONTAINER, SPLIT)}>
        <h2 className={SECTION_TITLE} id="faq-title">
          {LANDING_FAQ.title}
        </h2>
        <div className="divide-border border-border divide-y border-y">
          {LANDING_FAQ.items.map((item) => (
            <details key={item.question} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-medium [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus
                  className="text-muted-foreground size-4 shrink-0 transition-transform duration-150 ease-out group-open:rotate-45 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="text-muted-foreground max-w-xl pb-6 leading-relaxed text-pretty">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
