import { LANDING_CONTRASTS, LANDING_MANIFESTO } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { Band, HEADING, RULE, Words } from './landing-parts';

/** The problem in one paragraph on the night band, read in word by word as the visitor scrolls. */
function Manifesto() {
  return (
    <Band inner="py-28 sm:py-40" label={LANDING_MANIFESTO.label} tone="night">
      <div data-manifesto>
        <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')}>
          {LANDING_MANIFESTO.label}
        </p>
        <p
          className={cn(
            HEADING,
            'mt-12 text-[clamp(1.85rem,4.4vw,3.6rem)] leading-[1.08] font-medium',
          )}
        >
          <Words text={LANDING_MANIFESTO.text} />
        </p>
      </div>
    </Band>
  );
}

/** What the other tools do, crossed out, then what SharpIt does instead. */
function Contrasts() {
  return (
    <Band inner="py-20 sm:py-28" label="SharpIt face aux autres outils">
      <ul className={cn(RULE, 'border-t')}>
        {LANDING_CONTRASTS.map((row) => (
          <li
            key={row.others}
            className={cn(
              RULE,
              'grid gap-3 border-b py-8 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-baseline sm:gap-10 sm:py-10',
            )}
            data-contrast
          >
            <span className="text-muted-foreground relative w-fit text-lg sm:text-xl">
              {row.others}
              <span
                className="bg-foreground/60 absolute inset-x-0 top-1/2 h-px origin-left"
                aria-hidden
                data-strike
              />
            </span>
            <span
              className={cn(HEADING, 'text-2xl leading-tight sm:text-[2.1rem]')}
              data-contrast-answer
            >
              {row.sharpit}
            </span>
          </li>
        ))}
      </ul>
    </Band>
  );
}

export function Story() {
  return (
    <>
      <Manifesto />
      <Contrasts />
    </>
  );
}
