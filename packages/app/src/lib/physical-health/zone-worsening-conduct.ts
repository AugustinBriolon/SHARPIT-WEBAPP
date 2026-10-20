/**
 * What to do when a declared zone gets worse (ADR-100). The coach used to see « tendance en
 * aggravation » and improvise: some answers cut the sport, some suggested stretching through it,
 * none said when to see someone. The conduct is decided here, from the readings; the model only
 * words it.
 *
 * Pure: no I/O, no React.
 */

import { movementById } from '@sharpit/app/lib/exercises/movement-taxonomy';
import {
  catalogGroupsForRegion,
  type CatalogBodyPart,
} from '@sharpit/app/lib/physical-health/sensitive-zones';
import {
  zoneSeverityTrend,
  type FollowedZone,
} from '@sharpit/app/lib/physical-health/zone-follow-up';

/** From this severity, or this many points up in the readings fitted, the advice is to see someone. */
export const REFER_SEVERITY = 7;
/** A zone open this long without improving is past what training changes alone can settle. */
export const REFER_OPEN_DAYS = 21;
const DAY_MS = 86_400_000;

export type WorseningZone = FollowedZone & {
  title: string;
  bodyPart: string | null;
  /** When the zone was declared: how long it has been open. */
  startDate?: Date | string | null;
};

export type ZoneConduct = {
  zone: string;
  /** The sports that load the zone, to reduce first. */
  reduceSports: string[];
  /** Taxonomy movements to add around the zone, by French label. */
  supportExercises: string[];
  /** Why the athlete should see a professional, or null. */
  referral: string | null;
};

const SPORT_LABELS: Readonly<Record<string, string>> = {
  RUN: 'course',
  BIKE: 'vélo',
  SWIM: 'natation',
};

/** Same grouping as `sportZoneConflicts`: which sports load which groups. */
const SPORTS_BY_GROUP: Readonly<Partial<Record<CatalogBodyPart, readonly string[]>>> = {
  'lower legs': ['RUN'],
  'upper legs': ['RUN', 'BIKE'],
  shoulders: ['SWIM'],
  back: ['SWIM'],
};

/**
 * Taxonomy ids that support a group without loading it hard: isometric, hip and core control,
 * mobility. Chosen from `movement-taxonomy.json`; an id that disappears is skipped.
 */
const SUPPORT_BY_GROUP: Readonly<Partial<Record<CatalogBodyPart, readonly string[]>>> = {
  'upper legs': ['chaise-murale', 'pont-fessier', 'clamshell', 'etirement-flechisseur-hanche'],
  'lower legs': ['mollet-debout', 'etirement-mollet', 'pont-fessier'],
  back: ['bird-dog', 'dead-bug', 'etirement-chat-vache'],
  waist: ['dead-bug', 'planche-laterale', 'pallof-press'],
  shoulders: ['tirage-face', 'rotation-thoracique'],
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function openDays(zone: WorseningZone, now: Date): number | null {
  if (!zone.startDate) {
    return null;
  }
  const start = zone.startDate instanceof Date ? zone.startDate : new Date(zone.startDate);
  return Math.floor((now.getTime() - start.getTime()) / DAY_MS);
}

function referral(zone: WorseningZone, now: Date): string | null {
  if (zone.functionalImpact === 'STOPPED') {
    return 'elle empêche de s’entraîner';
  }
  if ((zone.severity ?? 0) >= REFER_SEVERITY) {
    return `sévérité ${zone.severity}/10`;
  }
  const days = openDays(zone, now);
  return days !== null && days >= REFER_OPEN_DAYS ? `ouverte depuis ${days} jours` : null;
}

/** The conduct for one zone, or null when it is not getting worse. */
export function zoneWorseningConduct(zone: WorseningZone, now: Date): ZoneConduct | null {
  if (!zone.affectsTraining || zoneSeverityTrend(zone.checkins ?? []) !== 'worsening') {
    return null;
  }
  const groups = catalogGroupsForRegion(zone.bodyPart ?? zone.title);
  return {
    zone: zone.title,
    reduceSports: unique(groups.flatMap((group) => SPORTS_BY_GROUP[group] ?? [])).map(
      (sport) => SPORT_LABELS[sport] ?? sport,
    ),
    supportExercises: unique(groups.flatMap((group) => SUPPORT_BY_GROUP[group] ?? []))
      .map((id) => movementById(id)?.labels[0])
      .filter((label): label is string => Boolean(label)),
    referral: referral(zone, now),
  };
}

function conductLine(conduct: ZoneConduct): string {
  const reduce =
    conduct.reduceSports.length > 0
      ? `réduis d’abord ${conduct.reduceSports.join(' et ')} (volume −30 à −50 %, pas d’intensité) cette semaine`
      : 'réduis le volume qui la sollicite cette semaine';
  const support =
    conduct.supportExercises.length > 0
      ? ` ; ajoute autour : ${conduct.supportExercises.join(', ')}`
      : '';
  const refer = conduct.referral
    ? ` ; conseille un avis médical ou kiné (${conduct.referral})`
    : ' ; si elle s’aggrave encore à la prochaine mesure, conseille un avis médical ou kiné';
  return `- ${conduct.zone} : ${reduce}${support}${refer}.`;
}

/** The block for every worsening zone; empty string when none is. */
export function formatZoneWorseningConduct(zones: readonly WorseningZone[], now: Date): string {
  const conducts = zones.flatMap((zone) => {
    const conduct = zoneWorseningConduct(zone, now);
    return conduct ? [conduct] : [];
  });
  if (conducts.length === 0) {
    return '';
  }
  return [
    '\n## Zones en aggravation : conduite à tenir (décidée par SHARPIT)',
    ...conducts.map(conductLine),
    'Applique cette conduite telle quelle et explique-la simplement ; ne la contredis pas et ne pose jamais de diagnostic.',
  ].join('\n');
}
