import { LANDING_CONTRASTS, LANDING_MANIFESTO } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { Band, HEADING, Words } from './landing-parts';

/** The problem in one paragraph, read in word by word as the visitor scrolls. */
function Manifesto() {
  return (
    <div data-manifesto>
      <p className="text-label text-muted-foreground">{LANDING_MANIFESTO.label}</p>
      <p
        className={cn(
          HEADING,
          'mt-6 text-[clamp(1.4rem,2.2vw,1.75rem)] leading-[1.35] font-medium tracking-[-0.015em]',
        )}
      >
        <Words text={LANDING_MANIFESTO.text} />
      </p>
    </div>
  );
}

/** What the other tools do, crossed out, then what SharpIt does instead: one hairline a pair. */
function Contrasts() {
  return (
    <ul aria-label="SharpIt face aux autres outils" className="border-t border-(--outline)">
      {LANDING_CONTRASTS.map((row) => (
        <li
          key={row.others}
          className="border-border grid gap-2 border-b py-5 text-[0.9375rem] leading-snug sm:grid-cols-2 sm:gap-6"
          data-contrast
        >
          <span className="text-muted-foreground relative w-fit">
            {row.others}
            <span
              className="bg-foreground/60 absolute inset-x-0 top-1/2 h-px origin-left"
              aria-hidden
              data-strike
            />
          </span>
          <span className="font-medium" data-contrast-answer>
            {row.sharpit}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The problem beside its answers: the statement on the left, the four contrasts as a table. */
export function Story() {
  return (
    <Band inner="py-24 sm:py-32" label={LANDING_MANIFESTO.label}>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <Manifesto />
        <Contrasts />
      </div>
    </Band>
  );
}
