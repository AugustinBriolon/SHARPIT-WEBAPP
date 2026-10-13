/**
 * Structured race goals (ADR-082): the race-format catalog per discipline, its prefilled
 * distances, the hard target bounds and the legacy strings derived from them. The single source
 * of race distances — the projection, the triathlon title and the iOS form all read them here.
 */
import { triathlonDistances } from '@sharpit/app/lib/training/periodization/triathlon-performance-predictor';

export const RACE_DISCIPLINES = [
  'RUN',
  'TRAIL',
  'BIKE',
  'SWIM',
  'TRIATHLON',
  'DUATHLON',
  'SWIMRUN',
] as const;
export type RaceDiscipline = (typeof RACE_DISCIPLINES)[number];

export type RaceDistances = {
  swimM?: number;
  bikeM?: number;
  /** DUATHLON: the first run. */
  runM?: number;
  /** DUATHLON: the second run. */
  run2M?: number;
  /** SWIMRUN: swim/run alternations. */
  segments?: number;
};

export type ElevationField = 'bike' | 'run';

export type RaceFormat = {
  discipline: RaceDiscipline;
  key: string;
  label: string;
  shortLabel: string;
  distances: RaceDistances;
  editableDistances: boolean;
  targetBounds: { minSec: number; maxSec: number };
  asksElevation: ElevationField[];
  notesHint: string;
};

/** A goal's structured race fields, as stored on `Goal` (null = not given). */
export type StructuredRace = {
  discipline: RaceDiscipline;
  formatKey: string;
  swimM?: number | null;
  bikeM?: number | null;
  runM?: number | null;
  run2M?: number | null;
  segments?: number | null;
  bikeElevationM?: number | null;
  runElevationM?: number | null;
  openWater?: boolean | null;
};

export const CUSTOM_FORMAT = 'CUSTOM';

export const RUN_RACE_METERS = { k5: 5000, k10: 10_000, semi: 21_097, marathon: 42_195 } as const;

/** French federation triathlon distances; S–XXL are the projection's own format specs. */
export const TRIATHLON_LETTER_DISTANCES = [
  { letter: 'XS', swimM: 400, bikeM: 10_000, runM: 2500 },
  { letter: 'S', ...legsOf(triathlonDistances('sprint')) },
  { letter: 'M', ...legsOf(triathlonDistances('olympic')) },
  { letter: 'L', ...legsOf(triathlonDistances('half')) },
  { letter: 'XXL', ...legsOf(triathlonDistances('full')) },
] as const;

function legsOf(spec: { swimM: number; bikeM: number; runM: number }) {
  return { swimM: spec.swimM, bikeM: spec.bikeM, runM: spec.runM };
}

/** 100 m of climbing costs about 1 km on the flat on foot (the trail « km-effort » rule). */
export const RUN_FLAT_M_PER_CLIMB_M = 10;
/**
 * 1000 m of climbing costs about 15 flat km on a bike: an amateur climbs ≈ 900 m/h (≈ 30 flat
 * km at 28 km/h) and wins back about half of it on the descent.
 */
export const BIKE_FLAT_M_PER_CLIMB_M = 15;

type PaceRange = { fast: number; slow: number };
type Envelope = {
  /** Seconds per metre (run: per flat-equivalent metre, bike: idem). */
  swim?: PaceRange;
  bike?: PaceRange;
  run?: PaceRange;
  /** Seconds for all transitions (SWIMRUN: per segment). */
  transitions?: PaceRange;
};

const perKm = (sec: number) => sec / 1000;
const per100m = (sec: number) => sec / 100;
const kmh = (speed: number) => 3.6 / speed;

/*
 * Hard target bounds = distances × a pace envelope per discipline. Fast ≈ world-class (nobody
 * beats it over the distance), slow ≈ the usual cut-offs. They only block impossible targets.
 */
const ENVELOPES: Record<RaceDiscipline, Envelope> = {
  // 2:30/km ≈ the 5 km world record pace; 10:00/km ≈ brisk walking, marathon cut-offs 6–7 h.
  RUN: { run: { fast: perKm(150), slow: perKm(600) } },
  // Per km-effort: elite trail ≈ 3:20–4:20, hikers' cut-offs ≈ 10–12 min.
  TRAIL: { run: { fast: perKm(180), slow: perKm(720) } },
  // Per flat-equivalent km: 45 km/h ≈ pro road race average; 12 km/h ≈ cyclosportive broom wagon.
  BIKE: { bike: { fast: kmh(45), slow: kmh(12) } },
  // 0:55/100 m ≈ 1500 m world record pace; 3:30/100 m ≈ open-water cut-offs (Ironman 2:20).
  SWIM: { swim: { fast: per100m(55), slow: per100m(210) } },
  // Bike slow 20 km/h ≈ the bike cut-offs; transitions 1 min to 20 min in all.
  TRIATHLON: {
    swim: { fast: per100m(55), slow: per100m(210) },
    bike: { fast: kmh(45), slow: kmh(20) },
    run: { fast: perKm(150), slow: perKm(600) },
    transitions: { fast: 60, slow: 1200 },
  },
  DUATHLON: {
    bike: { fast: kmh(45), slow: kmh(20) },
    run: { fast: perKm(150), slow: perKm(600) },
    transitions: { fast: 45, slow: 900 },
  },
  // Swimming in shoes is slower; the run is on trails; up to 2 min per water entry/exit.
  SWIMRUN: {
    swim: { fast: per100m(65), slow: per100m(240) },
    run: { fast: perKm(180), slow: perKm(720) },
    transitions: { fast: 0, slow: 120 },
  },
};

type CatalogEntry = Omit<RaceFormat, 'targetBounds' | 'discipline'>;

const RUN_HINT = 'Profil du parcours, dénivelé, ravitos, conditions attendues…';
const TRAIL_HINT = 'Barrières horaires, technicité, matériel obligatoire, ravitos…';
const BIKE_HINT = 'Cols principaux, ravitos, barrières horaires, groupe ou seul…';
const SWIM_HINT = 'Eau libre ou piscine, température, combinaison autorisée…';
const TRI_HINT = 'Profil vélo et course, eau libre (combinaison ?), drafting, ravitos…';
const DUA_HINT = 'Profil vélo et course, drafting autorisé, ravitos…';
const SWIMRUN_HINT = 'Nombre de sections, matériel (plaquettes, pull-buoy), température de l’eau…';

type FormFields = Pick<CatalogEntry, 'asksElevation' | 'notesHint'>;

const RUN_FORM: FormFields = { asksElevation: ['run'], notesHint: RUN_HINT };
const SWIM_FORM: FormFields = { asksElevation: [], notesHint: SWIM_HINT };
const TRI_FORM: FormFields = { asksElevation: ['bike', 'run'], notesHint: TRI_HINT };
const DUA_FORM: FormFields = { asksElevation: ['bike', 'run'], notesHint: DUA_HINT };

function preset(
  form: FormFields,
  key: string,
  label: string,
  shortLabel: string,
  distances: RaceDistances,
): CatalogEntry {
  return { ...form, key, label, shortLabel, distances, editableDistances: false };
}

function editable(entry: Omit<CatalogEntry, 'editableDistances'>): CatalogEntry {
  return { ...entry, editableDistances: true };
}

function triathlon(letter: (typeof TRIATHLON_LETTER_DISTANCES)[number]): CatalogEntry {
  const { swimM, bikeM, runM } = letter;
  return preset(TRI_FORM, `TRI_${letter.letter}`, `Triathlon ${letter.letter}`, letter.letter, {
    swimM,
    bikeM,
    runM,
  });
}

const ENTRIES: Record<RaceDiscipline, CatalogEntry[]> = {
  RUN: [
    preset(RUN_FORM, 'RUN_5K', '5 km', '5 km', { runM: RUN_RACE_METERS.k5 }),
    preset(RUN_FORM, 'RUN_10K', '10 km', '10 km', { runM: RUN_RACE_METERS.k10 }),
    preset(RUN_FORM, 'RUN_SEMI', 'Semi-marathon', 'Semi', { runM: RUN_RACE_METERS.semi }),
    preset(RUN_FORM, 'RUN_MARATHON', 'Marathon', 'Marathon', { runM: RUN_RACE_METERS.marathon }),
    editable({
      key: 'RUN_CUSTOM',
      label: 'Course à pied',
      shortLabel: 'Autre',
      distances: { runM: 15_000 },
      ...RUN_FORM,
    }),
  ],
  TRAIL: [
    editable({
      key: 'TRAIL_CUSTOM',
      label: 'Trail',
      shortLabel: 'Trail',
      distances: { runM: 30_000 },
      asksElevation: ['run'],
      notesHint: TRAIL_HINT,
    }),
  ],
  BIKE: [
    editable({
      key: 'BIKE_CUSTOM',
      label: 'Cyclosportive',
      shortLabel: 'Cyclo',
      distances: { bikeM: 120_000 },
      asksElevation: ['bike'],
      notesHint: BIKE_HINT,
    }),
  ],
  SWIM: [
    preset(SWIM_FORM, 'SWIM_1_5K', 'Natation 1,5 km', '1,5 km', { swimM: 1500 }),
    preset(SWIM_FORM, 'SWIM_3K', 'Natation 3 km', '3 km', { swimM: 3000 }),
    preset(SWIM_FORM, 'SWIM_5K', 'Natation 5 km', '5 km', { swimM: 5000 }),
    preset(SWIM_FORM, 'SWIM_10K', 'Natation 10 km', '10 km', { swimM: 10_000 }),
    editable({
      key: 'SWIM_CUSTOM',
      label: 'Natation',
      shortLabel: 'Autre',
      distances: { swimM: 2000 },
      ...SWIM_FORM,
    }),
  ],
  TRIATHLON: [
    ...TRIATHLON_LETTER_DISTANCES.slice(0, 4).map(triathlon),
    // XL has no single federation distance: prefilled with the common 3 / 120 / 30, editable.
    editable({
      key: 'TRI_XL',
      label: 'Triathlon XL',
      shortLabel: 'XL',
      distances: { swimM: 3000, bikeM: 120_000, runM: 30_000 },
      asksElevation: ['bike', 'run'],
      notesHint: `Distances XL variables selon la course : ajuste-les. ${TRI_HINT}`,
    }),
    triathlon(TRIATHLON_LETTER_DISTANCES[4]),
    editable({
      key: 'TRI_CUSTOM',
      label: 'Triathlon',
      shortLabel: 'Autre',
      distances: legsOf(triathlonDistances('olympic')),
      ...TRI_FORM,
    }),
  ],
  // FFTri reference distances, approximate (races vary ±20 %): run / bike / run.
  DUATHLON: [
    preset(DUA_FORM, 'DUA_S', 'Duathlon S', 'S', { runM: 5000, bikeM: 20_000, run2M: 2500 }),
    preset(DUA_FORM, 'DUA_M', 'Duathlon M', 'M', { runM: 10_000, bikeM: 40_000, run2M: 5000 }),
    preset(DUA_FORM, 'DUA_L', 'Duathlon L', 'L', { runM: 20_000, bikeM: 80_000, run2M: 10_000 }),
    editable({
      key: 'DUA_CUSTOM',
      label: 'Duathlon',
      shortLabel: 'Autre',
      distances: { runM: 10_000, bikeM: 40_000, run2M: 5000 },
      ...DUA_FORM,
    }),
  ],
  SWIMRUN: [
    editable({
      key: 'SWIMRUN_CUSTOM',
      label: 'Swimrun',
      shortLabel: 'Swimrun',
      distances: { swimM: 4000, runM: 20_000, segments: 10 },
      asksElevation: ['run'],
      notesHint: SWIMRUN_HINT,
    }),
  ],
};

/** Legs each discipline needs a distance for. */
const REQUIRED_LEGS: Record<RaceDiscipline, (keyof RaceDistances)[]> = {
  RUN: ['runM'],
  TRAIL: ['runM'],
  BIKE: ['bikeM'],
  SWIM: ['swimM'],
  TRIATHLON: ['swimM', 'bikeM', 'runM'],
  DUATHLON: ['runM', 'bikeM', 'run2M'],
  SWIMRUN: ['swimM', 'runM'],
};

const DISTANCE_FIELDS = ['swimM', 'bikeM', 'runM', 'run2M', 'segments'] as const;

/** The whole catalog, in form order (discipline, then format). */
export const RACE_FORMATS: readonly RaceFormat[] = RACE_DISCIPLINES.flatMap((discipline) =>
  ENTRIES[discipline].map((entry) => ({
    ...entry,
    discipline,
    targetBounds: targetBounds(discipline, entry.distances, {}),
  })),
);

export function findRaceFormat(discipline: RaceDiscipline, key: string): RaceFormat | null {
  return RACE_FORMATS.find((f) => f.discipline === discipline && f.key === key) ?? null;
}

function given(value: number | null | undefined): value is number {
  return typeof value === 'number' && value > 0;
}

/**
 * The race with its distances settled: the catalog's for a fixed format, the athlete's (else
 * the prefill) for an editable one. Null for a key the discipline does not have.
 */
export function resolveStructuredRace(race: StructuredRace): StructuredRace | null {
  const format = findRaceFormat(race.discipline, race.formatKey);
  if (!format) {
    return null;
  }
  const distances = Object.fromEntries(
    DISTANCE_FIELDS.map((field) => {
      const own = race[field];
      const value = format.editableDistances && given(own) ? own : format.distances[field];
      return [field, value ?? null];
    }),
  );
  return { ...race, ...distances };
}

/** Legs the discipline needs that carry no distance (empty when the race is complete). */
export function missingLegs(race: StructuredRace): (keyof RaceDistances)[] {
  return REQUIRED_LEGS[race.discipline].filter((field) => !given(race[field]));
}

function legSeconds(range: PaceRange | undefined, meters: number, side: keyof PaceRange) {
  return range && meters > 0 ? range[side] * meters : 0;
}

function targetBounds(
  discipline: RaceDiscipline,
  distances: RaceDistances,
  elevation: Pick<StructuredRace, 'bikeElevationM' | 'runElevationM'>,
): { minSec: number; maxSec: number } {
  const envelope = ENVELOPES[discipline];
  const swimM = distances.swimM ?? 0;
  const bikeM = (distances.bikeM ?? 0) + BIKE_FLAT_M_PER_CLIMB_M * (elevation.bikeElevationM ?? 0);
  const runM =
    (distances.runM ?? 0) +
    (distances.run2M ?? 0) +
    RUN_FLAT_M_PER_CLIMB_M * (elevation.runElevationM ?? 0);
  const transitionCount = discipline === 'SWIMRUN' ? (distances.segments ?? 1) : 1;
  const total = (side: keyof PaceRange) =>
    legSeconds(envelope.swim, swimM, side) +
    legSeconds(envelope.bike, bikeM, side) +
    legSeconds(envelope.run, runM, side) +
    (envelope.transitions?.[side] ?? 0) * transitionCount;
  return {
    minSec: Math.floor(total('fast') / 60) * 60,
    maxSec: Math.ceil(total('slow') / 60) * 60,
  };
}

/** Hard bounds of a target for this race (its settled distances and elevation). */
export function raceTargetBounds(race: StructuredRace): { minSec: number; maxSec: number } {
  return targetBounds(race.discipline, race as RaceDistances, race);
}

function km(meters: number): string {
  const value = meters / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

function distanceSummary(race: StructuredRace): string {
  const legs = [race.swimM, race.bikeM, race.runM, race.run2M].filter(given);
  const summary = `${legs.map(km).join(' / ')} km`;
  return race.discipline === 'SWIMRUN' && given(race.segments)
    ? `${summary} · ${race.segments} sections`
    : summary;
}

function elevationSummary(race: StructuredRace): string | null {
  const climb = (race.bikeElevationM ?? 0) + (race.runElevationM ?? 0);
  return climb > 0 ? `${climb} m D+` : null;
}

/** Legacy `raceFormat` for older clients and the coach prompt: « Triathlon L », « Trail · 42 km · 2500 m D+ ». */
export function legacyRaceFormat(race: StructuredRace): string {
  const format = findRaceFormat(race.discipline, race.formatKey);
  const label = format?.label ?? race.discipline;
  return [label, format?.editableDistances ? distanceSummary(race) : null, elevationSummary(race)]
    .filter(Boolean)
    .join(' · ');
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Legacy `targetPerformance`: « Sub 5h30 », « Sub 5h28'30 », « Sub 42:15 ». */
export function legacyTargetPerformance(targetSeconds: number): string {
  const hours = Math.floor(targetSeconds / 3600);
  const minutes = Math.floor((targetSeconds % 3600) / 60);
  const seconds = targetSeconds % 60;
  if (hours === 0) {
    return `Sub ${minutes}:${pad(seconds)}`;
  }
  return `Sub ${hours}h${pad(minutes)}${seconds > 0 ? `'${pad(seconds)}` : ''}`;
}
