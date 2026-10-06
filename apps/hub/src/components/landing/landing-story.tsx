import { LANDING_CONTRASTS, LANDING_MANIFESTO } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { HEADING, RULE, Words } from './landing-parts';

/** The problem in one paragraph, read in word by word as the visitor scrolls. */
function Manifesto() {
  return (
    <div data-manifesto>
      <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')}>
        {LANDING_MANIFESTO.label}
      </p>
      <p
        className={cn(
          HEADING,
          'mt-10 max-w-5xl text-[clamp(1.6rem,3.6vw,2.9rem)] leading-[1.12] font-medium',
        )}
      >
        <Words text={LANDING_MANIFESTO.text} />
      </p>
    </div>
  );
}

/** What the other tools do, crossed out, then what SharpIt does instead. */
function Contrasts() {
  return (
    <ul className={cn(RULE, 'mt-20 border-t sm:mt-28')}>
      {LANDING_CONTRASTS.map((row) => (
        <li
          key={row.others}
          className={cn(RULE, 'grid gap-2 border-b py-6 sm:grid-cols-2 sm:items-baseline sm:gap-8')}
          data-contrast
        >
          <span className="text-muted-foreground relative w-fit text-lg">
            {row.others}
            <span
              className="bg-muted-foreground/70 absolute inset-x-0 top-1/2 h-px origin-left"
              aria-hidden
              data-strike
            />
          </span>
          <span className={cn(HEADING, 'text-xl sm:text-2xl')} data-contrast-answer>
            {row.sharpit}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Story() {
  return (
    <section aria-label={LANDING_MANIFESTO.label} className="py-24 sm:py-32">
      <Manifesto />
      <Contrasts />
    </section>
  );
}
