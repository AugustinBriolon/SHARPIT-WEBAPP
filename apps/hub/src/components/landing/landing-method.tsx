import { LANDING_METHOD } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { METHOD_DIAGRAMS } from './landing-diagrams';
import { CONTAINER, DATA, HEADING, LEAD, RULE, pad } from './landing-parts';

const STEP_COUNT = LANDING_METHOD.steps.length;
/** The track's first panel lines up with the reading column (`max-w-6xl`, `px-8`). */
const TRACK_INSET = 'motion-safe:md:pl-[max(2rem,calc((100vw-72rem)/2+2rem))]';

/**
 * The method's five steps, each with its schematic. On a wide screen with motion allowed the
 * section pins and the steps travel sideways under the reader's scroll (`LandingMotion`);
 * otherwise they simply stack.
 */
export function Method() {
  return (
    <section
      aria-label={LANDING_METHOD.label}
      className="landing-canvas relative scroll-mt-16 overflow-hidden"
      id="methode"
      data-chain
    >
      <div className="flex min-h-dvh flex-col justify-center py-24">
        <div className={CONTAINER}>
          <div className={cn(RULE, 'flex items-center gap-4 border-t pt-4')}>
            <span className="text-label text-muted-foreground">{LANDING_METHOD.label}</span>
            <span className="bg-foreground/10 relative h-px flex-1 overflow-hidden">
              <span className="bg-foreground absolute inset-0 origin-left" data-chain-progress />
            </span>
            {/* The counter and the step labels follow the travelling track, so they show only with it. */}
            <span
              className={cn(DATA, 'text-muted-foreground hidden text-xs motion-safe:md:inline')}
              data-chain-counter
            >
              {`01 / ${pad(STEP_COUNT)}`}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-6">
            <h2 className={cn(HEADING, 'text-[clamp(1.75rem,3.4vw,2.75rem)] leading-none')}>
              {LANDING_METHOD.title}
            </h2>
            <ol className="hidden gap-5 motion-safe:md:flex" aria-hidden>
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
          </div>
        </div>

        <div
          className={cn(
            CONTAINER,
            'mt-14 flex flex-col gap-24 motion-safe:md:mx-0 motion-safe:md:w-max motion-safe:md:max-w-none motion-safe:md:flex-row motion-safe:md:gap-[8vw] motion-safe:md:pr-[8vw]',
            TRACK_INSET,
          )}
          data-chain-track
        >
          {LANDING_METHOD.steps.map((step, i) => {
            const Diagram = METHOD_DIAGRAMS[i];
            return (
              <article
                key={step.index}
                className="relative grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center md:gap-14 motion-safe:md:w-[min(84vw,68rem)]"
                data-chain-step
              >
                <div className="relative">
                  <span
                    className={cn(
                      HEADING,
                      'text-foreground/[0.06] pointer-events-none absolute -top-16 -left-2 text-[9rem] leading-none select-none',
                    )}
                    aria-hidden
                  >
                    {step.index}
                  </span>
                  <p className="text-label text-muted-foreground relative flex gap-3">
                    <span className={DATA}>{step.index}</span>
                    {step.label}
                  </p>
                  <h3
                    className={cn(
                      HEADING,
                      'relative mt-5 text-[clamp(2rem,4.2vw,3.5rem)] leading-[1]',
                    )}
                  >
                    {step.title}
                  </h3>
                  <p className={cn(LEAD, 'mt-6')}>{step.body}</p>
                  <p className="annotation-clinical mt-8 font-[family-name:var(--font-data)]">
                    {step.note}
                  </p>
                </div>
                <div className="analysis-panel p-6 sm:p-8">
                  <Diagram />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
