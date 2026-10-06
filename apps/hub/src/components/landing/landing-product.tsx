import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import {
  LANDING_APP,
  LANDING_CLOSING,
  LANDING_FAQ,
  LANDING_FOOTER_LINKS,
  LANDING_REFUSALS,
  LANDING_SOURCES,
} from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { DATA, HEADING, RULE, SectionHead, pad } from './landing-parts';

/** The iPhone app's five tabs, then what sits around them. */
function AppSurfaces() {
  return (
    <section aria-label={LANDING_APP.label} className="py-24 sm:py-32">
      <SectionHead label={LANDING_APP.label} title={LANDING_APP.title} />
      <ul className={cn(RULE, 'mt-14 border-t')}>
        {LANDING_APP.surfaces.map((surface, i) => (
          <li
            key={surface.name}
            className={cn(
              RULE,
              'group grid gap-2 border-b py-7 sm:grid-cols-[4rem_14rem_1fr] sm:items-baseline sm:gap-6',
            )}
            data-reveal
          >
            <span className={cn(DATA, 'text-muted-foreground text-xs')}>{pad(i + 1)}</span>
            <span
              className={cn(
                HEADING,
                'text-2xl transition-transform duration-500 ease-out group-hover:translate-x-1 sm:text-3xl',
              )}
            >
              {surface.name}
            </span>
            <span className="text-muted-foreground text-base leading-relaxed">{surface.body}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-10 flex flex-wrap gap-2">
        {LANDING_APP.extras.map((extra) => (
          <li
            key={extra}
            className="border-foreground/15 text-muted-foreground rounded-4xl border px-3 py-1.5 text-sm"
            data-reveal
          >
            {extra}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the product refuses to become, on the ink band. */
function Refusals() {
  return (
    <section aria-label={LANDING_REFUSALS.label} className="py-16 sm:py-24">
      <div className="surface-ink px-6 py-14 sm:px-12 sm:py-20" data-reveal>
        <h2 className={cn(HEADING, 'text-[clamp(1.75rem,4vw,3rem)] leading-[1.05]')}>
          {LANDING_REFUSALS.label}
        </h2>
        <ul className="mt-10 grid gap-x-10 sm:grid-cols-2">
          {LANDING_REFUSALS.items.map((item) => (
            <li
              key={item}
              className="flex items-baseline gap-4 border-b border-current/15 py-4 text-lg"
              data-refusal
            >
              <span className={cn(DATA, 'text-sm opacity-60')} aria-hidden>
                ×
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Sources() {
  return (
    <section aria-label={LANDING_SOURCES.title} className="py-16 sm:py-24">
      <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-reveal>
        {LANDING_SOURCES.title}
      </p>
      <ul className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
        {LANDING_SOURCES.connected.map((name) => (
          <li
            key={name}
            className={cn(HEADING, 'text-[clamp(1.75rem,4.5vw,3.25rem)] leading-none')}
            data-reveal
          >
            {name}
          </li>
        ))}
      </ul>
      <dl
        className="text-muted-foreground mt-8 flex flex-wrap gap-x-10 gap-y-2 text-lg"
        data-reveal
      >
        <div className="flex items-baseline gap-3">
          <dt className={cn(DATA, 'text-xs uppercase')}>{LANDING_SOURCES.importLabel}</dt>
          <dd>{LANDING_SOURCES.imported.join(' · ')}</dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className={cn(DATA, 'text-xs uppercase')}>{LANDING_SOURCES.upcomingLabel}</dt>
          <dd>{LANDING_SOURCES.upcoming.join(' · ')}</dd>
        </div>
      </dl>
      <p className={cn(HEADING, 'mt-12 text-2xl sm:text-3xl')} data-reveal>
        {LANDING_SOURCES.subtitle}
      </p>
    </section>
  );
}

/** Native disclosure: works without script, the plus turns into a cross when open. */
function Faq() {
  return (
    <section aria-label={LANDING_FAQ.label} className="py-24 sm:py-32">
      <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-reveal>
        {LANDING_FAQ.label}
      </p>
      <div className="mt-8">
        {LANDING_FAQ.items.map((item) => (
          <details key={item.question} className={cn(RULE, 'group border-b')} data-reveal>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
              <span className={cn(HEADING, 'text-xl sm:text-2xl')}>{item.question}</span>
              <Plus
                className="text-muted-foreground size-5 shrink-0 transition-transform duration-300 ease-out group-open:rotate-45"
                aria-hidden
              />
            </summary>
            <p className="text-muted-foreground max-w-2xl pb-6 text-base leading-relaxed text-pretty">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="py-16 sm:py-24">
      <div className="surface-ink px-6 py-20 sm:px-12 sm:py-28" data-reveal>
        <h2 className={cn(HEADING, 'max-w-3xl text-[clamp(2rem,5.5vw,4rem)] leading-[1]')}>
          {LANDING_CLOSING.title}
        </h2>
        <p className="mt-6 text-lg opacity-75">{LANDING_CLOSING.body}</p>
        <a
          className={buttonVariants({ size: 'lg', variant: 'highlight', className: 'mt-10 px-5' })}
          href={LANDING_CLOSING.cta.href}
        >
          {LANDING_CLOSING.cta.label}
          <ArrowUpRight data-icon="inline-end" />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer
      className={cn(
        RULE,
        'text-muted-foreground flex flex-wrap items-center justify-between gap-4 border-t py-8 text-sm',
      )}
    >
      <span className={DATA}>SharpIt</span>
      <nav className="flex gap-5">
        {LANDING_FOOTER_LINKS.map((link) => (
          <Link key={link.href} className="underline-offset-4 hover:underline" href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

export function Product() {
  return (
    <>
      <AppSurfaces />
      <Refusals />
      <Sources />
      <Faq />
      <Closing />
      <Footer />
    </>
  );
}
