/**
 * The lifecycle of a declared sensitive zone (ADR-068): what training does with it, when
 * to propose closing it, and how often it came back.
 *
 * A declaration used to have one consequence — "never load this" — for as long as it stayed
 * open, and nothing ever proposed to close it: a pain at 0/10 for six weeks still flagged
 * every run. The strategy below grades the consequence by what the athlete says they can do,
 * and the resolution rule turns a run of silent check-ins into a question.
 *
 * Pure: no I/O, no React.
 */

/** What the plan does with a zone. */
export type ZoneStrategy = 'protect' | 'progressive' | 'correct' | 'relapse_watch' | 'none';

export type ZoneCheckin = {
  date: Date | string;
  severity: number | null;
  /** Set when the point records a status change; null or absent for a plain follow-up. */
  status?: string | null;
};

export type FollowedZone = {
  category: string;
  status: string;
  severity: number | null;
  functionalImpact?: string | null;
  affectsTraining: boolean;
  resolvedAt: Date | string | null;
  checkins?: readonly ZoneCheckin[];
};

/** A resolved pain stays worth a sentence in the prompt this long: relapses come early. */
export const RELAPSE_WATCH_DAYS = 42;
/** Silent check-ins must cover this span before closing the zone is proposed. */
export const RESOLUTION_QUIET_DAYS = 14;
/** …and there must be at least this many of them: one zero is a good day, not a recovery. */
export const RESOLUTION_MIN_CHECKINS = 2;
/** From this severity, a zone is protected whatever its status says. */
export const PROTECT_SEVERITY = 5;

const DAY_MS = 86_400_000;
const CORRECTIVE_CATEGORIES = new Set(['POSTURE', 'MOBILITY']);
const LIMITING_IMPACTS = new Set(['LIMITING', 'STOPPED']);
const EASED_STATUSES = new Set(['MONITORING', 'STABLE', 'IMPROVING']);
const RELAPSE_CATEGORIES = new Set(['PAIN', 'INJURY']);

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function isResolved(zone: Pick<FollowedZone, 'status'>): boolean {
  return zone.status.toUpperCase() === 'RESOLVED';
}

function resolvedRecently(zone: FollowedZone, now: Date): boolean {
  if (!zone.resolvedAt || !RELAPSE_CATEGORIES.has(zone.category.toUpperCase())) {
    return false;
  }
  return now.getTime() - toTime(zone.resolvedAt) <= RELAPSE_WATCH_DAYS * DAY_MS;
}

function isLimiting(zone: Pick<FollowedZone, 'severity' | 'functionalImpact'>): boolean {
  if (zone.functionalImpact && LIMITING_IMPACTS.has(zone.functionalImpact)) {
    return true;
  }
  return (zone.severity ?? 0) >= PROTECT_SEVERITY;
}

/** An open symptomatic zone: protected, unless the athlete says it has eased. */
function symptomaticStrategy(zone: FollowedZone): ZoneStrategy {
  if (isLimiting(zone)) {
    return 'protect';
  }
  if (EASED_STATUSES.has(zone.status.toUpperCase())) {
    return 'progressive';
  }
  if (zone.severity === 0 || zone.functionalImpact === 'NONE') {
    return 'progressive';
  }
  return 'protect';
}

/**
 * - **protect**: a symptomatic zone that still hurts or limits — never load it directly.
 * - **progressive**: under watch, or open but silent — load it, gradually.
 * - **correct**: posture or mobility — the zone is a target of the work, not a no-go.
 * - **relapse_watch**: a pain or injury closed less than six weeks ago.
 */
export function zoneStrategy(zone: FollowedZone, now: Date): ZoneStrategy {
  if (!zone.affectsTraining) {
    return 'none';
  }
  if (isResolved(zone)) {
    return resolvedRecently(zone, now) ? 'relapse_watch' : 'none';
  }
  if (CORRECTIVE_CATEGORIES.has(zone.category.toUpperCase())) {
    return 'correct';
  }
  return symptomaticStrategy(zone);
}

export const ZONE_STRATEGY_LABELS: Record<ZoneStrategy, string> = {
  protect: 'À protéger',
  progressive: 'Reprise progressive',
  correct: 'À corriger',
  relapse_watch: 'Vigilance rechute',
  none: 'Sans effet sur l’entraînement',
};

/** What the strategy means for the athlete's plan, in one sentence. */
export const ZONE_STRATEGY_DETAILS: Record<ZoneStrategy, string> = {
  protect: 'Aucun exercice ne la charge directement : le renfo travaille autour.',
  progressive: 'Elle peut être sollicitée, avec un volume qui remonte par paliers.',
  correct: 'Les séances de renfo et de mobilité la travaillent pour la corriger.',
  relapse_watch: 'Résolue récemment : le plan évite les pics de charge brutaux.',
  none: 'Elle n’entre pas dans la génération des séances.',
};

function newestFirst(checkins: readonly ZoneCheckin[]): ZoneCheckin[] {
  return [...checkins].sort((a, b) => toTime(b.date) - toTime(a.date));
}

/** The most recent run of 0/10 readings; points without a severity are skipped, not breaks. */
function quietRun(checkins: readonly ZoneCheckin[]): ZoneCheckin[] {
  const run: ZoneCheckin[] = [];
  for (const checkin of newestFirst(checkins)) {
    if (checkin.severity === null) {
      continue;
    }
    if (checkin.severity !== 0) {
      break;
    }
    run.push(checkin);
  }
  return run;
}

/**
 * True when every reading of the last two weeks or more says 0/10: time to ask whether the
 * zone is behind the athlete. Never closes it on its own — resolving is a declaration.
 */
export function resolutionSuggested(zone: FollowedZone, now: Date): boolean {
  if (isResolved(zone)) {
    return false;
  }
  const run = quietRun(zone.checkins ?? []);
  const oldest = run.at(-1);
  if (run.length < RESOLUTION_MIN_CHECKINS || !oldest) {
    return false;
  }
  return now.getTime() - toTime(oldest.date) >= RESOLUTION_QUIET_DAYS * DAY_MS;
}

/** How many times a resolved zone was reopened. */
export function recurrenceCount(checkins: readonly ZoneCheckin[]): number {
  const changes = [...checkins]
    .filter((checkin) => checkin.status)
    .sort((a, b) => toTime(a.date) - toTime(b.date));
  let count = 0;
  let previous: string | null = null;
  for (const { status } of changes) {
    if (status === 'ACTIVE' && previous === 'RESOLVED') {
      count += 1;
    }
    previous = status ?? previous;
  }
  return count;
}

export const FUNCTIONAL_IMPACT_LABELS: Record<string, string> = {
  NONE: 'Aucune gêne',
  MILD: 'Gêne légère',
  MODERATE: 'Gêne modérée',
  LIMITING: 'Limite l’entraînement',
  STOPPED: 'Empêche de s’entraîner',
};

/** The words a status change carries on the timeline; reopening a resolved zone is a relapse. */
export function statusChangeLabel(status: string, previous: string | null): string {
  if (status === 'RESOLVED') {
    return 'Résolue';
  }
  if (status === 'MONITORING') {
    return 'Passée sous surveillance';
  }
  return previous === 'RESOLVED' ? 'Rechute' : 'Remise en cours';
}
