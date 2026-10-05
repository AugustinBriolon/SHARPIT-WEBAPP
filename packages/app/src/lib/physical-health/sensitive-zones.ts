/**
 * Binds the athlete's sensitive zones to the exercises a session prescribes.
 *
 * The coach context already names the zones ("zone Ischio (Gauche)"), and the
 * prompt already says never to aggravate a sensitive zone — but the strength
 * rules are the same for everyone, and nothing checked afterwards that a
 * prescribed exercise avoided the injured region. This module is the missing
 * link between a condition and the exercise catalog.
 *
 * Pure: no I/O, no React.
 */

import { zoneStrategy } from '@sharpit/app/lib/physical-health/zone-follow-up';

/** Catalog body groups, as they appear in `src/data/exercises-catalog.json`. */
export type CatalogBodyPart =
  | 'upper legs'
  | 'lower legs'
  | 'back'
  | 'waist'
  | 'chest'
  | 'shoulders'
  | 'upper arms'
  | 'lower arms'
  | 'neck'
  | 'cardio';

/** Anything that carries a body region — coach context, gate context or legacy note. */
export type ZoneCondition = {
  label?: string | null;
  title?: string | null;
  bodyRegion?: string | null;
  bodyPart?: string | null;
  side?: string | null;
  severity?: number | null;
  type?: string | null;
  category?: string | null;
  affectsTraining?: boolean | null;
  status?: string | null;
  functionalImpact?: string | null;
};

export type SensitiveZone = {
  label: string;
  region: string;
  side: string | null;
  severity: number | null;
  /** Catalog groups this zone loads — empty when the region is unknown to the catalog. */
  groups: CatalogBodyPart[];
};

/**
 * French regions the athlete actually writes, mapped onto the catalog's coarse
 * groups. A knee spans both thigh and calf work: err on the side of naming one
 * group too many, since the consequence is a warning, not a rejection.
 */
const REGION_GROUPS: ReadonlyArray<{
  match: readonly string[];
  groups: readonly CatalogBodyPart[];
}> = [
  {
    match: ['ischio', 'cuisse', 'quadriceps', 'adducteur', 'psoas', 'fessier', 'hanche'],
    groups: ['upper legs'],
  },
  { match: ['genou', 'rotule', 'patellaire'], groups: ['upper legs', 'lower legs'] },
  {
    match: ['mollet', 'achille', 'tibia', 'cheville', 'pied', 'plantaire', 'orteil'],
    groups: ['lower legs'],
  },
  { match: ['bassin', 'sacro', 'abdo', 'gainage', 'core', 'oblique'], groups: ['waist'] },
  { match: ['lombaire', 'dos', 'rachis', 'dorsale', 'thoracique', 'trapeze'], groups: ['back'] },
  { match: ['epaule', 'coiffe', 'deltoide', 'acromio'], groups: ['shoulders'] },
  // Before the neck: « coude » contains « cou ».
  { match: ['coude', 'poignet', 'avant-bras', 'main'], groups: ['lower arms'] },
  { match: ['cou', 'nuque', 'cervicale'], groups: ['neck'] },
  { match: ['bras', 'biceps', 'triceps'], groups: ['upper arms'] },
  { match: ['pectoraux', 'poitrine', 'thorax', 'sternum'], groups: ['chest'] },
];

const SYMPTOMATIC = new Set(['PAIN', 'INJURY']);

export function normalizeRegion(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Catalog groups a region loads. Empty when nothing matches — never guess. */
export function catalogGroupsForRegion(region: string | null | undefined): CatalogBodyPart[] {
  if (!region) {
    return [];
  }
  const normalized = normalizeRegion(region);
  const entry = REGION_GROUPS.find(({ match }) => match.some((word) => normalized.includes(word)));
  return entry ? [...entry.groups] : [];
}

/**
 * A pain or an injury the plan must not load: its strategy is `protect` (ADR-068). A zone
 * under watch, or open but silent, is loaded progressively and no longer flagged.
 */
function isProtected(condition: ZoneCondition): boolean {
  const kind = (condition.type ?? condition.category ?? '').toUpperCase();
  if (!SYMPTOMATIC.has(kind)) {
    return false;
  }
  const strategy = zoneStrategy(
    {
      category: kind,
      status: condition.status ?? 'ACTIVE',
      severity: condition.severity ?? null,
      functionalImpact: condition.functionalImpact ?? null,
      affectsTraining: condition.affectsTraining !== false,
      resolvedAt: null,
    },
    new Date(),
  );
  return strategy === 'protect';
}

function zoneSide(side: string | null | undefined): string | null {
  return side && side !== 'NA' ? side : null;
}

/** One condition as a protectable zone, or null when it names no region. */
function toZone(condition: ZoneCondition): SensitiveZone | null {
  const region = condition.bodyRegion ?? condition.bodyPart ?? null;
  if (!region) {
    return null;
  }
  return {
    label: condition.label ?? condition.title ?? region,
    region,
    side: zoneSide(condition.side),
    severity: condition.severity ?? null,
    groups: catalogGroupsForRegion(region),
  };
}

/** Pains and injuries the plan must spare, with their catalog groups. */
export function sensitiveZonesFrom(
  conditions: readonly ZoneCondition[] | null | undefined,
): SensitiveZone[] {
  if (!conditions) {
    return [];
  }
  return conditions.filter(isProtected).flatMap((condition) => {
    const zone = toZone(condition);
    return zone ? [zone] : [];
  });
}

/**
 * The zone an exercise would load, when it is one the athlete is protecting.
 *
 * Takes a load profile rather than a body group: mobility work on a sensitive
 * zone is prehab, not aggravation, and must never be flagged as loading it.
 */
export function exerciseZoneConflict(
  profile: { groups: readonly string[]; loads: boolean } | null | undefined,
  zones: readonly SensitiveZone[],
): SensitiveZone | null {
  if (!profile?.loads || profile.groups.length === 0) {
    return null;
  }
  const loaded = new Set(profile.groups.map(normalizeRegion));
  return (
    zones.find((zone) => zone.groups.some((group) => loaded.has(normalizeRegion(group)))) ?? null
  );
}

/**
 * Body groups an endurance sport loads, as a whole.
 *
 * Endurance sessions carry no per-exercise structure, so the sport itself is the
 * only handle. Coarse on purpose: a declared knee is relevant to every run, and
 * saying so is the point — the previous version stayed silent on a bike-and-run
 * week, which is most weeks in a triathlon block.
 */
const SPORT_GROUPS: Readonly<Record<string, readonly CatalogBodyPart[]>> = {
  RUN: ['lower legs', 'upper legs'],
  BIKE: ['upper legs'],
  SWIM: ['shoulders', 'back'],
};

/** Zones an endurance session would load by virtue of its sport. Strength is judged per exercise. */
export function sportZoneConflicts(
  sport: string | null | undefined,
  zones: readonly SensitiveZone[],
): SensitiveZone[] {
  const groups = sport ? SPORT_GROUPS[sport] : undefined;
  if (!groups) {
    return [];
  }
  const loaded = new Set(groups.map(normalizeRegion));
  return zones.filter((zone) => zone.groups.some((group) => loaded.has(normalizeRegion(group))));
}

/** Worst first — an 8/10 deserves to lead the sentence a 1/10 also appears in. */
export function bySeverityDesc(a: SensitiveZone, b: SensitiveZone): number {
  return (b.severity ?? 0) - (a.severity ?? 0);
}

const SIDE_WORDS: Readonly<Record<string, string>> = {
  LEFT: 'gauche',
  RIGHT: 'droite',
  BILATERAL: 'des deux côtés',
};

/**
 * One zone, named the way the athlete declared it: side and severity included.
 *
 * Side cannot filter anything — a prescription never says which leg, and a
 * unilateral movement is done on both — but naming it tells the athlete which
 * side to protect, which is the part they can act on.
 */
export function describeZone(zone: SensitiveZone): string {
  const bits = [
    zone.side ? (SIDE_WORDS[zone.side.toUpperCase()] ?? zone.side.toLowerCase()) : null,
    zone.severity !== null ? `sévérité ${zone.severity}/10` : null,
  ].filter(Boolean);
  return bits.length > 0 ? `${zone.label} (${bits.join(', ')})` : zone.label;
}

/**
 * Zones whose body region the catalog vocabulary does not know.
 *
 * These are the silent holes: the prompt still names them, but no deterministic
 * check can fire, so the athlete must be told the automatic verification does
 * not cover this one rather than reading its absence as an all-clear.
 */
export function unmappedSensitiveZones(zones: readonly SensitiveZone[]): SensitiveZone[] {
  return zones.filter((zone) => zone.groups.length === 0);
}

export function zoneLine(zone: SensitiveZone): string {
  const side = zone.side
    ? ` (${SIDE_WORDS[zone.side.toUpperCase()] ?? zone.side.toLowerCase()})`
    : '';
  const severity = zone.severity !== null ? `, sévérité ${zone.severity}/10` : '';
  return `- ${zone.label} — zone ${zone.region}${side}${severity}`;
}

/**
 * Per-request block naming this athlete's zones. Empty string when there is
 * nothing to protect, so the prompt stays short for everyone else.
 */
export function formatSensitiveZoneRules(zones: readonly SensitiveZone[]): string {
  if (zones.length === 0) {
    return '';
  }
  return [
    '\n## Zones sensibles à protéger dans le choix des exercices',
    ...zones.map(zoneLine),
    "IMPÉRATIF pour toute séance STRENGTH : ne prescris aucun exercice qui charge directement ces zones. Renforce AUTOUR (agonistes, antagonistes, stabilisateurs), privilégie l'isométrique et l'excentrique contrôlé, et nomme explicitement l'adaptation dans la description de la séance.",
  ].join('\n');
}
