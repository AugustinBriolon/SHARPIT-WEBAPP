/**
 * Typed absence / pain playbook actions (Campus/Kotcha-style).
 * See knowledge/absence-and-pain-playbooks.md and ADR-083.
 */

export const PLAYBOOK_ACTIONS = ['CONTINUE', 'LIGHTEN', 'POSTPONE', 'RESTART', 'PAUSE'] as const;

export type PlaybookAction = (typeof PLAYBOOK_ACTIONS)[number];

export const PLAYBOOK_ACTION_LABELS_FR: Record<PlaybookAction, string> = {
  CONTINUE: 'Continuer',
  LIGHTEN: 'Alléger',
  POSTPONE: 'Reporter',
  RESTART: 'Reprendre progressivement',
  PAUSE: 'Mettre en pause',
};

export function isPlaybookAction(value: unknown): value is PlaybookAction {
  return typeof value === 'string' && (PLAYBOOK_ACTIONS as readonly string[]).includes(value);
}

/** Maps a playbook choice to a temporary training-capacity constraint when applicable. */
export function playbookTrainingConstraint(
  action: PlaybookAction,
): 'FULL' | 'REDUCED' | 'MOBILITY_ONLY' | 'NONE' | null {
  switch (action) {
    case 'LIGHTEN':
      return 'REDUCED';
    case 'PAUSE':
      return 'NONE';
    case 'CONTINUE':
    case 'POSTPONE':
    case 'RESTART':
      return null;
  }
}

/** After apply, the athlete should regenerate the week (or discuss regen with coach). */
export function playbookSuggestsRegenerateWeek(action: PlaybookAction): boolean {
  return (
    action === 'LIGHTEN' || action === 'RESTART' || action === 'POSTPONE' || action === 'PAUSE'
  );
}
