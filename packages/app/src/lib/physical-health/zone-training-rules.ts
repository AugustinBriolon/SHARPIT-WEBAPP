/**
 * The prompt block that tells plan and adapt generation what to do with each declared zone
 * (ADR-068). Before, only open pains and injuries reached the prompt, as zones never to load;
 * posture and mobility zones — the ones the athlete wants worked on — reached nothing.
 *
 * Pure: no I/O, no React.
 */

import {
  catalogGroupsForRegion,
  formatSensitiveZoneRules,
  zoneLine,
  type SensitiveZone,
} from '@sharpit/app/lib/physical-health/sensitive-zones';
import {
  zoneStrategy,
  type FollowedZone,
  type ZoneStrategy,
} from '@sharpit/app/lib/physical-health/zone-follow-up';

/** A declared zone as generation reads it: its follow-up state plus how it was named. */
export type TrainingZone = FollowedZone & {
  title: string;
  bodyPart: string | null;
  side: string | null;
  description?: string | null;
};

function toSensitiveZone(zone: TrainingZone): SensitiveZone {
  const region = zone.bodyPart ?? zone.title;
  return {
    label: zone.title,
    region,
    side: zone.side && zone.side !== 'NA' ? zone.side : null,
    severity: zone.severity,
    groups: catalogGroupsForRegion(region),
  };
}

function frenchDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function correctiveLine(zone: TrainingZone): string {
  const why = zone.description?.trim() ? ` : ${zone.description.trim()}` : '';
  return `${zoneLine(toSensitiveZone(zone))}${why}`;
}

/** No severity: a resolved zone's last reading says nothing about today. */
function relapseLine(zone: TrainingZone): string {
  const when = zone.resolvedAt ? `, résolue le ${frenchDate(zone.resolvedAt)}` : '';
  return `${zoneLine({ ...toSensitiveZone(zone), severity: null })}${when}`;
}

function section(title: string, lines: string[], rule: string): string[] {
  return lines.length === 0 ? [] : [`\n## ${title}`, ...lines, rule];
}

export function zonesByStrategy(
  zones: readonly TrainingZone[],
  now: Date,
): Record<ZoneStrategy, TrainingZone[]> {
  const grouped: Record<ZoneStrategy, TrainingZone[]> = {
    protect: [],
    progressive: [],
    correct: [],
    relapse_watch: [],
    none: [],
  };
  for (const zone of zones) {
    grouped[zoneStrategy(zone, now)].push(zone);
  }
  return grouped;
}

/**
 * One block per strategy, empty string when no declared zone touches training — the prompt
 * stays short for everyone else.
 */
export function formatZoneTrainingRules(zones: readonly TrainingZone[], now: Date): string {
  const grouped = zonesByStrategy(zones, now);
  return [
    formatSensitiveZoneRules(grouped.protect.map(toSensitiveZone)),
    ...section(
      'Zones en reprise progressive',
      grouped.progressive.map((zone) => zoneLine(toSensitiveZone(zone))),
      'Ces zones peuvent être sollicitées, progressivement : volume réduit, ni pliométrie ni excentrique lourd dessus, et une charge qui remonte par paliers d’une semaine à l’autre.',
    ),
    ...section(
      'Zones à corriger (posture, mobilité)',
      grouped.correct.map(correctiveLine),
      'Ces zones sont une CIBLE, pas un interdit : chaque séance STRENGTH ou MOBILITY inclut au moins un exercice correctif pour l’une d’elles (renforcement des muscles qui la tiennent, mobilité de la zone), nommé dans la description de la séance.',
    ),
    ...section(
      'Zones résolues récemment (vigilance rechute)',
      grouped.relapse_watch.map(relapseLine),
      'Pas de pic brutal de volume ou d’intensité qui les sollicite ; garde un peu de travail préventif autour.',
    ),
  ]
    .filter((part) => part !== '')
    .join('\n');
}
