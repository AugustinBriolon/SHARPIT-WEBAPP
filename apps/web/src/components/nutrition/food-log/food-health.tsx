'use client';

import { createElement } from 'react';
import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Dumbbell,
  Droplet,
  Flame,
  FlaskConical,
  Info,
  Leaf,
  Box,
  Cog,
  Footprints,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { TickSemicircle } from '@/components/today/dashboard/overnight-score-gauge';
import type { DietFit } from '@sharpit/app/lib/nutrition/food-log/food-diet-fit';
import type { FoodHighlight } from '@sharpit/app/lib/nutrition/food-log/food-health-highlights';
import type { ServedFoodHealth } from '@sharpit/app/lib/nutrition/food-log/food-health-score';
import {
  HEALTH_DISCLAIMER,
  HEALTH_GRADE_LABELS,
  HEALTH_METHOD,
  HEALTH_PARTIAL_METHOD,
  additiveStatus,
  dietTone,
  gradeTone,
  healthSources,
  healthVerdict,
  highlightTone,
  incompatibleDiets,
  splitHighlights,
  type HealthTone,
} from '@sharpit/app/lib/nutrition/food-log/food-health-view';
import { cn } from '@sharpit/app/lib/utils';

/** The Sharpit food score on the web (ADR-063): badge, diet line, summary and full reading. */

const TONE_TEXT: Record<HealthTone, string> = {
  recovery: 'text-signal-recovery',
  neutral: 'text-signal-neutral',
  caution: 'text-signal-caution',
  risk: 'text-signal-risk',
  muted: 'text-muted-foreground',
  foreground: 'text-foreground',
};

const TONE_BADGE: Record<HealthTone, string> = {
  recovery: 'bg-signal-recovery/12 text-signal-recovery',
  neutral: 'bg-signal-neutral/12 text-signal-neutral',
  caution: 'bg-signal-caution/12 text-signal-caution',
  risk: 'bg-signal-risk/12 text-signal-risk',
  muted: 'bg-muted text-muted-foreground',
  foreground: 'bg-foreground/8 text-foreground',
};

/** A symbol per reason; an unknown key falls back on its tone. */
const HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  sugars: Box,
  salt: Waves,
  saturatedFat: Droplet,
  protein: Dumbbell,
  fiber: Leaf,
  ultra: Cog,
  unprocessed: Cog,
  additives: FlaskConical,
  additive: FlaskConical,
  energy: Flame,
  sports: Footprints,
  label: Info,
};

function highlightIcon(highlight: FoodHighlight): LucideIcon {
  const prefix = highlight.key.split('_')[0] ?? highlight.key;
  return HIGHLIGHT_ICONS[prefix] ?? (highlight.tone === 'negative' ? CircleX : CircleCheck);
}

const DIET_ICONS = { compatible: CircleCheck, uncertain: CircleHelp, incompatible: CircleX };

/** « 2,1 g/100 g » reads as a figure on the right; a sentence goes under the label. */
function isAmount(detail: string | null): detail is string {
  return detail !== null && detail.length <= 18;
}

/** Compact score for lists: the number in its grade's tone, a dash when there is none. */
export function FoodHealthBadge({ health }: { health: ServedFoodHealth | null | undefined }) {
  const score = health?.score ?? null;
  const label =
    score !== null && health?.grade
      ? `Score Sharpit ${score}, ${HEALTH_GRADE_LABELS[health.grade]}`
      : 'Score Sharpit indisponible';
  return (
    <span
      aria-label={label}
      role="img"
      className={cn(
        'text-data inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        TONE_BADGE[gradeTone(health?.grade)],
      )}
    >
      {score ?? '—'}
    </span>
  );
}

/** Under a food in a list: the declared diets it breaks. */
export function FoodDietConflict({ health }: { health: ServedFoodHealth | null | undefined }) {
  const conflicts = incompatibleDiets(health);
  if (conflicts.length === 0) {
    return null;
  }
  return (
    <span className="text-signal-risk inline-flex items-center gap-1 text-xs">
      <CircleX className="size-3.5 shrink-0" aria-hidden />
      Hors régime : {conflicts.map((fit) => fit.label).join(', ')}
    </span>
  );
}

/** The dial with the score, the grade in its tone, the verdict and where the grade comes from. */
export function FoodHealthSummary({ health }: { health: ServedFoodHealth }) {
  const sources = healthSources(health);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="relative w-24 shrink-0" aria-hidden>
          <TickSemicircle score={health.score} fill />
          <span className="text-data text-foreground absolute inset-x-0 top-[44%] text-center text-2xl font-medium tabular-nums">
            {health.score ?? '—'}
          </span>
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className={cn('text-card-title', TONE_TEXT[gradeTone(health.grade)])}>
            {health.grade ? HEALTH_GRADE_LABELS[health.grade] : 'Non noté'}
          </p>
          {healthVerdict(health).map((line) => (
            <p key={line} className="text-sm leading-snug">
              {line}
            </p>
          ))}
          {sources ? <p className="text-muted-foreground text-xs">{sources}</p> : null}
        </div>
      </div>
      <p className="sr-only">
        Score Sharpit {health.score ?? 'indisponible'} sur 100
        {health.grade ? `, ${HEALTH_GRADE_LABELS[health.grade]}` : ''}.
      </p>
      <FoodDietConflict health={health} />
    </div>
  );
}

function ReasonRow({ highlight }: { highlight: FoodHighlight }) {
  return (
    <li className="flex items-start gap-3 py-1.5 text-sm">
      {createElement(highlightIcon(highlight), {
        'aria-hidden': true,
        className: cn('mt-0.5 size-4 shrink-0', TONE_TEXT[highlightTone(highlight.tone)]),
      })}
      <div className="min-w-0 flex-1">
        <p className="leading-snug">{highlight.label}</p>
        {highlight.detail && !isAmount(highlight.detail) ? (
          <p className="text-muted-foreground text-xs">{highlight.detail}</p>
        ) : null}
      </div>
      {isAmount(highlight.detail) ? (
        <span className="text-muted-foreground text-data shrink-0 text-xs tabular-nums">
          {highlight.detail}
        </span>
      ) : null}
    </li>
  );
}

function DietRow({ fit }: { fit: DietFit }) {
  return (
    <li className="flex items-start gap-3 py-1.5 text-sm">
      {createElement(DIET_ICONS[fit.status], {
        'aria-hidden': true,
        className: cn('mt-0.5 size-4 shrink-0', TONE_TEXT[dietTone(fit.status)]),
      })}
      <div className="min-w-0">
        <p className="leading-snug">{fit.label}</p>
        <p className="text-muted-foreground text-xs">{fit.reason}</p>
      </div>
    </li>
  );
}

function ReadingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <p className="text-label text-muted-foreground">{title}</p>
      <ul className="divide-analysis-border/15 divide-y">{children}</ul>
    </section>
  );
}

function AdditivesDisclosure({
  health,
  completing,
}: {
  health: ServedFoodHealth;
  completing: boolean;
}) {
  const status = additiveStatus(health, completing);
  if (status) {
    return (
      <p className="text-muted-foreground flex items-center gap-3 text-sm">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        {status}
      </p>
    );
  }
  if (health.additives.length === 0) {
    return null;
  }
  const count = health.additives.length;
  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 outline-none">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        {count === 1 ? '1 additif' : `${count} additifs`}
      </summary>
      <ul className="mt-1.5 space-y-1 pl-7">
        {health.additives.map((additive) => (
          <li key={additive.code} className="flex justify-between gap-3">
            <span>
              {additive.code} · {additive.name}
            </span>
            <span
              className={cn(
                'shrink-0 text-xs',
                additive.risk === 'high' && 'text-signal-risk',
                additive.risk === 'limited' && 'text-signal-caution',
                additive.risk === 'none' && 'text-signal-recovery',
              )}
            >
              {{ none: 'Sans risque', limited: 'Risque limité', high: 'À risque' }[additive.risk]}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The full reading below the summary: diets, notes, what to watch, strengths, additives and how
 * the score is computed.
 */
export function FoodHealthDetails({
  health,
  completing = false,
}: {
  health: ServedFoodHealth;
  /** The product is being read by barcode to complete a search hit's additives. */
  completing?: boolean;
}) {
  const { watch, strengths, notes } = splitHighlights(health);
  const dietFit = health.dietFit ?? [];
  return (
    <div className="space-y-4">
      {dietFit.length > 0 ? (
        <ReadingGroup title="Mon régime">
          {dietFit.map((fit) => (
            <DietRow key={fit.diet} fit={fit} />
          ))}
        </ReadingGroup>
      ) : null}
      {notes.length > 0 ? (
        <ul>
          {notes.map((note) => (
            <ReasonRow key={note.key} highlight={note} />
          ))}
        </ul>
      ) : null}
      {watch.length > 0 ? (
        <ReadingGroup title="À surveiller">
          {watch.map((item) => (
            <ReasonRow key={item.key} highlight={item} />
          ))}
        </ReadingGroup>
      ) : null}
      {strengths.length > 0 ? (
        <ReadingGroup title="Points forts">
          {strengths.map((item) => (
            <ReasonRow key={item.key} highlight={item} />
          ))}
        </ReadingGroup>
      ) : null}
      <div className="space-y-2">
        <AdditivesDisclosure completing={completing} health={health} />
        <details className="text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-3 outline-none">
            <Info className="size-4 shrink-0" aria-hidden />
            Comment est calculé le score ?
          </summary>
          <p className="text-muted-foreground mt-1.5 pl-7 text-xs">
            {health.coverage === 'partial' ? HEALTH_PARTIAL_METHOD : HEALTH_METHOD}
          </p>
        </details>
      </div>
      <p className="text-muted-foreground text-[11px]">{HEALTH_DISCLAIMER}</p>
    </div>
  );
}
