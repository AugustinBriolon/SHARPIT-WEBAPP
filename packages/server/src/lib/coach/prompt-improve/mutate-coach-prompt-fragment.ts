/**
 * Catalogued, deterministic mutations for offline coach-prompt self-improve.
 * One mutation per evaluate call — never compose silently.
 */

import { COACH_COPY_DASH_RULE } from '@sharpit/app/lib/coach/sanitize-coach-copy';
import { DAY_LOAD_VS_STATUS_COACH_LINE } from '@sharpit/server/lib/coach/context/coach-context-format';

export const CONFIDENCE_REFUSE_COACH_LINE =
  'Quand la confiance est faible ou insuffisante, refuse les prescriptions dures et reste prudent et factuel.';

export const MEDICAL_BOUNDARY_COACH_LINE =
  'Ne pose jamais de diagnostic médical et ne remplace pas un médecin ou un kiné.';

export type CoachPromptMutationId =
  | 'add-day-load-vocab'
  | 'add-confidence-refuse'
  | 'add-medical-boundary'
  | 'add-dash-rule'
  | 'weaken-day-load';

export type CoachPromptMutation = {
  readonly id: CoachPromptMutationId;
  readonly description: string;
  readonly apply: (text: string) => string;
};

function appendLine(text: string, line: string): string {
  if (text.includes(line)) {
    return text;
  }
  const trimmed = text.trimEnd();
  return trimmed.length === 0 ? line : `${trimmed}\n${line}`;
}

function stripLinesMatching(text: string, pattern: RegExp): string {
  return text
    .split('\n')
    .filter((line) => !pattern.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const COACH_PROMPT_MUTATIONS: readonly CoachPromptMutation[] = [
  {
    id: 'add-day-load-vocab',
    description: 'Append day-load vs training-status vocabulary line',
    apply: (text) => appendLine(text, DAY_LOAD_VS_STATUS_COACH_LINE),
  },
  {
    id: 'add-confidence-refuse',
    description: 'Append low-confidence refuse line',
    apply: (text) => appendLine(text, CONFIDENCE_REFUSE_COACH_LINE),
  },
  {
    id: 'add-medical-boundary',
    description: 'Append medical non-diagnosis boundary',
    apply: (text) => appendLine(text, MEDICAL_BOUNDARY_COACH_LINE),
  },
  {
    id: 'add-dash-rule',
    description: 'Append athlete-facing dash punctuation rule',
    apply: (text) => appendLine(text, COACH_COPY_DASH_RULE),
  },
  {
    id: 'weaken-day-load',
    description: 'Remove day-load vocabulary (expected rollback)',
    apply: (text) => stripLinesMatching(text, /charge du jour|statut d['']entraînement/i),
  },
];

export function applyCoachPromptMutation(text: string, mutationId: CoachPromptMutationId): string {
  const mutation = COACH_PROMPT_MUTATIONS.find((entry) => entry.id === mutationId);
  if (!mutation) {
    throw new Error(`Unknown coach prompt mutation: ${mutationId}`);
  }
  return mutation.apply(text);
}
