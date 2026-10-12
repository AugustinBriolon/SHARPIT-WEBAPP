import type { CoachDiscussTarget } from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-href';
import {
  activityStatusLabel,
  type ActivityStatusId,
} from '@sharpit/app/lib/health/activity-status';

/**
 * Plain-language description of the context attached to a coach conversation.
 *
 * The Information Architecture requires a contextual conversation to name what
 * it carries, and to let the athlete drop it before sending. The chip built
 * from this is that contract: `label` is what the athlete reads; dismiss is
 * always optional. `sourceHref` identifies the originating surface for callers.
 */
export type CoachDiscussContext = {
  kind: CoachDiscussTarget['kind'];
  /** What the conversation is about — travels to the server as message metadata. */
  target: CoachDiscussTarget;
  /** What is attached, in the athlete's words. */
  label: string;
  /** Surface the context came from, so it can be reviewed or changed. */
  sourceHref: string;
};

const HORIZON_LABEL: Record<number, string> = {
  1: 'demain',
  3: 'les 3 prochains jours',
  7: 'les 7 prochains jours',
  14: 'les 14 prochains jours',
};

/** Planning window in plain French — shared by the chip and the coach prompt. */
export function planningHorizonLabel(horizonDays: number): string {
  return HORIZON_LABEL[horizonDays] ?? `${horizonDays} jours`;
}

type DiscussChipCopy = Pick<CoachDiscussContext, 'label' | 'sourceHref'>;

/**
 * `name` is the resolved human name of the target — a session title, a goal,
 * a record family. Callers pass what they already loaded; when it is missing
 * the label degrades to the kind alone rather than inventing one.
 */
function discussChipCopy(target: CoachDiscussTarget, named: string | null): DiscussChipCopy {
  const handlers: {
    [K in CoachDiscussTarget['kind']]: (
      t: Extract<CoachDiscussTarget, { kind: K }>,
      n: string | null,
    ) => DiscussChipCopy;
  } = {
    today: () => ({ label: 'Ton état du jour', sourceHref: '/' }),
    'morning-brief': () => ({
      label: 'Brief du matin',
      sourceHref: '/',
    }),
    'planned-session': (_, n) => ({
      label: n ? `Séance prévue · ${n}` : 'Une séance prévue',
      sourceHref: '/plan/semaine',
    }),
    activity: (t, n) => ({
      label: n ? `Séance réalisée · ${n}` : 'Une séance réalisée',
      sourceHref: `/activite/${t.activityId}`,
    }),
    planning: (t) => ({
      label: `Ta semaine · ${planningHorizonLabel(t.horizonDays)}`,
      sourceHref: '/plan/semaine',
    }),
    goal: (_, n) => ({
      label: n ? `Objectif · ${n}` : 'Un objectif',
      sourceHref: '/moi/objectifs',
    }),
    record: (_, n) => ({
      label: n ? `Records · ${n}` : 'Tes records',
      sourceHref: '/moi/performance',
    }),
    'physical-condition': (_, n) => ({
      label: n ? `Contrainte physique · ${n}` : 'Une contrainte physique',
      sourceHref: '/moi/corps',
    }),
    'journal-analyses': () => ({
      label: 'Analyses journal',
      sourceHref: '/journal/analyses',
    }),
    nutrition: (t) => ({
      label: 'Ta nutrition du jour',
      sourceHref: `/nutrition?day=${t.trainingDayId}`,
    }),
  };
  return handlers[target.kind](target as never, named);
}

export function describeCoachDiscussContext(
  target: CoachDiscussTarget,
  name?: string | null,
): CoachDiscussContext {
  return { kind: target.kind, target, ...discussChipCopy(target, name?.trim() || null) };
}

/** Append athlete activity mode to discuss chips (client presentation layer). */
export function enrichDiscussContextWithActivityStatus(
  context: CoachDiscussContext,
  status: ActivityStatusId | null | undefined,
): CoachDiscussContext {
  if (!status || status === 'active') {
    return context;
  }
  if (context.kind !== 'today' && context.kind !== 'planning') {
    return context;
  }
  return {
    ...context,
    label: `${context.label} · ${activityStatusLabel(status)}`,
  };
}

/**
 * Travels with the athlete's message so the server knows which surface — and
 * which session, goal, record… — the conversation is about. Mirrors
 * `CoachDiscussTarget` with `discussKind` as the discriminant. Client-supplied,
 * so the server shape-checks it, scopes every lookup to the signed-in athlete,
 * and re-checks any entitlement tied to a kind before acting on it.
 */
export type CoachDiscussMetadata = CoachDiscussTarget extends infer T
  ? T extends { kind: infer K }
    ? { discussKind: K } & Omit<T, 'kind'>
    : never
  : never;

export function coachDiscussMetadata(
  context: CoachDiscussContext | null | undefined,
): CoachDiscussMetadata | undefined {
  if (!context) {
    return undefined;
  }
  const { kind, ...targetFields } = context.target;
  return { discussKind: kind, ...targetFields } as CoachDiscussMetadata;
}
