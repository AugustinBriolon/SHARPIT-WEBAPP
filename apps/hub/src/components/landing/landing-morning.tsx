import { LANDING_MORNING, LANDING_PRIORITY } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { Band, DATA, HEADING, SectionHead, pad } from './landing-parts';

const { example } = LANDING_MORNING;
const LIMITING_INDEX = LANDING_PRIORITY.indexOf(example.limiting);

/** The example verdict, laid out as the app's morning reading. */
function VerdictPanel() {
  return (
    <figure className="analysis-panel-alt p-6 sm:p-8" data-morning-panel>
      <figcaption className="flex items-center justify-between gap-4">
        <span className={cn(DATA, 'text-muted-foreground text-xs')}>{example.time}</span>
        <span className="text-label text-muted-foreground border-foreground/20 rounded-4xl border px-2 py-0.5">
          {example.tag}
        </span>
      </figcaption>
      <p className={cn(HEADING, 'mt-6 text-2xl leading-tight sm:text-3xl')} data-morning-verdict>
        {example.verdict}
      </p>
      <p className="mt-4 flex items-baseline gap-3 text-sm" data-morning-line>
        <span className="text-label text-muted-foreground">{example.limitingLabel}</span>
        <span className="text-signal-caution font-medium">{example.limiting}</span>
      </p>
      <ol className="mt-6 space-y-3">
        {example.evidence.map((line, i) => (
          <li key={line} className="flex gap-3 text-sm leading-relaxed" data-morning-line>
            <span className={cn(DATA, 'text-muted-foreground pt-px text-xs')}>{pad(i + 1)}</span>
            {line}
          </li>
        ))}
      </ol>
      <div className="border-foreground/10 mt-6 border-t pt-5" data-morning-line>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="text-label text-muted-foreground">{example.proposal.label}</span>
          <span className="text-muted-foreground relative">
            {example.proposal.from}
            <span
              className="bg-muted-foreground/70 absolute inset-x-0 top-1/2 h-px origin-left"
              aria-hidden
              data-morning-strike
            />
          </span>
          <span className="font-medium" data-morning-swap>
            {example.proposal.to}
          </span>
        </p>
        <div className="mt-4 flex gap-2" aria-hidden>
          <span className="bg-foreground text-background rounded-lg px-3 py-1.5 text-xs font-medium">
            {example.proposal.accept}
          </span>
          <span className="border-foreground/20 rounded-lg border px-3 py-1.5 text-xs font-medium">
            {example.proposal.keep}
          </span>
        </div>
      </div>
      <div className="mt-6" data-morning-line>
        <p className="flex items-baseline justify-between text-sm">
          <span className="text-label text-muted-foreground">{example.confidenceLabel}</span>
          <span className={cn(DATA, 'text-xs')}>{example.confidence}</span>
        </p>
        <span className="bg-foreground/10 mt-2 block h-1 overflow-hidden rounded-full">
          <span
            className="bg-foreground/70 block h-full origin-left rounded-full"
            style={{ width: `${example.confidenceValue * 100}%` }}
            data-morning-confidence
          />
        </span>
      </div>
    </figure>
  );
}

/** The decision engine's priority: the limiting factor is the safest domain that speaks. */
function PriorityLadder() {
  return (
    <div>
      <p className="text-label text-muted-foreground">{LANDING_MORNING.priorityLabel}</p>
      <ol className="relative mt-4">
        {LANDING_PRIORITY.map((domain, i) => (
          <li
            key={domain}
            className={cn(
              'border-foreground/10 relative isolate flex h-12 items-center gap-4 border-b px-3',
              i === LIMITING_INDEX ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {i === LIMITING_INDEX ? (
              <span
                className="bg-highlight/40 absolute inset-0 -z-10 rounded-md"
                aria-hidden
                data-priority-marker
              />
            ) : null}
            <span className={cn(DATA, 'text-xs')}>{pad(i + 1)}</span>
            <span className="text-base">{domain}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Morning() {
  return (
    <Band inner="py-24 sm:py-32" label={LANDING_MORNING.label}>
      <SectionHead
        body={LANDING_MORNING.body}
        label={LANDING_MORNING.label}
        title={LANDING_MORNING.title}
      />
      <div className="mt-16 grid gap-12 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-16">
        <VerdictPanel />
        <PriorityLadder />
      </div>
    </Band>
  );
}
