import { ActivityType } from '@prisma/client';
import type { EquipmentSport } from '@sharpit/app/lib/equipment/catalog';
import { EQUIPMENT_SPORTS } from '@sharpit/app/lib/equipment/catalog';
import {
  PRACTICED_SPORT_LABELS,
  type PracticedSportId,
} from '@sharpit/app/lib/practiced-sports/catalog';
import type { TravelDiscipline } from '@sharpit/app/lib/travel-context/disciplines';
import { TRAVEL_DISCIPLINES } from '@sharpit/app/lib/travel-context/disciplines';

const ENDURANCE_EQUIPMENT: {
  practiced: PracticedSportId;
  equipment: EquipmentSport;
}[] = [
  { practiced: 'run', equipment: 'RUN' },
  { practiced: 'bike', equipment: 'BIKE' },
  { practiced: 'swim', equipment: 'SWIM' },
];

const ENDURANCE_ACTIVITY: {
  practiced: PracticedSportId;
  activity: ActivityType;
}[] = [
  { practiced: 'run', activity: ActivityType.RUN },
  { practiced: 'bike', activity: ActivityType.BIKE },
  { practiced: 'swim', activity: ActivityType.SWIM },
];

/** Coach plan / adapt / chat proposal types (schema enum). */
export type CoachActivityType = 'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH';

const COACH_TYPE_LABELS: Record<CoachActivityType, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
  STRENGTH: 'Renfo',
};

/** Effective endurance activity types implied by practiced sports (triathlon expands). */
export function enduranceActivityTypesForPracticed(
  sports: readonly PracticedSportId[],
): ActivityType[] {
  const hasTri = sports.includes('triathlon');
  return ENDURANCE_ACTIVITY.filter(({ practiced }) => hasTri || sports.includes(practiced)).map(
    ({ activity }) => activity,
  );
}

export function performanceSportsForPracticed(sports: readonly PracticedSportId[]): ActivityType[] {
  return enduranceActivityTypesForPracticed(sports);
}

export type PeriodSportOption = ActivityType | 'ALL';

/**
 * Period goal sport picker options filtered by practiced sports.
 * Always keeps « Tous sports ». Drops OTHER (endurance-first). STRENGTH only if practiced.
 */
export function periodSportOptionsForPracticed(
  sports: readonly PracticedSportId[],
): PeriodSportOption[] {
  const options: PeriodSportOption[] = ['ALL', ...enduranceActivityTypesForPracticed(sports)];
  if (sports.includes('strength')) {
    options.push(ActivityType.STRENGTH);
  }
  return options;
}

/** Equipment UI tabs visible for the athlete's practiced sports. */
export function equipmentSportsForPracticed(sports: readonly PracticedSportId[]): EquipmentSport[] {
  const hasTri = sports.includes('triathlon');
  const set = new Set<EquipmentSport>(
    ENDURANCE_EQUIPMENT.filter(({ practiced }) => hasTri || sports.includes(practiced)).map(
      ({ equipment }) => equipment,
    ),
  );
  if (sports.includes('strength')) {
    set.add('STRENGTH');
  }
  if (sports.includes('mobility') || sports.includes('stretching')) {
    set.add('MOBILITY');
  }
  return EQUIPMENT_SPORTS.filter((sport) => set.has(sport));
}

/** True when renfo and/or mobilité/étirements are practiced (coach STRENGTH vehicle). */
export function hasComplementaryCoachStrength(sports: readonly PracticedSportId[]): boolean {
  return (
    sports.includes('strength') || sports.includes('mobility') || sports.includes('stretching')
  );
}

/**
 * Activity types the coach may propose (ADD / create).
 * Triathlon expands to RUN+BIKE+SWIM. STRENGTH whenever an endurance sport is practiced —
 * tendon prevention is part of the plan, not an option (ADR-112) — or when
 * complementary strength/mobility/stretching is.
 */
export function coachActivityTypesForPracticed(
  sports: readonly PracticedSportId[],
): CoachActivityType[] {
  const types: CoachActivityType[] = enduranceActivityTypesForPracticed(sports).filter(
    (t): t is CoachActivityType => t === 'RUN' || t === 'BIKE' || t === 'SWIM',
  );
  if (types.length > 0 || hasComplementaryCoachStrength(sports)) {
    types.push('STRENGTH');
  }
  return types;
}

export function isCoachActivityTypeAllowed(
  type: string,
  sports: readonly PracticedSportId[],
): boolean {
  return coachActivityTypesForPracticed(sports).includes(type as CoachActivityType);
}

/** Travel memory disciplines the coach may suggest for this athlete. */
export function travelDisciplinesForPracticed(
  sports: readonly PracticedSportId[],
): TravelDiscipline[] {
  const set = new Set<TravelDiscipline>();
  for (const activity of enduranceActivityTypesForPracticed(sports)) {
    if (activity === 'RUN' || activity === 'BIKE' || activity === 'SWIM') {
      set.add(activity);
    }
  }
  if (sports.includes('strength')) {
    set.add('STRENGTH');
  }
  if (sports.includes('mobility') || sports.includes('stretching')) {
    set.add('MOBILITY');
  }
  return TRAVEL_DISCIPLINES.filter((d) => set.has(d));
}

/**
 * Compact markdown block for coach system context (plans, adapt, chat, twin-informed prompts).
 * Filters proposals only — does not ask to hide history.
 */
export function formatPracticedSportsForCoach(sports: readonly PracticedSportId[]): string {
  const selection = sports.map((id) => PRACTICED_SPORT_LABELS[id]).join(', ');
  const allowed = coachActivityTypesForPracticed(sports);
  const allowedLabels = allowed.map((t) => COACH_TYPE_LABELS[t]).join(', ');
  const lines = [
    '## Sports pratiqués',
    `Sélection athlète : ${selection || '—'}.`,
    `IMPÉRATIF : ne propose que des séances de type ${allowedLabels}. Aucun autre sport en création / ADD. Ne retire pas l'historique ni les séances déjà planifiées hors catalogue.`,
  ];
  if (!hasComplementaryCoachStrength(sports)) {
    lines.push(
      'Renfo / mobilité non pratiqués : n’ajoute pas de séance STRENGTH ni de mobilité obligatoire, même si un objectif sportif est actif.',
    );
  }
  return lines.join('\n');
}
