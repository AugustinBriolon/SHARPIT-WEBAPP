/**
 * Athlete-facing CoachAction labels (Kotcha-style apply / revise / dismiss).
 */

export const COACH_ACTION_LABELS_FR = {
  apply: 'Appliquer',
  revise: 'Modifier',
  dismiss: 'Ignorer',
  applyDelete: 'Confirmer la suppression',
  keep: 'Garder',
} as const;

export type CoachActionKind = keyof typeof COACH_ACTION_LABELS_FR;
