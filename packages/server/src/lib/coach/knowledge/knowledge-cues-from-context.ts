/**
 * Derive RAG quality / situation cues from plan focus and twin-ish signals.
 * Pure — no I/O.
 */

import {
  deriveWeekQuality,
  weekQualityLabelFr,
} from '@sharpit/app/lib/training/periodization/week-quality';
import type { CoachKnowledgeSituation } from '@sharpit/server/lib/coach/knowledge/build-query';

export function resolveCoachKnowledgeSituation(input: {
  focus?: string | null;
  verdict?: string | null;
  limitingFactor?: string | null;
  hasActivePain?: boolean;
}): CoachKnowledgeSituation | null {
  if (input.hasActivePain || /pain|douleur|blessure|injury/i.test(input.limitingFactor ?? '')) {
    return 'pain';
  }
  if (/reprise|retour\s+blessure|return/i.test(input.focus ?? '')) {
    return 'return';
  }
  if (
    input.verdict === 'RECOVER' ||
    /absence|manque|missed|gap/i.test(input.focus ?? '') ||
    /FATIGUE|RECOVERY/i.test(input.limitingFactor ?? '')
  ) {
    // Fatigue alone is not always absence — only tag absence when focus says so.
    if (/absence|manque|missed|semaines?\s+manqu/i.test(input.focus ?? '')) {
      return 'absence';
    }
  }
  if (/absence|manque|missed/i.test(input.focus ?? '')) {
    return 'absence';
  }
  return null;
}

export function resolveCoachKnowledgeQuality(input: {
  focus?: string | null;
  planPhase?: string | null;
  isDeload?: boolean;
}): string {
  const code = deriveWeekQuality(input);
  return `${code} ${weekQualityLabelFr(code)}`;
}
