import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { LANDING_HERO } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { CONTAINER, DATA, HEADING, LEAD } from './landing-parts';
import { Phone } from './landing-phone';

const RULER_TICKS = 49;

/** Instrument ruler: a day read as a scale, the marker settles on the morning decision. */
function Ruler() {
  return (
    <div className="relative mt-16 w-full sm:mt-24" data-hero-fade>
      <div className="flex h-10 items-end justify-between" aria-hidden>
        {Array.from({ length: RULER_TICKS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'bg-foreground/30 w-px origin-bottom',
              i % 6 === 0 ? 'bg-foreground/70 h-10' : 'h-4',
            )}
            data-tick
          />
        ))}
      </div>
      <div className="absolute -top-7 left-[29%] -translate-x-1/2" aria-hidden data-marker>
        <span
          className={cn(
            DATA,
            'bg-highlight text-highlight-foreground rounded px-1.5 py-0.5 text-[0.6875rem]',
          )}
        >
          07:00
        </span>
      </div>
      <div
        className={cn(DATA, 'text-muted-foreground mt-3 flex justify-between text-[0.6875rem]')}
        aria-hidden
      >
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <p className="text-label text-muted-foreground mt-6">{LANDING_HERO.rulerNote}</p>
    </div>
  );
}

export function Hero() {
  return (
    <section className="landing-canvas relative overflow-hidden" data-hero>
      <div className={cn(CONTAINER, 'flex min-h-dvh flex-col justify-center pt-28 pb-16')}>
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
          <div data-hero-body>
            <p className="text-label text-muted-foreground" data-hero-fade>
              {LANDING_HERO.eyebrow}
            </p>
            <h1 className={cn(HEADING, 'mt-6 text-[clamp(2.6rem,6.4vw,5.6rem)] leading-[0.93]')}>
              {LANDING_HERO.titleLines.map((line) => (
                <span key={line} className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
                  <span className="block" data-hero-line>
                    {line}
                  </span>
                </span>
              ))}
            </h1>
            <p className={cn(LEAD, 'mt-8 max-w-xl')} data-hero-fade>
              {LANDING_HERO.body}
            </p>
            <div className="mt-10 flex flex-wrap gap-3" data-hero-fade>
              <a
                className={buttonVariants({ size: 'lg', className: 'px-5' })}
                href={LANDING_HERO.primaryCta.href}
              >
                {LANDING_HERO.primaryCta.label}
                <ArrowUpRight data-icon="inline-end" />
              </a>
              <a
                href={LANDING_HERO.secondaryCta.href}
                className={buttonVariants({
                  size: 'lg',
                  variant: 'ghost',
                  className: 'group/cta px-5',
                })}
              >
                {LANDING_HERO.secondaryCta.label}
                <ArrowDown
                  className="transition-transform duration-300 ease-out group-hover/cta:translate-y-0.5"
                  data-icon="inline-end"
                />
              </a>
            </div>
          </div>
          <Phone />
        </div>
        <Ruler />
      </div>
    </section>
  );
}
