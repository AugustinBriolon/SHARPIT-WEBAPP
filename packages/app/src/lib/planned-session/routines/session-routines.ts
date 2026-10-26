/**
 * The warm-up before and the stretches after an endurance session (ADR-114).
 *
 * The endurance prescription warms the heart up (easy minutes before the work); it does not
 * open the joints the session loads, nor stretch them afterwards. Each sport gets a fixed
 * routine, completed by moves for the zones the athlete declared, unless the coach wrote one
 * for this very session. Strength sessions carry their own activation and stretching blocks.
 *
 * Pure: no I/O, no React.
 */
import type { ActivityType } from '@prisma/client';
import { z } from 'zod';
import {
  catalogGroupsForRegion,
  type CatalogBodyPart,
  type ZoneCondition,
} from '@sharpit/app/lib/physical-health/sensitive-zones';

export type RoutineMove = { name: string; dose: string; cue: string | null };

export type SessionRoutine = {
  moves: RoutineMove[];
  /** Rough length: about a minute per move, setup included. */
  minutes: number;
  /** `coach` when the coach wrote it for this session, `library` otherwise. */
  source: 'library' | 'coach';
};

export type SessionRoutines = { warmup: SessionRoutine; cooldown: SessionRoutine };

type RoutineSport = 'RUN' | 'BIKE' | 'SWIM';
type Pair = { warmup: RoutineMove[]; cooldown: RoutineMove[] };

const move = (name: string, dose: string, cue: string | null = null): RoutineMove => ({
  name,
  dose,
  cue,
});

const PSOAS = move('Fente basse, étirement du psoas', '30 s par côté', 'Bassin rétroversé, sans cambrer');
const PIGEON = move('Pigeon au sol', '45 s par côté');
const QUADS = move('Étirement du quadriceps debout', '30 s par côté');
const CHEST = move('Ouverture des pectoraux contre un mur', '30 s par côté');
const CHILD = move("Posture de l'enfant", '45 s');
const THORACIC = move('Rotations thoraciques', '8 par côté');

const LIBRARY: Record<RoutineSport, Pair> = {
  RUN: {
    warmup: [
      move('Rotations de chevilles', '10 par côté'),
      move('Balancés de jambe avant-arrière', '10 par côté'),
      move('Balancés de jambe latéraux', '10 par côté'),
      move('Fentes marchées avec rotation du buste', '6 par côté'),
      move('Montées de genoux', '2 × 20 m'),
      move('Talons-fesses', '2 × 20 m'),
    ],
    cooldown: [
      move('Étirement du mollet contre un mur', '30 s par côté, jambe tendue puis genou fléchi'),
      move('Étirement des ischios, talon sur un support bas', '30 s par côté', 'Dos droit, bascule du bassin'),
      QUADS,
      PSOAS,
      PIGEON,
    ],
  },
  BIKE: {
    warmup: [
      move('Cercles de hanches', '10 par côté'),
      move('Chat-vache', '10 répétitions'),
      move('Squats lents au poids du corps', '10 répétitions'),
      THORACIC,
    ],
    cooldown: [
      PSOAS,
      QUADS,
      PIGEON,
      move('Étirement des ischios allongé, avec une sangle', '30 s par côté'),
      CHEST,
      CHILD,
    ],
  },
  SWIM: {
    warmup: [
      move('Cercles de bras avant et arrière', '10 de chaque'),
      move("Rotations externes d'épaule à l'élastique", '15 par côté'),
      move("Tirages bras tendus à l'élastique", '12 répétitions'),
      move('Balancés de bras croisés', '15 répétitions'),
      THORACIC,
    ],
    cooldown: [
      move("Étirement de l'épaule, bras croisé", '30 s par côté'),
      move('Étirement du triceps derrière la tête', '30 s par côté'),
      CHEST,
      move('Étirement des grands dorsaux, mains sur un support', '45 s'),
      CHILD,
    ],
  },
};

/** Moves added for a declared zone, by the catalog group it loads. Gentle, always pain-free. */
const ZONE_MOVES: Partial<Record<CatalogBodyPart, Pair>> = {
  back: {
    warmup: [move('Chat-vache', '10 répétitions')],
    cooldown: [
      move('Glissements du nerf sciatique, allongé', '10 par côté', 'Sans douleur ni fourmillement'),
      move('Genoux à la poitrine, allongé', '45 s'),
    ],
  },
  waist: {
    warmup: [move('Bascules du bassin, allongé', '10 répétitions')],
    cooldown: [move('Genoux à la poitrine, allongé', '45 s')],
  },
  'upper legs': {
    warmup: [move('Pont fessier', '12 répétitions')],
    cooldown: [move('Étirement des adducteurs, papillon', '45 s')],
  },
  'lower legs': {
    warmup: [move('Montées sur pointes lentes', '15 répétitions')],
    cooldown: [move('Étirement du soléaire, genou fléchi contre un mur', '45 s par côté')],
  },
  shoulders: {
    warmup: [move("Rotations externes d'épaule à l'élastique", '15 par côté')],
    cooldown: [move("Étirement de l'épaule, bras croisé", '30 s par côté')],
  },
};

function isRoutineSport(type: ActivityType | string): type is RoutineSport {
  return type === 'RUN' || type === 'BIKE' || type === 'SWIM';
}

function uniqueByName(moves: readonly RoutineMove[]): RoutineMove[] {
  const seen = new Set<string>();
  return moves.filter((m) => !seen.has(m.name) && seen.add(m.name));
}

function routine(moves: readonly RoutineMove[], source: SessionRoutine['source']): SessionRoutine {
  const unique = uniqueByName(moves);
  return { moves: unique, minutes: unique.length, source };
}

function zoneGroups(zones: readonly ZoneCondition[]): CatalogBodyPart[] {
  return [
    ...new Set(zones.flatMap((zone) => catalogGroupsForRegion(zone.bodyRegion ?? zone.label))),
  ];
}

const routineMoveSchema = z.object({
  name: z.string().min(1).max(80),
  dose: z.string().min(1).max(60),
  cue: z.string().max(120).nullable().optional(),
});

/** What the coach may write for one session; each half null keeps the library's. */
export const coachSessionRoutinesSchema = z
  .object({
    warmup: z.array(routineMoveSchema).min(3).max(8).nullable(),
    cooldown: z.array(routineMoveSchema).min(3).max(8).nullable(),
  })
  .describe(
    "Échauffement articulaire et étirements sur mesure. null par défaut : l'app fournit ceux du sport et des zones sensibles.",
  );

export type CoachSessionRoutines = z.infer<typeof coachSessionRoutinesSchema>;

function parseCoachMoves(raw: unknown): RoutineMove[] | null {
  const parsed = z.array(routineMoveSchema).min(1).safeParse(raw);
  return parsed.success ? parsed.data.map((m) => move(m.name, m.dose, m.cue ?? null)) : null;
}

/**
 * The session's warm-up and stretches: the coach's for this session when stored, else the
 * sport's library completed by the athlete's zones. Null for a sport without one.
 */
export function resolveSessionRoutines(input: {
  type: ActivityType | string;
  routines?: unknown;
  zones?: readonly ZoneCondition[];
}): SessionRoutines | null {
  if (!isRoutineSport(input.type)) {
    return null;
  }
  const stored = (input.routines ?? {}) as { warmup?: unknown; cooldown?: unknown };
  const library = LIBRARY[input.type];
  const extras = zoneGroups(input.zones ?? []).flatMap((group) => ZONE_MOVES[group] ?? []);
  const half = (key: keyof Pair): SessionRoutine => {
    const coach = parseCoachMoves(stored[key]);
    return coach
      ? routine(coach, 'coach')
      : routine([...library[key], ...extras.flatMap((pair) => pair[key])], 'library');
  };
  return { warmup: half('warmup'), cooldown: half('cooldown') };
}
