import { LANDING_METHOD } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { DATA, HEADING, LEAD, RULE, pad } from './landing-parts';

const STEP_COUNT = LANDING_METHOD.steps.length;

/**
 * The method's five steps. On a wide screen with motion allowed they share one pinned stage and
 * hand over as the visitor scrolls (`LandingMotion`); otherwise they simply stack.
 */
export function Method() {
  return (
    <section
      aria-label={LANDING_METHOD.label}
      className="relative scroll-mt-16"
      id="methode"
      data-chain
    >
      <div className="flex min-h-dvh flex-col justify-center py-24">
        {/* The counter and the step labels follow the pinned hand-over, so they show only with it. */}
        <div className={cn(RULE, 'flex items-center gap-4 border-t pt-4')}>
          <span className="text-label text-muted-foreground">{LANDING_METHOD.label}</span>
          <span className="bg-foreground/10 relative h-px flex-1 overflow-hidden">
            <span className="bg-foreground absolute inset-0 origin-left" data-chain-progress />
          </span>
          <span
            className={cn(DATA, 'text-muted-foreground hidden text-xs motion-safe:md:inline')}
            data-chain-counter
          >
            {`01 / ${pad(STEP_COUNT)}`}
          </span>
        </div>
        <ol className="mt-6 hidden gap-6 motion-safe:md:flex" aria-hidden>
          {LANDING_METHOD.steps.map((step, i) => (
            <li
              key={step.index}
              data-active={i === 0 ? '' : undefined}
              className={cn(
                DATA,
                'text-muted-foreground/60 data-[active]:text-foreground text-xs transition-colors duration-300',
              )}
              data-chain-label
            >
              {step.index} {step.label}
            </li>
          ))}
        </ol>
        <h2 className={cn(HEADING, 'mt-10 text-2xl sm:text-3xl')}>{LANDING_METHOD.title}</h2>
        {/* Stacked on one stage only when the pinned hand-over runs (wide screen, motion allowed). */}
        <div className="mt-12 grid gap-20 motion-safe:md:gap-0 motion-safe:md:[grid-template-areas:'stack']">
          {LANDING_METHOD.steps.map((step) => (
            <article
              key={step.index}
              className="motion-safe:md:[grid-area:stack] motion-safe:md:not-first:opacity-0"
              data-chain-step
            >
              <p className="text-label text-muted-foreground flex gap-3">
                <span className={DATA}>{step.index}</span>
                {step.label}
              </p>
              <h3
                className={cn(
                  HEADING,
                  'mt-6 max-w-3xl text-[clamp(2rem,5.5vw,4.25rem)] leading-[1]',
                )}
              >
                {step.title}
              </h3>
              <p className={cn(LEAD, 'mt-6 max-w-xl')}>{step.body}</p>
              <p className="annotation-clinical mt-8 max-w-xl font-[family-name:var(--font-data)]">
                {step.note}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
