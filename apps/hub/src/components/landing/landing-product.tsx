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
import { Band, Brand, CONTAINER, DATA, HEADING, RULE, SectionHead, pad } from './landing-parts';

/** The iPhone app's five tabs, then what sits around them. */
function AppSurfaces() {
  return (
    <Band inner="py-24 sm:py-32" label={LANDING_APP.label} tone="canvas">
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
    </Band>
  );
}

/** What the product refuses to become, on the night band. */
function Refusals() {
  return (
    <Band inner="py-24 sm:py-32" label={LANDING_REFUSALS.label} tone="night">
      <h2
        className={cn(HEADING, 'max-w-3xl text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[0.98]')}
        data-reveal
      >
        {LANDING_REFUSALS.label}
      </h2>
      <ul className="mt-14 grid gap-x-12 sm:grid-cols-2">
        {LANDING_REFUSALS.items.map((item) => (
          <li
            key={item}
            className={cn(RULE, 'flex items-baseline gap-5 border-b py-5 text-xl')}
            data-refusal
          >
            <span className={cn(DATA, 'text-highlight text-base')} aria-hidden>
              ×
            </span>
            {item}
          </li>
        ))}
      </ul>
    </Band>
  );
}

/** The connected sources run past as a ribbon; the second copy only closes the loop. */
function Sources() {
  const ribbon = [...LANDING_SOURCES.connected, ...LANDING_SOURCES.connected];
  return (
    <section aria-label={LANDING_SOURCES.title} className="overflow-hidden py-24 sm:py-32">
      <div className={CONTAINER}>
        <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-reveal>
          {LANDING_SOURCES.title}
        </p>
      </div>
      <div className="landing-marquee mt-12 flex w-max" data-reveal>
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1 ? true : undefined} className="flex shrink-0">
            {ribbon.map((name, i) => (
              <li
                key={`${name}-${i}`}
                className={cn(
                  HEADING,
                  'flex items-center gap-[4vw] pr-[4vw] text-[clamp(2.5rem,7vw,6rem)] leading-none',
                )}
              >
                {name}
                <span className="bg-highlight size-3 rounded-full" aria-hidden />
              </li>
            ))}
          </ul>
        ))}
      </div>
      <div className={cn(CONTAINER, 'mt-12 flex flex-wrap items-end justify-between gap-8')}>
        <dl className="text-muted-foreground flex flex-wrap gap-x-10 gap-y-2 text-lg" data-reveal>
          <div className="flex items-baseline gap-3">
            <dt className={cn(DATA, 'text-xs uppercase')}>{LANDING_SOURCES.upcomingLabel}</dt>
            <dd>{LANDING_SOURCES.upcoming.join(' · ')}</dd>
          </div>
        </dl>
        <p className={cn(HEADING, 'text-2xl sm:text-3xl')} data-reveal>
          {LANDING_SOURCES.subtitle}
        </p>
      </div>
    </section>
  );
}

/** Native disclosure: works without script, the plus turns into a cross when open. */
function Faq() {
  return (
    <Band
      inner="grid gap-10 py-24 sm:py-32 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-16"
      label={LANDING_FAQ.label}
    >
      <div>
        <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-reveal>
          {LANDING_FAQ.label}
        </p>
        <h2 className={cn(HEADING, 'mt-8 text-[clamp(2rem,4vw,3rem)] leading-[1]')} data-reveal>
          {LANDING_FAQ.title}
        </h2>
      </div>
      <div className={cn(RULE, 'border-t')}>
        {LANDING_FAQ.items.map((item) => (
          <details key={item.question} className={cn(RULE, 'group border-b')} data-reveal>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
              <span
                className={cn(
                  HEADING,
                  'text-xl transition-transform duration-300 ease-out group-hover:translate-x-1 sm:text-2xl',
                )}
              >
                {item.question}
              </span>
              <span className="border-foreground/20 group-open:bg-foreground group-open:text-background grid size-9 shrink-0 place-items-center rounded-full border transition-colors duration-300">
                <Plus
                  className="size-4 transition-transform duration-300 ease-out group-open:rotate-45"
                  aria-hidden
                />
              </span>
            </summary>
            <p className="text-muted-foreground max-w-2xl pb-7 text-base leading-relaxed text-pretty">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </Band>
  );
}

/** The last word and the way in, then the footer, on one night band. */
function Closing() {
  return (
    <section aria-label={LANDING_CLOSING.cta.label} className="landing-night">
      <div className={cn(CONTAINER, 'pt-28 pb-10 sm:pt-40')}>
        <h2
          className={cn(HEADING, 'max-w-5xl text-[clamp(2.6rem,7vw,6.5rem)] leading-[0.95]')}
          data-reveal
        >
          {LANDING_CLOSING.title}
        </h2>
        <div className="mt-12 flex flex-wrap items-center gap-6" data-reveal>
          <a
            className={buttonVariants({ size: 'lg', variant: 'highlight', className: 'px-5' })}
            href={LANDING_CLOSING.cta.href}
          >
            {LANDING_CLOSING.cta.label}
            <ArrowUpRight data-icon="inline-end" />
          </a>
          <p className="text-muted-foreground text-lg">{LANDING_CLOSING.body}</p>
        </div>
        <footer
          className={cn(
            RULE,
            'text-muted-foreground mt-28 flex flex-wrap items-center justify-between gap-4 border-t pt-8 text-sm',
          )}
        >
          <Brand />
          <nav className="flex gap-5">
            {LANDING_FOOTER_LINKS.map((link) => (
              <Link key={link.href} className="underline-offset-4 hover:underline" href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </section>
  );
}

export function Product() {
  return (
    <>
      <AppSurfaces />
      <Sources />
      <Refusals />
      <Faq />
      <Closing />
    </>
  );
}
