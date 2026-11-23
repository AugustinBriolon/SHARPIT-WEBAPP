import { Plus } from 'lucide-react';
import { buttonTapScale, buttonVariants } from '@sharpit/ui/components/ui/button';
import {
  LANDING_FAQ,
  LANDING_HERO,
  LANDING_MORNING,
  LANDING_PRICING,
  LANDING_REPAIR,
  LANDING_SOURCES,
  LANDING_TRUST,
  type LandingRepairDay,
} from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { CONTAINER, DATA, HEADING, LEAD } from './landing-parts';
import { Phone } from './landing-phone';

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

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="py-16 sm:py-24">
      <div className={cn(CONTAINER, 'grid items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-20')}>
        <div>
          <h1
            className={cn(HEADING, 'text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.05]')}
            id="hero-title"
          >
            {LANDING_HERO.titleLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
          <p className={cn(LEAD, 'mt-6 max-w-xl')}>{LANDING_HERO.body}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <DownloadButton />
            <a className="text-sm underline underline-offset-4" href={LANDING_HERO.demo.href}>
              {LANDING_HERO.demo.label}
            </a>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">{LANDING_HERO.downloadNote}</p>
        </div>
        <Phone />
      </div>
    </section>
  );
}

/** The morning verdict as one flat sheet: hairlines between its parts, no card inside a card. */
function MorningExample() {
  const { example } = LANDING_MORNING;
  return (
    <figure className="bg-card border-border rounded-2xl border p-6 sm:p-8">
      <figcaption className="text-muted-foreground text-sm">{example.caption}</figcaption>
      <p className={cn(HEADING, 'mt-3 text-2xl leading-snug text-balance')}>{example.verdict}</p>
      <p className="text-muted-foreground mt-8 text-sm">{example.evidenceLabel}</p>
      <ul className="divide-border border-border mt-2 divide-y border-y">
        {example.evidence.map((line) => (
          <li key={line} className="py-3 text-sm">
            {line}
          </li>
        ))}
      </ul>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
        {example.facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-muted-foreground text-sm">{fact.label}</dt>
            <dd className={cn(DATA, 'mt-1 text-sm')}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground border-border mt-6 border-t pt-4 text-sm">
        {example.choice}
      </p>
    </figure>
  );
}

export function Morning() {
  return (
    <section aria-labelledby="morning-title" className={SECTION}>
      <div className={cn(CONTAINER, SPLIT)}>
        <div>
          <h2 className={SECTION_TITLE} id="morning-title">
            {LANDING_MORNING.title}
          </h2>
          <p className={cn(LEAD, 'mt-5 max-w-lg')}>{LANDING_MORNING.body}</p>
        </div>
        <MorningExample />
      </div>
    </section>
  );
}

function RepairRow({ day }: { day: LandingRepairDay }) {
  const missed = day.change === 'missed';
  const moved = day.change === 'moved';
  return (
    <tr className="border-border border-t">
      <th className="text-muted-foreground py-3 pr-3 text-left font-normal" scope="row">
        {day.day}
      </th>
      <td className={cn('py-3 pr-3', missed && 'text-muted-foreground')}>
        <span className={cn(missed && 'line-through')}>{day.planned}</span>
        {missed ? <span className="block">{LANDING_REPAIR.missedLabel}</span> : null}
      </td>
      <td
        className={cn(
          'py-3',
          missed && 'text-muted-foreground',
          moved && 'bg-accent text-accent-foreground rounded-md px-3',
        )}
      >
        {day.repaired}
        {moved ? <span className="block">{LANDING_REPAIR.movedLabel}</span> : null}
      </td>
    </tr>
  );
}

export function Repair() {
  const { columns } = LANDING_REPAIR;
  return (
    <section aria-labelledby="repair-title" className={SECTION}>
      <div className={cn(CONTAINER, SPLIT)}>
        <div>
          <h2 className={SECTION_TITLE} id="repair-title">
            {LANDING_REPAIR.title}
          </h2>
          <p className={cn(LEAD, 'mt-5 max-w-lg')}>{LANDING_REPAIR.body}</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <caption className="text-muted-foreground pb-4 text-left">
            {LANDING_REPAIR.caption}
          </caption>
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="pr-3 pb-3 font-normal" scope="col">
                {columns.day}
              </th>
              <th className="pr-3 pb-3 font-normal" scope="col">
                {columns.planned}
              </th>
              <th className="pb-3 font-normal" scope="col">
                {columns.repaired}
              </th>
            </tr>
          </thead>
          <tbody>
            {LANDING_REPAIR.days.map((day) => (
              <RepairRow key={day.day} day={day} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Trust() {
  return (
    <section aria-labelledby="trust-title" className={SECTION}>
      <div className={CONTAINER}>
        <h2 className={SECTION_TITLE} id="trust-title">
          {LANDING_TRUST.title}
        </h2>
        <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
          {LANDING_TRUST.reasons.map((reason) => (
            <li key={reason.title}>
              <h3 className="text-lg font-medium">{reason.title}</h3>
              <p className="text-muted-foreground mt-2 leading-relaxed text-pretty">
                {reason.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const LIST = new Intl.ListFormat('fr', { type: 'conjunction' });

export function SourcesAndPricing() {
  return (
    <section aria-label={LANDING_SOURCES.title} className={SECTION}>
      <div className={cn(CONTAINER, SPLIT)}>
        <div>
          <h2 className={SECTION_TITLE}>{LANDING_SOURCES.title}</h2>
          <p className={cn(LEAD, 'mt-5')}>{LANDING_SOURCES.body}</p>
          <p className="mt-6">{LIST.format(LANDING_SOURCES.connected)}.</p>
          <p className="text-muted-foreground mt-1">
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
