import type { TodayGoalContext } from '@sharpit/app/lib/daily-phase/goal-context';
import { isSet } from '@sharpit/shared/value';
import {
  buildEndOfDayNarrativeCopy,
  isRecoveryStress,
  type EveningSleepHints,
  type TomorrowSessionHint,
} from '@sharpit/app/lib/daily-phase/evening-context';
import type { OverallVerdict } from '@sharpit/app/lib/today/dashboard/today-mapping';
import type { TodayEffortLevel } from '@sharpit/app/lib/today/navigation/today-narrative-context';
import type {
  DailyPhase,
  DailyPhaseResolution,
  DailyPhaseWhyFocus,
} from '@sharpit/app/lib/daily-phase/types';
import { isForwardAdvicePhase, isPostTrainingPhase } from '@sharpit/app/lib/daily-phase/resolve';
import { dayLoadLabel } from '@sharpit/app/lib/daily-phase/day-load';

export type TodayPosture = 'protect' | 'steady' | 'push' | 'uncertain';

export type PhaseNarrativeInput = {
  resolution: DailyPhaseResolution;
  verdict: OverallVerdict;
  adviceActionable: boolean;
  actionLine: string | null;
  sportLabel: string | null;
  totalTssToday: number | null;
  dailyStrainScore: number | null;
  dailyStrainAvailable: boolean;
  limitingFactorMessage?: string | null;
  goalContext?: TodayGoalContext | null;
  evening?: {
    effortLevel: TodayEffortLevel | null;
    totalDurationMin: number | null;
    completedSessionCount: number;
    tomorrowSession: TomorrowSessionHint | null;
    sleep: EveningSleepHints;
  };
};

export type PhaseNarrative = {
  heroEyebrow: string;
  heroHeadline: string;
  heroSubline: string;
  whyFocus: DailyPhaseWhyFocus;
  posture: TodayPosture;
  postureLabel: string;
  focusPriority: string | null;
  goalLine: string | null;
  adaptationReminders: string[];
};

const PHASE_HERO_EYEBROW: Partial<Record<DailyPhase, string>> = {
  END_OF_DAY: 'Ce soir',
  RECOVERY_WINDOW: 'Après la séance',
};

/**
 * RECOVERY_WINDOW covers two distinct real situations (resolve.ts): just after a
 * completed session, or a rest day that's evolved past morning with no session at
 * all. All copy in this phase defaulted to the post-session framing ("Après la
 * séance") regardless. Nonsensical on a day with zero training. This flag routes
 * to rest-day-specific copy instead.
 */
function isRestDayRecoveryWindow(input: PhaseNarrativeInput): boolean {
  return (
    phaseOf(input) === 'RECOVERY_WINDOW' && input.resolution.signals.sessionStatus === 'NONE_TODAY'
  );
}

/**
 * Athlete-facing status tags — softest → strongest: Repos, Prudence, Léger,
 * Qualité, Intense, Pic. « En attente » is separate.
 * Mapped by verdict (not posture) so CAUTION never reuses RECOVER’s tag.
 * Keep in sync with `packages/server/src/lib/verdict/verdict-copy.ts`.
 */
export const VERDICT_STATUS_TAG: Record<OverallVerdict, string> = {
  RECOVER: 'Repos',
  CAUTION: 'Prudence',
  TRAIN_EASY: 'Léger',
  TRAIN_SMART: 'Qualité',
  TRAIN_HARD: 'Intense',
  RACE_READY: 'Pic',
  INSUFFICIENT_DATA: 'En attente',
};

/** Non-morning protect still softens the recover tag; other verdicts keep their tag. */
function postureLabelForVerdict(
  verdict: OverallVerdict,
  posture: TodayPosture,
  phase: DailyPhase,
): string | null {
  if (phase === 'END_OF_DAY' || phase === 'SESSION_COMPLETED') {
    return null;
  }
  if (verdict === 'RECOVER' && posture === 'protect' && phase !== 'MORNING') {
    return 'Repos fragile';
  }
  return VERDICT_STATUS_TAG[verdict];
}

/** Rest-day equivalent of RECOVERY_WINDOW's reminders. No session to reference. */
const REST_DAY_ADAPTATION_REMINDERS = [
  'Profite du repos pour bien manger et t’hydrater.',
  'Mobilité ou marche légère pour rester actif sans charger.',
  'Le sommeil consolide l’adaptation des jours précédents.',
];

const ADAPTATION_REMINDERS: Record<
  Extract<DailyPhase, 'RECOVERY_WINDOW' | 'END_OF_DAY'>,
  string[]
> = {
  RECOVERY_WINDOW: [
    'Mange dans les 2 h pour soutenir la récupération.',
    'Étirements ou marche légère si tu restes actif.',
    'Le sommeil consolide ce que la séance a lancé.',
  ],
  END_OF_DAY: [
    'Vise ta fenêtre de sommeil ce soir.',
    'La fatigue de demain se joue souvent ce soir.',
  ],
};

function phaseOf(input: PhaseNarrativeInput): DailyPhase {
  return input.resolution.phase;
}

function postureFromGoalContext(input: PhaseNarrativeInput): TodayPosture | null {
  const { verdict, goalContext } = input;
  if (!goalContext?.linkedToTodaySession || !isForwardAdvicePhase(phaseOf(input))) {
    return null;
  }
  if (verdict === 'RECOVER' || verdict === 'CAUTION') {
    return 'protect';
  }
  return 'push';
}

function trainHardPostureForPhase(phase: DailyPhase): TodayPosture {
  return phase === 'END_OF_DAY' || phase === 'RECOVERY_WINDOW' ? 'steady' : 'push';
}

function postureFromVerdict(input: PhaseNarrativeInput): TodayPosture {
  const { verdict } = input;
  const phase = phaseOf(input);

  if (verdict === 'RECOVER' || verdict === 'CAUTION') {
    return 'protect';
  }
  if (verdict === 'RACE_READY') {
    return 'push';
  }
  if (verdict === 'TRAIN_HARD') {
    return trainHardPostureForPhase(phase);
  }
  if (verdict === 'TRAIN_EASY' || verdict === 'TRAIN_SMART') {
    return 'steady';
  }
  return 'uncertain';
}

function resolvePosture(input: PhaseNarrativeInput): TodayPosture {
  const phase = phaseOf(input);
  const { limitingFactorMessage } = input;

  if (
    phase === 'END_OF_DAY' &&
    limitingFactorMessage &&
    /récupération|déficit|fatigue|sommeil/i.test(limitingFactorMessage)
  ) {
    return 'protect';
  }

  return postureFromGoalContext(input) ?? postureFromVerdict(input);
}

function goalSuffix(goalContext: TodayGoalContext): string {
  return goalContext.badge ? ` · ${goalContext.badge}` : '';
}

function goalLineForPhase(input: PhaseNarrativeInput): string | null {
  const { goalContext } = input;
  if (!goalContext) {
    return null;
  }

  if (goalContext.isPrimaryRace) {
    return `${goalContext.title}${goalSuffix(goalContext)}`;
  }

  if (isSet(goalContext.daysUntil) && goalContext.daysUntil <= 21) {
    return `${goalContext.title}${goalSuffix(goalContext)}`;
  }

  return null;
}

function adaptationRemindersForInput(input: PhaseNarrativeInput): string[] {
  const phase = phaseOf(input);
  if (phase === 'RECOVERY_WINDOW') {
    return isRestDayRecoveryWindow(input)
      ? REST_DAY_ADAPTATION_REMINDERS
      : ADAPTATION_REMINDERS[phase];
  }
  if (phase === 'END_OF_DAY') {
    return ADAPTATION_REMINDERS[phase];
  }
  return [];
}

function forwardPhaseFocusPriority(input: PhaseNarrativeInput): string | null {
  const { actionLine, goalContext, verdict } = input;
  if (!actionLine) {
    return null;
  }
  // Race title lives only in the action line (Today verdict plate no longer shows a goal chip).
  if (goalContext?.linkedToTodaySession && verdict === 'RECOVER') {
    return `Allège la séance. Elle sert ${goalContext.title}`;
  }
  if (goalContext?.linkedToTodaySession && verdict === 'CAUTION') {
    return `Reste sous contrôle. Qualité pour ${goalContext.title}`;
  }
  return actionLine;
}

function sessionCompletedFocusPriority(input: PhaseNarrativeInput): string | null {
  const { goalContext } = input;
  if (goalContext?.linkedToTodaySession) {
    return `Récupère dans les 2 h. Consolide ce que tu as fait pour ${goalContext.title}`;
  }
  return 'Récupère dans les 2 h avant le prochain signal';
}

function recoveryWindowFocusPriority(input: PhaseNarrativeInput): string | null {
  if (isRestDayRecoveryWindow(input)) {
    return 'Mobilité ou marche légère pour rester actif sans charger.';
  }

  const effortLevel = resolveEffortLevel(input);
  const recoveryStress = isRecoveryStress(input.limitingFactorMessage);

  if (recoveryStress || effortLevel === 'high') {
    return 'Nutrition et sommeil sont tes leviers de récupération.';
  }
  if (effortLevel === 'moderate') {
    return 'Le corps digère la séance. Laisse-le travailler.';
  }
  return 'L\u2019adaptation se joue maintenant. Repos actif.';
}

function focusPriorityForPhase(
  input: PhaseNarrativeInput,
  _adaptationReminders: string[],
): string | null {
  const phase = phaseOf(input);

  if (isForwardAdvicePhase(phase)) {
    return forwardPhaseFocusPriority(input);
  }
  if (phase === 'SESSION_COMPLETED') {
    return sessionCompletedFocusPriority(input);
  }
  if (phase === 'RECOVERY_WINDOW') {
    return recoveryWindowFocusPriority(input);
  }
  return null;
}

function inferEffortFromTss(totalTssToday: number | null): TodayEffortLevel | null {
  if (totalTssToday === undefined || totalTssToday === null) {
    return null;
  }
  if (totalTssToday >= 65) {
    return 'high';
  }
  if (totalTssToday >= 30) {
    return 'moderate';
  }
  return 'light';
}

function resolveEffortLevel(input: PhaseNarrativeInput): TodayEffortLevel | null {
  return input.evening?.effortLevel ?? inferEffortFromTss(input.totalTssToday);
}

/** RECOVERY_WINDOW on a day with zero sessions. No "après {sport}" premise to build on. */
function restDayRecoveryHeadline(posture: TodayPosture): string {
  return posture === 'protect'
    ? 'Jour de repos. Récupération à préserver'
    : 'Jour de repos. Fenêtre d’adaptation ouverte';
}

function sessionCompletedHeadline(input: {
  goalContext: PhaseNarrativeInput['goalContext'];
  load: string;
  effortLevel: TodayEffortLevel | null;
  recoveryStress: boolean;
  posture: TodayPosture;
}): string {
  if (input.goalContext?.linkedToTodaySession) {
    return `${input.load}. Au service de ${input.goalContext.title}`;
  }
  if (input.recoveryStress || input.posture === 'protect') {
    return `${input.load}. Récupération prioritaire maintenant`;
  }
  if (input.effortLevel === 'high') {
    return `${input.load}. Laisse le corps digérer`;
  }
  if (input.effortLevel === 'moderate') {
    return `${input.load}. Place à la récupération`;
  }
  return `${input.load}. Séance dans les jambes`;
}

function recoveryWindowHeadline(
  load: string,
  effortLevel: TodayEffortLevel | null,
  recoveryStress: boolean,
  posture: TodayPosture,
): string {
  if (recoveryStress || posture === 'protect') {
    return `${load}. Récupération à consolider`;
  }
  if (effortLevel === 'high') {
    return `${load}. Nutrition et sommeil d'abord`;
  }
  return `${load}. Fenêtre d’adaptation ouverte`;
}

function postTrainingHeadline(
  phase: 'SESSION_COMPLETED' | 'RECOVERY_WINDOW',
  input: PhaseNarrativeInput,
  posture: TodayPosture,
): string {
  const effortLevel = resolveEffortLevel(input);
  const recoveryStress = isRecoveryStress(input.limitingFactorMessage);
  const load = dayLoadLabel(effortLevel, (input.evening?.completedSessionCount ?? 1) >= 2);

  if (phase === 'SESSION_COMPLETED') {
    return sessionCompletedHeadline({
      goalContext: input.goalContext,
      load,
      effortLevel,
      recoveryStress,
      posture,
    });
  }
  return recoveryWindowHeadline(load, effortLevel, recoveryStress, posture);
}

function morningHeadline(verdict: OverallVerdict): string {
  switch (verdict) {
    case 'RECOVER':
      return 'Priorité au repos';
    case 'TRAIN_HARD':
      return 'Journée propice à l’effort';
    case 'RACE_READY':
      return 'Fenêtre de performance';
    case 'TRAIN_EASY':
      return 'Journée légère';
    case 'CAUTION':
      return 'Signaux à ménager';
    case 'TRAIN_SMART':
      return 'Journée qualité';
    default:
      return 'Pas encore de verdict fiable';
  }
}

function insufficientDataHeadline(input: PhaseNarrativeInput): string | null {
  const { resolution, verdict, adviceActionable } = input;
  if (
    !adviceActionable &&
    isForwardAdvicePhase(resolution.phase) &&
    (verdict === 'INSUFFICIENT_DATA' || !verdict)
  ) {
    return 'Pas encore de verdict fiable';
  }
  return null;
}

function phaseHeadlineForPostTraining(
  input: PhaseNarrativeInput,
  posture: TodayPosture,
): string | null {
  const phase = phaseOf(input);
  if (phase === 'SESSION_COMPLETED') {
    return postTrainingHeadline('SESSION_COMPLETED', input, posture);
  }
  if (phase === 'RECOVERY_WINDOW') {
    return isRestDayRecoveryWindow(input)
      ? restDayRecoveryHeadline(posture)
      : postTrainingHeadline('RECOVERY_WINDOW', input, posture);
  }
  return null;
}

function headlineForPhase(input: PhaseNarrativeInput, posture: TodayPosture): string {
  const withheld = insufficientDataHeadline(input);
  if (withheld) {
    return withheld;
  }

  const { resolution, sportLabel } = input;
  const postTraining = phaseHeadlineForPostTraining(input, posture);
  if (postTraining) {
    return postTraining;
  }

  switch (resolution.phase) {
    case 'MORNING':
      return morningHeadline(input.verdict);
    case 'BEFORE_SESSION':
      return sportLabel ? `Séance ${sportLabel} à venir` : 'Séance à venir';
    case 'END_OF_DAY':
      return 'Bilan de la journée';
    default:
      return 'Aujourd’hui';
  }
}

function morningSubline(input: PhaseNarrativeInput): string {
  const { adviceActionable, verdict } = input;
  if (!adviceActionable) {
    if (verdict === 'INSUFFICIENT_DATA' || !verdict) {
      return 'Synchronise ton état avant de décider.';
    }
    return 'Lecture prudente. Confiance partielle sur les signaux du jour.';
  }
  return 'Lis ton orientation, puis décide pour la séance.';
}

function postTrainingSubline(
  phase: DailyPhase,
  focusPriority: string | null,
  dailyStrainAvailable: boolean,
): string {
  if (focusPriority) {
    return '';
  }
  if (phase === 'SESSION_COMPLETED') {
    if (!dailyStrainAvailable) {
      return 'Charge en cours de calcul. Le débrief s’affine sous peu.';
    }
    return 'La séance est dans les jambes. Place à la récupération.';
  }
  if (phase === 'RECOVERY_WINDOW') {
    return 'Nutrition, hydratation et sommeil : les leviers d’adaptation.';
  }
  return 'La fenêtre de sommeil de ce soir oriente demain.';
}

function defaultPhaseSubline(input: PhaseNarrativeInput): string {
  return isForwardAdvicePhase(phaseOf(input)) && input.sportLabel ? input.sportLabel : '';
}

function sublineForPhase(input: PhaseNarrativeInput, focusPriority: string | null): string {
  const phase = phaseOf(input);
  if (focusPriority && phase !== 'SESSION_COMPLETED') {
    return '';
  }
  if (phase === 'MORNING') {
    return morningSubline(input);
  }
  if (phase === 'BEFORE_SESSION') {
    return 'Adapte l’intensité à ta forme du moment.';
  }
  if (phase === 'SESSION_COMPLETED' || phase === 'RECOVERY_WINDOW' || phase === 'END_OF_DAY') {
    return postTrainingSubline(phase, focusPriority, input.dailyStrainAvailable);
  }
  return defaultPhaseSubline(input);
}

export function buildPhaseNarrative(input: PhaseNarrativeInput): PhaseNarrative {
  const phase = phaseOf(input);
  const adaptationReminders = adaptationRemindersForInput(input);
  const posture = resolvePosture(input);
  let focusPriority = focusPriorityForPhase(input, adaptationReminders);
  let headline = headlineForPhase(input, posture);
  const goalLine = goalLineForPhase(input);

  if (phase === 'END_OF_DAY' && input.evening) {
    const { headline: eveningHeadline, focusPriority: eveningFocusPriority } =
      buildEndOfDayNarrativeCopy({
        sportLabel: input.sportLabel,
        totalTssToday: input.totalTssToday,
        totalDurationMin: input.evening.totalDurationMin,
        effortLevel: input.evening.effortLevel,
        completedSessionCount: input.evening.completedSessionCount,
        tomorrowSession: input.evening.tomorrowSession,
        sleep: input.evening.sleep,
        recoveryStress: isRecoveryStress(input.limitingFactorMessage),
      });
    headline = eveningHeadline;
    focusPriority = eveningFocusPriority;
  }

  const narrative: PhaseNarrative = {
    heroEyebrow: isRestDayRecoveryWindow(input)
      ? 'Jour de repos'
      : (PHASE_HERO_EYEBROW[phase] ?? input.resolution.primaryQuestion),
    heroHeadline: headline,
    heroSubline: sublineForPhase(input, focusPriority),
    whyFocus: input.resolution.whyFocus,
    posture,
    postureLabel: postureLabelForVerdict(input.verdict, posture, phase) ?? '',
    focusPriority,
    goalLine,
    adaptationReminders,
  };

  assertPhaseNarrativeConsistency(phase, narrative.heroEyebrow);
  return narrative;
}

export function assertPhaseNarrativeConsistency(phase: DailyPhase, heroEyebrow: string): void {
  if (!isPostTrainingPhase(phase)) {
    return;
  }

  const forbidden = /entraîner fort|train hard|peux-tu t/i;
  if (forbidden.test(heroEyebrow)) {
    throw new Error(`Forward training question in post-training phase ${phase}`);
  }
}

export function pickAdaptationReminders(phase: DailyPhase, limit = 2, isRestDay = false): string[] {
  if (phase === 'RECOVERY_WINDOW') {
    return (isRestDay ? REST_DAY_ADAPTATION_REMINDERS : ADAPTATION_REMINDERS.RECOVERY_WINDOW).slice(
      0,
      limit,
    );
  }
  if (phase === 'END_OF_DAY') {
    return ADAPTATION_REMINDERS.END_OF_DAY.slice(0, limit);
  }
  return [];
}
