'use client';

import { useState } from 'react';
import { Button } from '@sharpit/ui/components/ui/button';
import { LANDING_CONFIDENCE_STEPS, LANDING_MORNING } from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { DATA, HEADING } from './landing-parts';

type Choice = 'pending' | 'eased' | 'kept';

/** A value on the 0–1 confidence scale, with the marks where the advice changes. */
export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('bg-muted relative h-1.5 rounded-full', className)} aria-hidden>
      <span
        className="bg-foreground absolute inset-y-0 left-0 origin-left rounded-full"
        style={{ width: `${value * 100}%` }}
        data-fill
      />
      {LANDING_CONFIDENCE_STEPS.filter((step) => step.from > 0).map((step) => (
        <span
          key={step.label}
          className="bg-background absolute inset-y-0 w-0.5"
          style={{ left: `${step.from * 100}%` }}
        />
      ))}
    </div>
  );
}

function Session({ choice }: { choice: Choice }) {
  const { example } = LANDING_MORNING;
  const eased = choice !== 'kept';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <span className="text-muted-foreground text-sm">{example.sessionLabel}</span>
      <span className={cn(DATA, 'text-sm')}>
        {choice === 'kept' ? null : <s className="text-muted-foreground mr-3">{example.planned}</s>}
        <span
          className={cn(
            choice === 'eased' && 'bg-accent text-accent-foreground rounded px-1.5 py-0.5',
          )}
        >
          {eased ? example.proposed : example.planned}
        </span>
      </span>
    </div>
  );
}

/**
 * The morning reading, as the app shows it, and the one decision it asks for: the visitor eases
 * the session or keeps the plan, as an athlete would.
 */
export function MorningWidget() {
  const { example } = LANDING_MORNING;
  const [choice, setChoice] = useState<Choice>('pending');
  return (
    <div data-morning>
      <p className="text-muted-foreground text-sm">{example.caption}</p>
      <p
        className={cn(HEADING, 'mt-3 text-2xl leading-snug text-balance sm:text-3xl')}
        data-morning-verdict
      >
        {example.verdict}
      </p>
      <ul className="divide-border border-border mt-7 divide-y border-y">
        {example.evidence.map((line) => (
          <li key={line} className="py-3 text-sm" data-morning-line>
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-5" data-morning-session>
        <Session choice={choice} />
        <div>
          <div className="flex items-baseline justify-between gap-6">
            <span className="text-muted-foreground text-sm">{example.confidenceLabel}</span>
            <span className={cn(DATA, 'text-sm')}>{example.confidence}</span>
          </div>
          <ConfidenceBar className="mt-2.5" value={example.confidenceValue} />
        </div>
      </div>
      <div
        aria-live="polite"
        className="mt-7 flex min-h-10 flex-wrap items-center gap-2.5"
        data-morning-actions
      >
        {choice === 'pending' ? (
          <>
            <Button size="lg" onClick={() => setChoice('eased')}>
              {example.accept}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setChoice('kept')}>
              {example.keep}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">{choice === 'eased' ? example.accepted : example.kept}</p>
            <Button size="sm" variant="ghost" onClick={() => setChoice('pending')}>
              {example.undo}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
