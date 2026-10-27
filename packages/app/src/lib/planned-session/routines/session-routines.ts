/**
 * The warm-up before and the stretches after an endurance session (ADR-114, ADR-115).
 *
 * The endurance prescription warms the heart up (easy minutes before the work); it does not
 * open the joints the session loads. The warm-up is dosed by what the session asks (RAMP:
 * mobilise, then drills, then activation as the intensity rises); strides before hard work
 * live in the prescription itself (`withPotentiation`), so they reach the watch. Stretches
 * after are optional and targeted: they neither prevent soreness nor injury, so they are held
 * only where the session or a declared zone calls for them. The coach may write either half
 * for one session. Strength sessions carry their own activation and stretching blocks.
 *
 * Pure: no I/O, no React.
 */
import type { ActivityType, SessionIntensity } from '@prisma/client';
import { z } from 'zod';
import {
  catalogGroupsForRegion,
  type CatalogBodyPart,
  type ZoneCondition,
} from '@sharpit/app/lib/physical-health/sensitive-zones';

export type RoutineMove = { name: string; dose: string; cue: string | null };

/** What the athlete said they did with a routine; null until they say. */
export const routineStatusSchema = z.enum(['DONE', 'SHORTENED', 'SKIPPED']);
export type RoutineStatus = z.infer<typeof routineStatusSchema>;

export type SessionRoutine = {
  moves: RoutineMove[];
  /** Rough length: about a minute per move, setup included. */
  minutes: number;
  /** `coach` when the coach wrote it for this session, `library` otherwise. */
  source: 'library' | 'coach';
  /** True for the stretches: worth doing where they are aimed, never a duty. */
  optional: boolean;
  status: RoutineStatus | null;
};

export type SessionRoutines = { warmup: SessionRoutine; cooldown: SessionRoutine };

type RoutineSport = 'RUN' | 'BIKE' | 'SWIM';
type Pair = { warmup: RoutineMove[]; cooldown: RoutineMove[] };
/** A sport's moves by role: the warm-up takes more of them as the intensity rises. */
type SportLibrary = {
  mobilise: RoutineMove[];
  drills: RoutineMove[];
  activate: RoutineMove[];
  stretches: RoutineMove[];
};

const move = (name: string, dose: string, cue: string | null = null): RoutineMove => ({
  name,
  dose,
  cue,
});

const PSOAS = move(
  'Fente basse, étirement du psoas',
  '30 s par côté',
  'Bassin rétroversé, sans cambrer',
);
const QUADS = move('Étirement du quadriceps debout', '30 s par côté');
const CHEST = move('Ouverture des pectoraux contre un mur', '30 s par côté');
const THORACIC = move('Rotations thoraciques', '8 par côté');
const CAT_COW = move('Chat-vache', '10 répétitions');
const GLUTE_BRIDGE = move('Pont fessier', '12 répétitions');
const CALF_RAISES = move('Montées sur pointes lentes', '15 répétitions');
const EXTERNAL_ROTATION = move("Rotations externes d'épaule à l'élastique", '15 par côté');
const SHOULDER_STRETCH = move("Étirement de l'épaule, bras croisé", '30 s par côté');
const KNEES_TO_CHEST = move('Genoux à la poitrine, allongé', '45 s');

const LIBRARY: Record<RoutineSport, SportLibrary> = {
  RUN: {
    mobilise: [
      move('Rotations de chevilles', '10 par côté'),
      move('Balancés de jambe avant-arrière', '10 par côté'),
      move('Balancés de jambe latéraux', '10 par côté'),
      move('Fentes marchées avec rotation du buste', '6 par côté'),
    ],
    drills: [move('Montées de genoux', '2 × 20 m'), move('Talons-fesses', '2 × 20 m')],
    activate: [GLUTE_BRIDGE, CALF_RAISES],
    stretches: [
      move('Étirement du mollet contre un mur', '30 s par côté, jambe tendue puis genou fléchi'),
      PSOAS,
      move(
        'Étirement des ischios, talon sur un support bas',
        '30 s par côté',
        'Dos droit, bascule du bassin',
      ),
    ],
  },
  BIKE: {
    mobilise: [move('Cercles de hanches', '10 par côté'), CAT_COW, THORACIC],
    drills: [],
    activate: [move('Squats lents au poids du corps', '10 répétitions'), GLUTE_BRIDGE],
    stretches: [PSOAS, QUADS, CHEST],
  },
  SWIM: {
    mobilise: [
      move('Cercles de bras avant et arrière', '10 de chaque'),
      move('Balancés de bras croisés', '15 répétitions'),
      THORACIC,
    ],
    drills: [],
    activate: [EXTERNAL_ROTATION, move("Tirages bras tendus à l'élastique", '12 répétitions')],
    stretches: [
      SHOULDER_STRETCH,
      move('Étirement des grands dorsaux, mains sur un support', '45 s'),
      CHEST,
    ],
  },
};

type Dose = 'light' | 'base' | 'drills' | 'full';

/** How much warm-up the session's intensity asks for (dose table, ADR-115). */
const DOSE_BY_INTENSITY: Record<SessionIntensity, Dose> = {
  RECOVERY: 'light',
  ENDURANCE: 'base',
  TEMPO: 'drills',
  THRESHOLD: 'full',
  VO2MAX: 'full',
  RACE: 'full',
};

function warmupFor(library: SportLibrary, dose: Dose): RoutineMove[] {
  switch (dose) {
    case 'light':
      return library.mobilise.slice(0, 2);
    case 'base':
      return library.mobilise;
    case 'drills':
      return [...library.mobilise, ...library.drills];
    case 'full':
      return [...library.mobilise, ...library.drills, ...library.activate];
  }
}

/** A recovery session loads nothing worth stretching: only a declared zone earns a hold. */
function cooldownFor(library: SportLibrary, dose: Dose): RoutineMove[] {
  return dose === 'light' ? [] : library.stretches;
}

/** Moves added for a declared zone, by the catalog group it loads. Gentle, always pain-free. */
const ZONE_MOVES: Partial<Record<CatalogBodyPart, Pair>> = {
  back: {
    warmup: [CAT_COW],
    cooldown: [
      move(
        'Glissements du nerf sciatique, allongé',
        '10 par côté',
        'Sans douleur ni fourmillement',
      ),
      KNEES_TO_CHEST,
    ],
  },
  waist: {
    warmup: [move('Bascules du bassin, allongé', '10 répétitions')],
    cooldown: [KNEES_TO_CHEST],
  },
  'upper legs': {
    warmup: [GLUTE_BRIDGE],
    cooldown: [move('Étirement des adducteurs, papillon', '45 s')],
  },
  'lower legs': {
    warmup: [CALF_RAISES],
    cooldown: [move('Étirement du soléaire, genou fléchi contre un mur', '45 s par côté')],
  },
  shoulders: {
    warmup: [EXTERNAL_ROTATION],
    cooldown: [SHOULDER_STRETCH],
  },
};

const INJURY_CUE = 'Sans douleur : arrête au moindre tiraillement';

function isRoutineSport(type: ActivityType | string): type is RoutineSport {
  return type === 'RUN' || type === 'BIKE' || type === 'SWIM';
}

function uniqueByName(moves: readonly RoutineMove[]): RoutineMove[] {
  const seen = new Set<string>();
  return moves.filter((m) => !seen.has(m.name) && seen.add(m.name));
}

function routine(
  moves: readonly RoutineMove[],
  source: SessionRoutine['source'],
  optional: boolean,
  status: RoutineStatus | null,
): SessionRoutine {
  const unique = uniqueByName(moves);
  return { moves: unique, minutes: unique.length, source, optional, status };
}

function zoneGroups(zones: readonly ZoneCondition[]): CatalogBodyPart[] {
  return [
    ...new Set(zones.flatMap((zone) => catalogGroupsForRegion(zone.bodyRegion ?? zone.label))),
  ];
}

/** A zone still injured asks every move aimed at it to stay clear of pain. */
function zoneMoves(zones: readonly ZoneCondition[]): Pair[] {
  const injured = new Set(zoneGroups(zones.filter((zone) => zone.category === 'INJURY')));
  return zoneGroups(zones).flatMap((group) => {
    const pair = ZONE_MOVES[group];
    if (!pair) {
      return [];
    }
    if (!injured.has(group)) {
      return [pair];
    }
    const careful = (m: RoutineMove) => ({ ...m, cue: m.cue ?? INJURY_CUE });
    return [{ warmup: pair.warmup.map(careful), cooldown: pair.cooldown.map(careful) }];
  });
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
 * sport's library dosed by the intensity and completed by the athlete's zones. Null for a
 * sport without one.
 */
export function resolveSessionRoutines(input: {
  type: ActivityType | string;
  intensity?: SessionIntensity | null;
  routines?: unknown;
  zones?: readonly ZoneCondition[];
  warmupStatus?: RoutineStatus | null;
  cooldownStatus?: RoutineStatus | null;
}): SessionRoutines | null {
  if (!isRoutineSport(input.type)) {
    return null;
  }
  const stored = (input.routines ?? {}) as { warmup?: unknown; cooldown?: unknown };
  const library = LIBRARY[input.type];
  const dose = DOSE_BY_INTENSITY[input.intensity ?? 'ENDURANCE'];
  const extras = zoneMoves(input.zones ?? []);
  const libraryMoves: Pair = {
    warmup: warmupFor(library, dose),
    cooldown: cooldownFor(library, dose),
  };
  const half = (key: keyof Pair, status: RoutineStatus | null | undefined): SessionRoutine => {
    const optional = key === 'cooldown';
    const coach = parseCoachMoves(stored[key]);
    return coach
      ? routine(coach, 'coach', optional, status ?? null)
      : routine(
          [...libraryMoves[key], ...extras.flatMap((pair) => pair[key])],
          'library',
          optional,
          status ?? null,
        );
  };
  return {
    warmup: half('warmup', input.warmupStatus),
    cooldown: half('cooldown', input.cooldownStatus),
  };
}

export type RoutineAdherence = Record<RoutineStatus, number> & { unsaid: number };

/**
 * How the athlete's warm-ups went over completed endurance sessions: what they said, and how
 * many they said nothing about. Null when no such session was completed.
 */
export function summarizeWarmupAdherence(
  sessions: readonly { type: string; completed: boolean; warmupStatus: RoutineStatus | null }[],
): RoutineAdherence | null {
  const done = sessions.filter((s) => s.completed && isRoutineSport(s.type));
  if (done.length === 0) {
    return null;
  }
  const tally: RoutineAdherence = { DONE: 0, SHORTENED: 0, SKIPPED: 0, unsaid: 0 };
  for (const session of done) {
    tally[session.warmupStatus ?? 'unsaid'] += 1;
  }
  return tally;
}
