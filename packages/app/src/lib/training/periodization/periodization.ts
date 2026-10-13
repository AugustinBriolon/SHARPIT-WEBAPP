import type { PlanPhase } from '@prisma/client';
import {
  addDays,
  addWeeks,
  differenceInCalendarWeeks,
  format,
  startOfDay,
  startOfWeek,
} from 'date-fns';

const WEEK_OPTS = { weekStartsOn: 1 as const };

export const phaseLabels: Record<PlanPhase, string> = {
  BASE: 'Base',
  BUILD: 'Développement',
  PEAK: 'Spécifique',
  TAPER: 'Affûtage',
  RACE: 'Course',
};

export const phaseColors: Record<PlanPhase, string> = {
  BASE: 'var(--signal-neutral)',
  BUILD: 'var(--signal-base)',
  PEAK: 'var(--signal-vo2)',
  TAPER: 'var(--signal-tempo)',
  RACE: 'var(--signal-risk)',
};

export interface MacroWeekDraft {
  weekStart: Date;
  weekIndex: number;
  phase: PlanPhase;
  targetLoad: number;
  targetHours: number;
  focus: string;
  isDeload: boolean;
}

export interface MacroPlanDraft {
  raceDate: Date;
  startDate: Date;
  totalWeeks: number;
  baselineCtl: number;
  summary: string;
  weeks: MacroWeekDraft[];
}

interface PhaseBlock {
  phase: PlanPhase;
  weeks: number;
}

function taperWeeksForPlan(totalWeeks: number): number {
  if (totalWeeks <= 6) {
    return 1;
  }
  if (totalWeeks <= 12) {
    return 2;
  }
  return 3;
}

function buildShortPlanPhases(taperWeeks: number): PhaseBlock[] {
  return [
    ...(taperWeeks > 0 ? [{ phase: 'TAPER' as const, weeks: taperWeeks }] : []),
    { phase: 'RACE' as const, weeks: 1 },
  ];
}

function splitRemainingPhases(
  totalWeeks: number,
  remaining: number,
): {
  baseWeeks: number;
  buildWeeks: number;
  peakWeeks: number;
} {
  if (totalWeeks <= 8) {
    const buildWeeks = Math.max(1, remaining - 1);
    return { baseWeeks: 0, buildWeeks, peakWeeks: Math.max(0, remaining - buildWeeks) };
  }
  if (totalWeeks <= 16) {
    const baseWeeks = Math.max(2, Math.round(remaining * 0.35));
    const peakWeeks = Math.max(1, Math.round(remaining * 0.2));
    return { baseWeeks, buildWeeks: Math.max(1, remaining - baseWeeks - peakWeeks), peakWeeks };
  }
  const baseWeeks = Math.max(4, Math.round(remaining * 0.45));
  const peakWeeks = Math.max(2, Math.round(remaining * 0.15));
  return { baseWeeks, buildWeeks: remaining - baseWeeks - peakWeeks, peakWeeks };
}

/** Répartition des phases selon le nombre de semaines avant la course. */
function distributePhases(totalWeeks: number): PhaseBlock[] {
  if (totalWeeks <= 0) {
    return [{ phase: 'RACE', weeks: 1 }];
  }

  const taperWeeks = taperWeeksForPlan(totalWeeks);
  const raceWeeks = 1;
  const remaining = Math.max(0, totalWeeks - taperWeeks - raceWeeks);

  if (remaining <= 0) {
    return buildShortPlanPhases(taperWeeks);
  }

  let { baseWeeks, buildWeeks, peakWeeks } = splitRemainingPhases(totalWeeks, remaining);

  if (buildWeeks < 1) {
    buildWeeks = 1;
    baseWeeks = Math.max(0, baseWeeks - 1);
  }

  const blocks: PhaseBlock[] = [];
  if (baseWeeks > 0) {
    blocks.push({ phase: 'BASE', weeks: baseWeeks });
  }
  if (buildWeeks > 0) {
    blocks.push({ phase: 'BUILD', weeks: buildWeeks });
  }
  if (peakWeeks > 0) {
    blocks.push({ phase: 'PEAK', weeks: peakWeeks });
  }
  blocks.push({ phase: 'TAPER', weeks: taperWeeks });
  blocks.push({ phase: 'RACE', weeks: raceWeeks });
  return blocks;
}

/**
 * Facteurs de charge par phase de périodisation (% de la charge de référence).
 *
 * Modèle : Périodisation linéaire classique pour endurance
 * BASE → BUILD → PEAK → TAPER → RACE
 *
 * Sources :
 * - Bompa, T. & Haff, G. (2009) "Periodization: Theory and Methodology of Training"
 * - Mujika, I. & Padilla, S. (2003) "Scientific bases for precompetition tapering strategies"
 *   Medicine & Science in Sports & Exercise, 35(7), 1182-1187
 * - Issurin, V. (2010) "New horizons for the methodology and physiology of training periodization"
 *   Sports Medicine, 40(3), 189-206
 *
 * Justification des valeurs :
 * - BASE (0.85) : 80-90% charge max, focus volume aérobie (littérature : 60-80%)
 * - BUILD (1.0) : 100% référence, ajout progressif intensité
 * - PEAK (1.08) : 100-110% charge maximale, spécificité course (littérature : jusqu'à 110%)
 * - TAPER (0.55) : 40-60% volume, maintien intensité courte (littérature : réduction 40-60%)
 * - RACE (0.25) : 20-30% charge, repos actif + course
 *
 * LIMITATIONS :
 * - Valeurs moyennes, variation individuelle importante
 * - Pas d'ajustement selon sport (marathon vs triathlon vs ultra)
 * - Ne tient pas compte signaux individuels (HRV, TSB, compliance)
 *
 * Voir `docs/models/` (periodization) et `knowledge/training-load.md`.
 */
const PHASE_LOAD_FACTOR: Record<PlanPhase, number> = {
  BASE: 0.85, // 85% de la charge de référence
  BUILD: 1.0, // 100% (référence)
  PEAK: 1.08, // 108% (pic de volume+intensité)
  TAPER: 0.55, // 55% (affûtage)
  RACE: 0.25, // 25% (repos actif + course)
};

const PHASE_FOCUS: Record<PlanPhase, string> = {
  BASE: 'Volume aérobie, endurance fondamentale, renforcement général',
  BUILD: 'Intensité progressive, séances seuil et tempo',
  PEAK: 'Spécificité course, simulation allure/puissance cible',
  TAPER: "Réduction volume, maintien de l'intensité courte",
  RACE: 'Repos actif, activation légère, course',
};

function hoursForLoad(load: number): number {
  return Number((load / 55).toFixed(1));
}

function taperFactor(weekInTaper: number, totalTaper: number): number {
  if (totalTaper <= 1) {
    return 0.55;
  }
  const progress = weekInTaper / totalTaper;
  return 0.7 - progress * 0.35; // 70% → 35%
}

/**
 * Génère un macro-plan périodisé déterministe jusqu'à la date de course.
 * La charge hebdo part de la CTL actuelle (×7 ≈ charge chronique hebdo).
 */
function computeMacroWeekProgression(phase: PlanPhase, blockIndex: number): number {
  if (phase === 'BUILD') {
    return 1 + Math.min(blockIndex, 3) * 0.04;
  }
  if (phase === 'BASE') {
    return 1 + Math.min(blockIndex, 5) * 0.03;
  }
  return 1;
}

function computeMacroWeekLoad(input: {
  baseWeeklyLoad: number;
  loadFactor: number;
  progression: number;
  isDeload: boolean;
  phase: PlanPhase;
}): number {
  let targetLoad = Math.round(
    input.baseWeeklyLoad * input.loadFactor * input.progression * (input.isDeload ? 0.72 : 1),
  );
  return Math.max(input.phase === 'RACE' ? 20 : 80, Math.min(900, targetLoad));
}

function buildMacroWeekDraft(input: {
  weekIndex: number;
  weekStart: Date;
  block: ReturnType<typeof distributePhases>[number];
  blockIndex: number;
  baseWeeklyLoad: number;
  taperCounter: number;
  taperTotal: number;
  buildWeekCounter: number;
}): { week: MacroWeekDraft; buildWeekCounter: number; taperCounter: number } {
  const { block, blockIndex, baseWeeklyLoad, taperTotal } = input;
  let { taperCounter, buildWeekCounter } = input;
  let loadFactor = PHASE_LOAD_FACTOR[block.phase];

  if (block.phase === 'TAPER') {
    taperCounter += 1;
    loadFactor = taperFactor(taperCounter, taperTotal);
  }

  const isDeload =
    (block.phase === 'BASE' || block.phase === 'BUILD') &&
    buildWeekCounter > 0 &&
    buildWeekCounter % 4 === 0;

  if (block.phase === 'BASE' || block.phase === 'BUILD') {
    buildWeekCounter += 1;
  }

  const progression = computeMacroWeekProgression(block.phase, blockIndex);
  const targetLoad = computeMacroWeekLoad({
    baseWeeklyLoad,
    loadFactor,
    progression,
    isDeload,
    phase: block.phase,
  });

  return {
    week: {
      weekStart: input.weekStart,
      weekIndex: input.weekIndex,
      phase: block.phase,
      targetLoad,
      targetHours: hoursForLoad(targetLoad),
      focus: isDeload
        ? 'Semaine de récupération — volume réduit, maintien léger'
        : PHASE_FOCUS[block.phase],
      isDeload,
    },
    buildWeekCounter,
    taperCounter,
  };
}

export function generateMacroPlan(params: {
  raceDate: Date;
  startDate?: Date;
  baselineCtl: number;
  /** B/C races before the target (ADR-084). */
  stepRaces?: StepRace[];
}): MacroPlanDraft {
  const startDate = startOfWeek(startOfDay(params.startDate ?? new Date()), WEEK_OPTS);
  const raceWeek = startOfWeek(startOfDay(params.raceDate), WEEK_OPTS);
  const totalWeeks = differenceInCalendarWeeks(raceWeek, startDate, WEEK_OPTS) + 1;

  if (totalWeeks < 1) {
    throw new Error('La date de course doit être dans le futur.');
  }

  const baselineCtl = Math.max(15, Math.round(params.baselineCtl));
  const baseWeeklyLoad = Math.round(baselineCtl * 7);
  const phaseBlocks = distributePhases(totalWeeks);

  const weeks: MacroWeekDraft[] = [];
  let weekIndex = 0;
  let taperCounter = 0;
  const taperTotal = phaseBlocks.find((b) => b.phase === 'TAPER')?.weeks ?? 0;
  let buildWeekCounter = 0;

  for (const block of phaseBlocks) {
    for (let i = 0; i < block.weeks; i++) {
      const {
        week,
        buildWeekCounter: nextBuildWeekCounter,
        taperCounter: nextTaperCounter,
      } = buildMacroWeekDraft({
        weekIndex,
        weekStart: addWeeks(startDate, weekIndex),
        block,
        blockIndex: i,
        baseWeeklyLoad,
        taperCounter,
        taperTotal,
        buildWeekCounter,
      });
      weeks.push(week);
      buildWeekCounter = nextBuildWeekCounter;
      taperCounter = nextTaperCounter;
      weekIndex += 1;
    }
  }

  const phaseSummary = phaseBlocks
    .map((b) => `${b.weeks} sem. ${phaseLabels[b.phase].toLowerCase()}`)
    .join(' → ');

  const stepRaces = params.stepRaces ?? [];
  const stepSummary = stepRaces.length
    ? ` Courses intermédiaires : ${stepRaces.map(stepRaceLabel).join(', ')}.`
    : '';
  const summary = `Macro-plan ${totalWeeks} semaines jusqu'au ${format(params.raceDate, 'd/MM/yyyy')} : ${phaseSummary}. Charge de référence CTL ${baselineCtl} (≈${baseWeeklyLoad} TSS/sem).${stepSummary}`;

  return {
    raceDate: params.raceDate,
    startDate,
    totalWeeks,
    baselineCtl,
    summary,
    weeks: applyStepRaces(weeks, stepRaces),
  };
}

/** A B or C race inside the plan horizon — the plan still builds toward its A race. */
export type StepRace = { title: string; date: Date; priority: 'B' | 'C' };

/** B race: load −35 % over the days before (Mujika & Padilla 2003, short taper). */
export const B_RACE_TAPER_DAYS = 5;
export const B_RACE_TAPER_LOAD_FACTOR = 0.65;
/** B race: easy days after, before the build resumes. */
export const B_RACE_RECOVERY_DAYS = 3;
export const B_RACE_RECOVERY_LOAD_FACTOR = 0.4;

export type StepRaceDayKind = 'MINI_TAPER' | 'STEP_RACE' | 'RECOVERY' | 'HARD_SESSION';
export type StepRaceDay = { date: Date; kind: StepRaceDayKind; loadFactor: number };

/** Day-by-day load factors around a step race; a C race is only a hard session, no taper. */
export function stepRaceDayModifiers(race: StepRace): StepRaceDay[] {
  const day = startOfDay(race.date);
  if (race.priority === 'C') {
    return [{ date: day, kind: 'HARD_SESSION', loadFactor: 1 }];
  }
  const span = (count: number, offset: number, kind: StepRaceDayKind, loadFactor: number) =>
    Array.from({ length: count }, (_, i) => ({ date: addDays(day, offset + i), kind, loadFactor }));
  return [
    ...span(B_RACE_TAPER_DAYS, -B_RACE_TAPER_DAYS, 'MINI_TAPER', B_RACE_TAPER_LOAD_FACTOR),
    { date: day, kind: 'STEP_RACE', loadFactor: 1 },
    ...span(B_RACE_RECOVERY_DAYS, 1, 'RECOVERY', B_RACE_RECOVERY_LOAD_FACTOR),
  ];
}

function stepRaceLabel(race: StepRace): string {
  return `${race.title} (${race.priority}) le ${format(race.date, 'd/MM')}`;
}

function stepRaceFocus(race: StepRace): string {
  return race.priority === 'B'
    ? `Course étape ${stepRaceLabel(race)} : mini-affûtage ${B_RACE_TAPER_DAYS} j avant, ${B_RACE_RECOVERY_DAYS} j de récupération après`
    : `Course d'entraînement ${stepRaceLabel(race)} : sans affûtage, compte comme la séance dure`;
}

function inWeek(date: Date, weekStart: Date): boolean {
  return date >= weekStart && date < addDays(weekStart, 7);
}

/**
 * Lowers each week's load by the days its step races take away, and names them in its focus.
 * The A race's own taper and race weeks are left as they are.
 */
export function applyStepRaces(weeks: MacroWeekDraft[], races: StepRace[]): MacroWeekDraft[] {
  const days = races.flatMap(stepRaceDayModifiers);
  return weeks.map((week) => {
    if (week.phase === 'TAPER' || week.phase === 'RACE') {
      return week;
    }
    const lostDays = days
      .filter((d) => inWeek(d.date, week.weekStart))
      .reduce((sum, d) => sum + (1 - d.loadFactor), 0);
    const notes = races
      .filter((r) => inWeek(startOfDay(r.date), week.weekStart))
      .map(stepRaceFocus);
    if (lostDays === 0 && notes.length === 0) {
      return week;
    }
    const targetLoad = Math.round(week.targetLoad * (1 - lostDays / 7));
    return {
      ...week,
      targetLoad,
      targetHours: hoursForLoad(targetLoad),
      focus: [week.focus, ...notes].join(' · '),
    };
  });
}

/** Constraints the week generator must honour for step races touching [start, start + days). */
export function stepRaceConstraintLines(races: StepRace[], start: Date, days: number): string[] {
  const end = addDays(startOfDay(start), days);
  return races.flatMap((race) => {
    const touching = stepRaceDayModifiers(race).filter(
      (d) => d.date >= startOfDay(start) && d.date < end,
    );
    if (touching.length === 0) {
      return [];
    }
    const dates = (kind: StepRaceDayKind) =>
      touching
        .filter((d) => d.kind === kind)
        .map((d) => format(d.date, 'd/MM'))
        .join(', ');
    const parts = [
      dates('MINI_TAPER') &&
        `mini-affûtage (charge −${Math.round((1 - B_RACE_TAPER_LOAD_FACTOR) * 100)} %, intensité courte conservée) les ${dates('MINI_TAPER')}`,
      dates('STEP_RACE') && `la course le ${dates('STEP_RACE')} (aucune autre séance ce jour-là)`,
      dates('RECOVERY') &&
        `récupération (endurance facile ou repos, aucune séance dure) les ${dates('RECOVERY')}`,
      dates('HARD_SESSION') &&
        `la course le ${dates('HARD_SESSION')} compte comme la séance dure de la semaine, pas d'affûtage`,
    ].filter(Boolean);
    return [
      `${race.priority === 'B' ? 'Course étape (B)' : "Course d'entraînement (C)"} « ${race.title} » : ${parts.join(' ; ')}.`,
    ];
  });
}

/** Retrouve la semaine du plan correspondant à une date. */
export function findPlanWeekForDate<T extends { weekStart: Date }>(
  weeks: T[],
  date: Date,
): T | undefined {
  const ws = startOfWeek(startOfDay(date), WEEK_OPTS);
  const key = format(ws, 'yyyy-MM-dd');
  return weeks.find((w) => format(w.weekStart, 'yyyy-MM-dd') === key);
}
