/**
 * The coach context written as the prompt's text, section by section.
 */
import { isSet } from '@sharpit/shared/value';
import { travelTrainingConstraintLabel } from '@sharpit/app/lib/travel-context/training-constraint';
import { travelDisciplineLabels } from '@sharpit/app/lib/travel-context/disciplines';
import { resolve, resolveCode } from '@sharpit/app/lib/french';
import { formatEquipmentForCoach } from '@sharpit/app/lib/equipment/format';
import { formatPracticedSportsForCoach } from '@sharpit/app/lib/practiced-sports';
import {
  weekdayLabels,
  type TrainingAvailability,
} from '@sharpit/app/lib/training-availability/types';
import {
  mapActivityForCoachRecent,
  type CoachActivity,
  type CoachContextData,
} from '@sharpit/server/lib/coach/context/coach-context-assembly';

type CoachContext = CoachContextData;

const VERDICT_FR: Record<string, string> = {
  TRAIN_HARD: 'Entraîne-toi fort',
  TRAIN_SMART: 'Entraîne-toi malin',
  TRAIN_EASY: 'Entraîne-toi doucement',
  RECOVER: 'Récupère',
  RACE_READY: 'Pic de forme',
  CAUTION: 'Prudence (conflits détectés)',
};

const CONSISTENCY_FR: Record<string, string> = {
  ALIGNED: 'Alignés',
  PARTIALLY_ALIGNED: 'Partiellement alignés',
  CONFLICTING: 'En conflit',
};

/** Low / insufficient Decision confidence — cold start or weak Twin history. */
export function isCalibratingConfidenceTier(tier: string | null | undefined): boolean {
  return tier === 'LOW' || tier === 'INSUFFICIENT';
}

export const CALIBRATING_COACH_LINE =
  'État : en calibration — historique encore court ou données insuffisantes. Évite les prescriptions dures ; privilégie des conseils prudents et factuels.';

/**
 * Renders the canonical Decision Engine block for the Coach prompt.
 *
 * `prescriptiveAdviceAllowed` reuses the exact gate Today uses to decide whether to
 * show `todaysDecision` (see `applyTruthfulnessOverlay` in `snapshot-truthfulness.ts`).
 * When it's false, the verdict/headline/top-action are withheld and the LLM is told
 * explicitly not to prescribe an action — Coach must never contradict Today by
 * discussing a decision Today itself is currently declining to show. Factual
 * observations (limiting factor, model consistency, conflicts, opportunities) are
 * still surfaced either way — only the prescriptive framing is gated.
 */
function formatPrescriptiveDecisionLines(d: NonNullable<CoachContext['decision']>): string[] {
  if (!d.prescriptiveAdviceAllowed) {
    return [
      "Hors fenêtre de conseil actionnable pour aujourd'hui (même règle que Today, qui n'affiche plus de décision à ce moment de la journée) : NE PRESCRIS AUCUNE action et NE MENTIONNE PAS le verdict précis. Tu peux discuter des observations factuelles ci-dessous (facteur limitant, cohérence inter-modèles, historique) si l'athlète pose une question, mais formule-les comme des observations, jamais comme une instruction d'entraînement.",
    ];
  }
  const lines: string[] = [
    `Verdict : ${VERDICT_FR[d.verdict] ?? d.verdict} · confiance ${Math.round((d.confidence ?? 0) * 100)}% (${d.confidenceTier ?? '—'}).`,
  ];
  if (d.headline) {
    lines.push(`Message : ${d.headline}.`);
  }
  if (d.topAction) {
    lines.push(`Action prioritaire : ${d.topAction}${d.rationale ? `. ${d.rationale}` : ''}.`);
  }
  return lines;
}

function appendDecisionEvidenceLines(
  d: NonNullable<CoachContext['decision']>,
  lines: string[],
): void {
  if (d.criticalEvidence) {
    lines.push(`⚠ CRITIQUE : ${resolve(d.criticalEvidence.title)}.`);
  }
  if (d.primaryConflict) {
    lines.push(
      `Conflit résolu (${d.primaryConflict.type.replace(/_/g, ' ').toLowerCase()}) : ${resolveCode(d.primaryConflict.descriptionCode)}.`,
    );
  }
  if (d.primaryOpportunity) {
    lines.push(
      `Opportunité : ${resolve(d.primaryOpportunity.title)} (${d.primaryOpportunity.timeWindow.toLowerCase().replace('_', ' ')}).`,
    );
  }
  if (!d.adviceActionable) {
    lines.push(
      `⚠ Conseil entraînement non actionnable (confiance ou données insuffisantes) — reste prudent et factuel.`,
    );
  }
  if (isCalibratingConfidenceTier(d.confidenceTier)) {
    lines.push(CALIBRATING_COACH_LINE);
  }
}

function formatDecisionObservationLines(d: NonNullable<CoachContext['decision']>): string[] {
  const lines: string[] = [];
  if (d.limitingFactorDescription) {
    lines.push(
      `Facteur limitant : ${d.limitingFactorDomain ?? '—'} — ${d.limitingFactorDescription}.`,
    );
  }
  if (d.physiologicalConsistency) {
    lines.push(
      `Cohérence inter-modèles : ${CONSISTENCY_FR[d.physiologicalConsistency] ?? d.physiologicalConsistency} (score ${d.consistencyScore ?? '—'}/100).`,
    );
  }
  appendDecisionEvidenceLines(d, lines);
  return lines;
}

export function formatDecisionSection(decision: CoachContext['decision']): string[] {
  if (!decision) {
    return [];
  }
  if (decision.verdict === 'INSUFFICIENT_DATA') {
    return [
      `\n## Décision SHARPIT du jour (canonique — à expliquer, ne pas contredire)`,
      CALIBRATING_COACH_LINE,
    ];
  }

  return [
    `\n## Décision SHARPIT du jour (canonique — à expliquer, ne pas contredire)`,
    ...formatPrescriptiveDecisionLines(decision),
    ...formatDecisionObservationLines(decision),
  ];
}

/**
 * Renders temporary, non-travel training-capacity constraints (illness, injury,
 * high work-stress week, etc.) — same trainingConstraint/allowedDisciplines logic
 * as the travel block, without the location/logistics dimension.
 */
function formatConstraintEntry(c: CoachContext['constraints'][number]): string {
  const label = c.label?.trim() || 'Contrainte';
  const constraintLabel =
    travelTrainingConstraintLabel(c.trainingConstraint)?.toLowerCase() ?? 'entraînement normal';
  const sports =
    c.allowedDisciplines.length > 0
      ? ` · sports : ${travelDisciplineLabels(c.allowedDisciplines).join(', ')}`
      : '';
  return `- ${label} : ${c.startDate} → ${c.endDate}${c.isActiveNow ? ' [en cours]' : ' [à venir]'} · contrainte ${c.trainingConstraint} (${constraintLabel})${sports}${c.note ? ` — ${c.note}` : ''}`;
}

export function formatConstraintsSection(constraints: CoachContext['constraints']): string[] {
  if (constraints.length === 0) {
    return [];
  }

  return [
    '\n## Contraintes temporaires',
    "IMPÉRATIF : pour toute séance dont la date tombe dans une de ces périodes, respecte la capacité d'entraînement réduite — ce n'est PAS un déplacement, ne change ni le lieu ni la logistique, seulement le volume/l'intensité proposés.",
    'Contrainte d’entraînement (FULL / REDUCED / MOBILITY_ONLY / NONE) : MOBILITY_ONLY = mobilité/étirements uniquement ; NONE = pas de séance structurée ; REDUCED = volume/intensité réduits.',
    ...constraints.map(formatConstraintEntry),
  ];
}

const FATIGUE_LEVEL_FR: Record<string, string> = {
  FRESH: 'Frais (0-20)',
  FUNCTIONAL_LOW: 'Fatigue normale (21-40)',
  FUNCTIONAL_HIGH: 'Charge productive (41-60)',
  ACCUMULATED: 'Fatigue accumulée (61-75)',
  NON_FUNCTIONAL_RISK: 'Risque surcharge (76-88)',
  OVERREACHING_RISK: 'Surentraînement (89-100)',
};

const TRAINING_CAPACITY_FR: Record<string, string> = {
  FULL: 'totale',
  REDUCED: 'réduite (éviter haute intensité)',
  LIGHT_ONLY: "légère uniquement (Z1-Z2, pas d'intervalles)",
  REST_ONLY: 'repos uniquement',
};

function profileThresholdParts(profile: NonNullable<CoachContext['profile']>): string[] {
  return [
    isSet(profile.ftpW) ? `FTP ${profile.ftpW} W` : null,
    isSet(profile.lthr) ? `LTHR ${profile.lthr} bpm` : null,
    isSet(profile.maxHr) ? `FC max ${profile.maxHr} bpm` : null,
    profile.thresholdPace ? `Allure seuil ${profile.thresholdPace}` : null,
    isSet(profile.vo2maxRunning) ? `VO2max course ${profile.vo2maxRunning}` : null,
    isSet(profile.vo2maxCycling) ? `VO2max vélo ${profile.vo2maxCycling}` : null,
  ].filter(Boolean) as string[];
}

function formatProfileThresholdLines(profile: CoachContext['profile']): string[] {
  if (!profile) {
    return ['Seuils physiologiques : non renseignés (estimations à utiliser).'];
  }
  const seuils = profileThresholdParts(profile);
  return seuils.length ? [`Seuils physiologiques : ${seuils.join(', ')}.`] : [];
}

function appendFatigueWarningLines(
  fatigue: NonNullable<CoachContext['fatigue']>,
  lines: string[],
): void {
  if (fatigue.primaryLimitingFactor) {
    lines.push(`Facteur limitant principal : ${fatigue.primaryLimitingFactor}.`);
  }
  if (fatigue.functionalOverreachingRisk && fatigue.functionalOverreachingRisk !== 'LOW') {
    lines.push(
      `⚠ Risque de surentraînement fonctionnel : ${fatigue.functionalOverreachingRisk}. Priorise la récupération avant d'augmenter la charge.`,
    );
  }
  if (isSet(fatigue.estimatedTimeToFresh) && fatigue.fatigueLevel !== 'FRESH') {
    lines.push(`Retour à l'état frais estimé dans ${fatigue.estimatedTimeToFresh} jour(s).`);
  }
  if (fatigue.performanceImpairmentEstimate && fatigue.performanceImpairmentEstimate > 0.1) {
    lines.push(
      `Capacité de performance estimée à ~${Math.round((1 - fatigue.performanceImpairmentEstimate) * 100)}% du maximum.`,
    );
  }
}

const ADAPTATION_STATUS_FR: Record<string, string> = {
  POSITIVELY_ADAPTING: 'Adaptation positive',
  MAINTAINING: 'Maintien',
  PLATEAUING: 'Plateau',
  MALADAPTING: 'Maladaptation',
  DETRAINING: 'Désentraînement',
};

const ADAPTATION_TREND_FR: Record<string, string> = {
  IMPROVING: 'En progression',
  STABLE: 'Stable',
  DECLINING: 'En déclin',
};

function fatigueSummaryBits(fatigue: NonNullable<CoachContext['fatigue']>): string[] {
  return [
    isSet(fatigue.fatigueIndex) ? `Index ${fatigue.fatigueIndex}/100` : null,
    fatigue.fatigueLevel ? (FATIGUE_LEVEL_FR[fatigue.fatigueLevel] ?? fatigue.fatigueLevel) : null,
    fatigue.trainingCapacity
      ? `Capacité d'entraînement ${TRAINING_CAPACITY_FR[fatigue.trainingCapacity] ?? fatigue.trainingCapacity}`
      : null,
    fatigue.trajectory ? `Tendance : ${fatigue.trajectory}` : null,
  ].filter(Boolean) as string[];
}

function formatFatigueSection(fatigue: CoachContext['fatigue']): string[] {
  if (!fatigue?.fatigueLevel || fatigue.fatigueLevel === 'INSUFFICIENT_DATA') {
    return [];
  }
  const lines = [
    `\n## Fatigue Intelligence (modèle multi-dimensionnel SHARPIT)\n${fatigueSummaryBits(fatigue).join(' · ')}.`,
  ];
  appendFatigueWarningLines(fatigue, lines);
  return lines;
}

function appendAdaptationWarningLines(
  adaptation: NonNullable<CoachContext['adaptation']>,
  lines: string[],
): void {
  if (adaptation.limitingFactor) {
    lines.push(`Facteur limitant domaine : ${adaptation.limitingFactor}.`);
  }
  if (adaptation.overreachingWithoutAdaptationDetected) {
    lines.push(
      `⚠ Surentraînement sans adaptation détecté : charge élevée sans réponse autonomique. Réduire immédiatement.`,
    );
  }
  if (adaptation.plateauRisk) {
    lines.push(
      `⚠ Risque de plateau : ≥ 14 jours sans progression d'adaptation. Un changement de stimulus est nécessaire.`,
    );
  }
  if (isSet(adaptation.estimatedAdaptationPeak)) {
    lines.push(`Pic de forme estimé dans ${adaptation.estimatedAdaptationPeak} jour(s).`);
  }
}

function adaptationSummaryBits(adaptation: NonNullable<CoachContext['adaptation']>): string[] {
  return [
    isSet(adaptation.adaptationIndex) ? `Index ${adaptation.adaptationIndex}/100` : null,
    adaptation.adaptationStatus
      ? (ADAPTATION_STATUS_FR[adaptation.adaptationStatus] ?? adaptation.adaptationStatus)
      : null,
    adaptation.adaptationTrend
      ? (ADAPTATION_TREND_FR[adaptation.adaptationTrend] ?? adaptation.adaptationTrend)
      : null,
  ].filter(Boolean) as string[];
}

function formatAdaptationSection(adaptation: CoachContext['adaptation']): string[] {
  if (!adaptation?.adaptationStatus || adaptation.adaptationStatus === 'INSUFFICIENT_DATA') {
    return [];
  }
  const lines = [
    `\n## Adaptation Intelligence (modèle multi-dimensionnel SHARPIT)\n${adaptationSummaryBits(adaptation).join(' · ')}.`,
  ];
  appendAdaptationWarningLines(adaptation, lines);
  return lines;
}

function environmentSummaryBits(environment: CoachContext['environment']): string[] {
  return [
    environment.homeLabel ? `lieu ${environment.homeLabel}` : null,
    isSet(environment.airTemperatureC) ? `${Math.round(environment.airTemperatureC)} °C` : null,
    isSet(environment.relativeHumidityPct)
      ? `humidité ${Math.round(environment.relativeHumidityPct)} %`
      : null,
    environment.thermalLabel,
  ].filter(Boolean) as string[];
}

function appendEnvironmentAdjustmentLines(
  environment: CoachContext['environment'],
  lines: string[],
): void {
  if (isSet(environment.recoveryDemandAdjustment) && environment.recoveryDemandAdjustment !== 0) {
    lines.push(
      `Ajustement récupération lié à l'environnement : ${environment.recoveryDemandAdjustment > 0 ? '+' : ''}${Math.round(environment.recoveryDemandAdjustment * 100)} %.`,
    );
  }
  if (isSet(environment.performanceAdjustment) && environment.performanceAdjustment !== 0) {
    lines.push(
      `Ajustement performance attendu : ${environment.performanceAdjustment > 0 ? '+' : ''}${Math.round(environment.performanceAdjustment * 100)} %.`,
    );
  }
}

function formatEnvironmentSection(environment: CoachContext['environment']): string[] {
  const bits = environmentSummaryBits(environment);
  if (!bits.length && !environment.summaryLine && !environment.detailLine) {
    return [];
  }
  const lines = ['\n## Environnement du jour'];
  if (bits.length) {
    lines.push(`${bits.join(' · ')}.`);
  }
  if (environment.summaryLine) {
    lines.push(environment.summaryLine);
  }
  if (environment.detailLine) {
    lines.push(environment.detailLine);
  }
  appendEnvironmentAdjustmentLines(environment, lines);
  return lines;
}

function healthSummaryBits(health: CoachContext['health']): string[] {
  return [
    isSet(health.readinessToday) ? `Readiness du jour ${health.readinessToday}/100` : null,
    health.readinessLevel ? `(${health.readinessLevel})` : null,
    health.hrvStatus ? `HRV ${health.hrvStatus}` : null,
    isSet(health.bodyBattery) ? `Body Battery ${health.bodyBattery}` : null,
    isSet(health.avgSleepMin)
      ? `sommeil moy 7j ${Math.floor(health.avgSleepMin / 60)}h${(health.avgSleepMin % 60).toString().padStart(2, '0')}`
      : null,
    isSet(health.avgRestingHr) ? `FC repos moy ${health.avgRestingHr}` : null,
    isSet(health.avgHrv) ? `HRV moy ${health.avgHrv}` : null,
  ].filter(Boolean) as string[];
}

function formatHealthSection(health: CoachContext['health']): string[] {
  const healthBits = healthSummaryBits(health);
  return healthBits.length ? [`\n## Récupération\n${healthBits.join(' · ')}.`] : [];
}

/** What the athlete logged eating today, so a fuelling question reads the plate (ADR-061). */
export function formatNutritionSection(nutrition: CoachContext['nutrition']): string[] {
  if (!nutrition) {
    return [];
  }
  return [
    `\n## Nutrition du jour\n${nutrition.calories} kcal · ${nutrition.protein} g protéines · ${nutrition.carbs} g glucides · ${nutrition.fat} g lipides (journal à ce stade de la journée).`,
  ];
}

function formatPrimaryRaceLine(primaryRace: NonNullable<CoachContext['primaryRace']>): string {
  const extras = [
    primaryRace.priority ? `priorité ${primaryRace.priority}` : null,
    primaryRace.raceFormat,
    primaryRace.targetPerformance ? `objectif visé : ${primaryRace.targetPerformance}` : null,
  ].filter(Boolean);
  return `Course principale : ${primaryRace.title}${primaryRace.location ? ` (${primaryRace.location})` : ''} dans ${primaryRace.daysToGo} jours (~${Math.round(primaryRace.daysToGo / 7)} semaines)${extras.length ? ` — ${extras.join(', ')}` : ''}.`;
}

export function formatMetricGoalLine(goal: CoachContext['metricGoals'][number]): string {
  if (goal.target === undefined || goal.target === null) {
    return `Objectif métrique : ${goal.title}.`;
  }
  const current = isSet(goal.current) ? ` (actuel ${goal.current})` : '';
  return `Objectif métrique : ${goal.title} → cible ${goal.target}${goal.unit ?? ''}${current}.`;
}

function formatGoalsSection(ctx: CoachContext): string[] {
  const lines = ['\n## Objectifs'];
  if (ctx.primaryRace) {
    lines.push(formatPrimaryRaceLine(ctx.primaryRace));
  } else {
    lines.push('Pas de course planifiée.');
  }
  for (const race of ctx.races.filter((entry) => entry !== ctx.primaryRace)) {
    const extras = [
      race.priority ? `prio ${race.priority}` : null,
      race.targetPerformance ? `objectif : ${race.targetPerformance}` : null,
    ].filter(Boolean);
    lines.push(
      `Autre course : ${race.title} dans ${race.daysToGo} j${extras.length ? ` (${extras.join(', ')})` : ''}.`,
    );
  }
  lines.push(...ctx.metricGoals.map(formatMetricGoalLine));
  return lines;
}

function formatRecentActivityLine(a: CoachContext['recent'][number]): string {
  const extra = [
    isSet(a.load) ? `charge ${a.load}` : null,
    isSet(a.rpe) ? `RPE ${a.rpe}` : null,
    a.feeling ? `ressenti ${a.feeling}` : null,
    a.detail || null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `- ${a.date}${a.relativeDay ? ` (${a.relativeDay})` : ''} · ${a.type} ${a.title} (${a.duration})${extra ? ` — ${extra}` : ''}`;
}

/** One activity in the « Séances récentes » line format. */
export function formatCoachActivityLine(activity: CoachActivity, today: Date): string {
  return formatRecentActivityLine(mapActivityForCoachRecent(activity, today));
}

function formatRecentActivitiesSection(recent: CoachContext['recent']): string[] {
  if (!recent.length) {
    return [];
  }
  return ['\n## Séances récentes (14 dernières)', ...recent.map(formatRecentActivityLine)];
}

function formatPhysicalSection(physical: CoachContext['physical']): string[] {
  if (!physical.length) {
    return [];
  }
  return [
    '\n## Condition physique à respecter (douleurs / blessures / mobilité / posture)',
    "IMPÉRATIF : NE CONFONDS PAS les catégories, car elles n'impliquent PAS la même adaptation :",
    "- Douleur / Blessure : ne charge pas la zone concernée, réduis ou supprime l'intensité, voire annule la séance si la sévérité est élevée. C'est une contrainte forte.",
    "- Mobilité / Posture : ce N'EST PAS une douleur — n'allège pas l'endurance ni l'intensité pour ça. Propose plutôt du travail ciblé (mobilité, gainage, renforcement correctif) en complément, sans réduire la charge des séances clés.",
    "Tiens compte de la sévérité, de la tendance (amélioration/aggravation) et de la capacité fonctionnelle (symptôme ≠ capacité d'entraînement) pour doser.",
    'Les estimations SHARPIT sont des aides à la décision — jamais un diagnostic médical.',
    ...physical.map((p) => {
      const bits = [
        `${p.category} : ${p.title}`,
        p.bodyPart ? `zone ${p.bodyPart}${p.side ? ` (${p.side})` : ''}` : null,
        isSet(p.severity) ? `sévérité inférée ${p.severity}/10` : null,
        `statut ${p.status}`,
        p.strategy ? `conduite ${p.strategy}` : null,
        p.trend ? `tendance ${p.trend}` : null,
        p.functionalCapacity ? `capacité fonctionnelle ${p.functionalCapacity}` : null,
        isSet(p.confidence) ? `confiance ${Math.round(p.confidence * 100)}%` : null,
        p.description || null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `- ${bits}`;
    }),
  ];
}

function formatTravelSection(travel: CoachContext['travel']): string[] {
  if (!travel.length) {
    return [];
  }
  return [
    '\n## Déplacements / voyages',
    "IMPÉRATIF : pour toute séance dont la date tombe dans une période de déplacement, adapte le lieu (météo, altitude, chaleur attendue) et la logistique — ne propose pas une séance nécessitant du matériel resté au domicile (ex. home trainer, piscine spécifique) si l'athlète est en déplacement.",
    'Respecte aussi la contrainte d’entraînement du voyage (FULL / REDUCED / MOBILITY_ONLY / NONE) : MOBILITY_ONLY = mobilité/étirements uniquement ; NONE = pas de séance structurée ; REDUCED = volume/intensité réduits.',
    'Quand une ligne indique « sports : … », cette liste est une contrainte STRICTE choisie par l’athlète : ne crée, ne déplace ni ne propose AUCUNE séance d’un autre sport pendant ces dates (une séance de mobilité n’est pas du renfo). Ces déplacements sont DÉJÀ enregistrés : ne les recrée pas et ne modifie pas leurs sports.',
    ...travel.map((t) => {
      const label = t.label?.trim() || t.locationLabel;
      const constraintLabel =
        travelTrainingConstraintLabel(t.trainingConstraint)?.toLowerCase() ?? 'entraînement normal';
      const sports =
        t.allowedDisciplines.length > 0
          ? ` · sports : ${travelDisciplineLabels(t.allowedDisciplines).join(', ')}`
          : '';
      return `- ${label} (${t.locationLabel}) : ${t.startDate} → ${t.endDate}${t.isActiveNow ? ' [en cours]' : ' [à venir]'} · contrainte ${t.trainingConstraint} (${constraintLabel})${sports}${t.note ? ` — ${t.note}` : ''}`;
    }),
  ];
}

function formatPersonalNoteSection(note: string | null): string[] {
  if (!note) {
    return [];
  }
  return [
    "\n## Contexte personnel (défini par l'athlète — priorité haute)",
    'Prends impérativement en compte ces contraintes/préférences pour la pertinence des propositions (dispos, charge de travail, jours propices aux grosses séances, etc.) :',
    note,
  ];
}

function formatPmcSection(ctx: CoachContext): string[] {
  return [
    `\n## État de forme (PMC)\nForme/Fitness CTL ${ctx.fitness.ctl} · Fatigue ATL ${ctx.fitness.atl} · Fraîcheur TSB ${ctx.fitness.tsb}.`,
    `Charge 7j : ${ctx.load.weeklyLoad} · ratio aigu/chronique ${ctx.load.acwr} · fatigue ${ctx.load.fatigue}.`,
    'Interprétation TSB : >5 frais, -10..5 neutre, <-10 fatigué, <-30 surcharge.',
  ];
}

/**
 * Declared intent and observed reality are two different facts, and the gap
 * between them is itself coaching signal: a plan built on four wanted days when
 * three actually happen is a plan that will slip. Label both rather than letting
 * one stand in for the other.
 */
function formatAvailabilitySection(
  declared: TrainingAvailability,
  observedDays: string[],
): string[] {
  const lines: string[] = [];
  if (declared.targetSessionsPerWeek !== null) {
    lines.push(`Souhaité : ${declared.targetSessionsPerWeek} séances par semaine.`);
  }
  if (declared.availableWeekdays.length > 0) {
    lines.push(`Jours déclarés libres : ${weekdayLabels(declared.availableWeekdays).join(', ')}.`);
  }
  if (observedDays.length > 0) {
    lines.push(`Jours observés (8 dernières semaines) : ${observedDays.join(', ')}.`);
  }
  return lines.length > 0 ? [`\n## Disponibilités\n${lines.join('\n')}`] : [];
}

function formatRealizedSessionsSection(
  realizedSessions: CoachContext['realizedSessions'],
): string[] {
  if (!realizedSessions.length) {
    return [];
  }
  return [
    '\n## Exécution des séances prévues récentes (prévu vs réalisé)',
    ...realizedSessions.map(
      (r) =>
        `- ${r.date} · ${r.type} ${r.title} → conformité ${r.score ?? '?'}/100${r.verdict ? ` (${r.verdict})` : ''}${r.summary ? ` — ${r.summary}` : ''}`,
    ),
  ];
}

type UpcomingPlanned = CoachContext['upcomingPlanned'][number];

/**
 * « brick B1 · jambe 1/2 » for each leg of a brick, so the coach sees the legs as one session:
 * listed alone, they read as unrelated sessions it rebuilt rather than moved. Groups are numbered
 * in their order of appearance.
 */
function brickLabels(upcomingPlanned: readonly UpcomingPlanned[]): Map<string, string> {
  const legsByGroup = new Map<string, UpcomingPlanned[]>();
  for (const session of upcomingPlanned) {
    if (session.brickGroupId) {
      legsByGroup.set(session.brickGroupId, [
        ...(legsByGroup.get(session.brickGroupId) ?? []),
        session,
      ]);
    }
  }
  const labels = new Map<string, string>();
  [...legsByGroup.values()].forEach((legs, groupIndex) => {
    legs.forEach((leg, legIndex) => {
      const position = (leg.brickOrder ?? legIndex) + 1;
      labels.set(leg.id, `brick B${groupIndex + 1} · jambe ${position}/${legs.length}`);
    });
  });
  return labels;
}

function formatUpcomingPlannedSection(upcomingPlanned: CoachContext['upcomingPlanned']): string[] {
  if (!upcomingPlanned.length) {
    return [];
  }
  const bricks = brickLabels(upcomingPlanned);
  return [
    '\n## Déjà planifié (ne pas dupliquer — utiliser les id ci-dessous)',
    ...(bricks.size
      ? [
          'Les jambes d’un même brick forment une seule séance : pour le déplacer, change la date d’une jambe avec updatePlannedSession, toutes suivent.',
        ]
      : []),
    ...upcomingPlanned.map((p) => {
      const extras = [
        bricks.get(p.id) ? `(${bricks.get(p.id)})` : null,
        p.startTime ? `à ${p.startTime}` : null,
        p.intensity ? `[${p.intensity}]` : null,
        p.durationMin ? `${p.durationMin} min` : null,
        p.locationLabel ? `@ ${p.locationLabel}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      return `- id=${p.id} · ${p.dateIso} (${p.date}) · ${p.type} ${p.title}${extras ? ` ${extras}` : ''}`;
    }),
  ];
}

/** The parts of the coach context, so a request can carry only those it needs. */
export const COACH_CONTEXT_SECTIONS = [
  'note',
  'thresholds',
  'sports',
  'equipment',
  'pmc',
  'fatigue',
  'adaptation',
  'decision',
  'environment',
  'health',
  'nutrition',
  'availability',
  'goals',
  'recent',
  'realized',
  'physical',
  'travel',
  'constraints',
  'upcoming',
  'scenario',
] as const;

export type CoachContextSection = (typeof COACH_CONTEXT_SECTIONS)[number];

function coachContextSections(ctx: CoachContext): Array<[CoachContextSection, string[]]> {
  return [
    ['note', formatPersonalNoteSection(ctx.note)],
    ['thresholds', formatProfileThresholdLines(ctx.profile)],
    ['sports', [`\n${formatPracticedSportsForCoach(ctx.practicedSports)}`]],
    ['equipment', [`\n${formatEquipmentForCoach(ctx.equipment)}`]],
    ['pmc', formatPmcSection(ctx)],
    ['fatigue', formatFatigueSection(ctx.fatigue)],
    ['adaptation', formatAdaptationSection(ctx.adaptation)],
    ['decision', formatDecisionSection(ctx.decision)],
    ['environment', formatEnvironmentSection(ctx.environment)],
    ['health', formatHealthSection(ctx.health)],
    ['nutrition', formatNutritionSection(ctx.nutrition)],
    ['availability', formatAvailabilitySection(ctx.trainingAvailability, ctx.availableDays)],
    ['goals', formatGoalsSection(ctx)],
    ['recent', formatRecentActivitiesSection(ctx.recent)],
    ['realized', formatRealizedSessionsSection(ctx.realizedSessions)],
    ['physical', formatPhysicalSection(ctx.physical)],
    ['travel', formatTravelSection(ctx.travel)],
    ['constraints', formatConstraintsSection(ctx.constraints)],
    ['upcoming', formatUpcomingPlannedSection(ctx.upcomingPlanned)],
    ['scenario', ctx.scenarioComparison ? [`\n${ctx.scenarioComparison}`] : []],
  ];
}

function collectCoachContextLines(
  ctx: CoachContext,
  sections?: ReadonlySet<CoachContextSection>,
): string[] {
  return [
    `# Profil athlète — ${ctx.today}`,
    ...coachContextSections(ctx)
      .filter(([section]) => !sections || sections.has(section))
      .flatMap(([, lines]) => lines),
  ];
}

/** Rend le contexte en markdown compact pour le prompt système. */
export function formatCoachContext(
  ctx: CoachContext,
  sections?: ReadonlySet<CoachContextSection>,
): string {
  return collectCoachContextLines(ctx, sections).join('\n');
}
