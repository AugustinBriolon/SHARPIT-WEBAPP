import {
  LANDING_GUARDRAILS,
  LANDING_HONESTY,
  LANDING_MEMORY,
} from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { Band, DATA, HEADING, LEAD, RULE, SectionHead, pad } from './landing-parts';

/** The plan's Gate: the count, then one line per rule. */
function Guardrails() {
  return (
    <Band inner="py-24 sm:py-32" label={LANDING_GUARDRAILS.label} tone="night">
      <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-reveal>
        {LANDING_GUARDRAILS.label}
      </p>
      <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-16">
        <div>
          <h2 className={cn(HEADING, 'leading-[0.95]')} data-reveal>
            <span
              data-count={LANDING_GUARDRAILS.count}
              className={cn(
                DATA,
                'text-highlight block text-[clamp(6rem,17vw,13rem)] tracking-[-0.06em]',
              )}
            >
              {LANDING_GUARDRAILS.count}
            </span>
            <span className="mt-2 block text-[clamp(1.6rem,3.2vw,2.5rem)]">
              {LANDING_GUARDRAILS.title}
            </span>
          </h2>
          <p className={cn(LEAD, 'mt-6')} data-reveal>
            {LANDING_GUARDRAILS.body}
          </p>
        </div>
        <ol className="grid content-start gap-x-8 sm:grid-cols-2">
          {LANDING_GUARDRAILS.rules.map((rule, i) => (
            <li
              key={rule}
              className={cn(RULE, 'flex gap-4 border-b py-3 text-[0.9375rem] leading-snug')}
              data-rule
            >
              <span className={cn(DATA, 'text-muted-foreground pt-0.5 text-xs')}>{pad(i + 1)}</span>
              {rule}
            </li>
          ))}
        </ol>
      </div>
    </Band>
  );
}

// A tier is a status said with a word (ADR-130): full advice reads good, cautious advice to watch,
// and the two where SharpIt holds back stay neutral.
const TIER_PILL = [
  'border-(--status-good-border) bg-(--status-good) text-(--status-good-foreground)',
  'border-(--status-watch-border) bg-(--status-watch) text-(--status-watch-foreground)',
  'border-(--status-unknown-border) bg-(--status-unknown) text-(--status-unknown-foreground)',
] as const;

/** The confidence policy as a table of statuses, then what the model learns over time. */
function Honesty() {
  return (
    <Band inner="py-24 sm:py-32" label={LANDING_HONESTY.label}>
      <SectionHead
        body={LANDING_HONESTY.body}
        label={LANDING_HONESTY.label}
        title={LANDING_HONESTY.title}
      />
      <ol className="mt-12 max-w-3xl border-t border-(--outline)">
        {LANDING_HONESTY.tiers.map((tier, i) => (
          <li key={tier.label} className="relative flex items-center gap-4 py-4" data-tier>
            <span
              className={cn(
                'inline-block h-6 w-28 shrink-0 truncate rounded-(--shape-pill) border px-2.5 text-center text-xs leading-[1.375rem] font-semibold',
                TIER_PILL[Math.min(i, TIER_PILL.length - 1)],
              )}
            >
              {tier.label}
            </span>
            <span className={cn(DATA, 'w-16 shrink-0 text-sm font-semibold')}>
              {tier.threshold}
            </span>
            <span className="text-[0.9375rem]">{tier.effect}</span>
            <span
              className="bg-border absolute inset-x-0 bottom-0 h-px origin-left"
              aria-hidden
              data-tier-bar
            />
          </li>
        ))}
      </ol>
      <div className="mt-20">
        <p className="text-label text-muted-foreground" data-reveal>
          {LANDING_HONESTY.rampLabel}
        </p>
        <div className="relative mt-6" data-ramp>
          <span
            className="bg-foreground/15 absolute top-[0.3125rem] right-0 left-0 hidden h-px sm:block"
            aria-hidden
          />
          <span
            className="bg-foreground absolute top-[0.3125rem] right-0 left-0 hidden h-px origin-left sm:block"
            aria-hidden
            data-ramp-line
          />
          <ol className="grid gap-8 sm:grid-cols-4 sm:gap-6">
            {LANDING_HONESTY.ramp.map((stage) => (
              <li key={stage.at} className="relative" data-ramp-stage>
                <span
                  className="bg-background border-foreground relative block size-2.5 rounded-full border"
                  aria-hidden
                />
                <p className={cn(DATA, 'mt-4 text-sm')}>{stage.at}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{stage.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <p className="annotation-clinical mt-10 max-w-xl" data-reveal>
          {LANDING_HONESTY.rampNote}
        </p>
      </div>
    </Band>
  );
}

/** Decision Memory: what was advised, what was chosen, what followed. */
function Memory() {
  return (
    <Band inner="py-24 sm:py-32" label={LANDING_MEMORY.label}>
      <div className="grid gap-12 md:grid-cols-2 md:items-end md:gap-16">
        <SectionHead
          body={LANDING_MEMORY.body}
          label={LANDING_MEMORY.label}
          title={LANDING_MEMORY.title}
        />
        <ol className="analysis-panel p-6 sm:p-8">
          {LANDING_MEMORY.trail.map((entry, i) => (
            <li key={entry.label} className="relative flex gap-5 pb-6 last:pb-0" data-trail>
              {i < LANDING_MEMORY.trail.length - 1 ? (
                <span
                  className="bg-foreground/25 absolute top-4 bottom-0 left-[0.3125rem] w-px origin-top"
                  aria-hidden
                  data-trail-line
                />
              ) : null}
              <span
                className="border-foreground bg-background relative mt-1.5 size-2.5 shrink-0 rounded-full border"
                aria-hidden
              />
              <div>
                <p className="text-label text-muted-foreground">{entry.label}</p>
                <p className="mt-1 text-base">{entry.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Band>
  );
}

export function Trust() {
  return (
    <>
      <Guardrails />
      <Honesty />
      <Memory />
    </>
  );
}
