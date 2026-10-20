/**
 * Journal habit × physiology associations — presentation analytics only (no Core).
 *
 * Scientific framing (n=1 athlete mirror, ADR-098):
 * - Association, not causation. Training load is controlled; travel and illness are not.
 * - Null / unset excluded. Constant habits (always yes / always no) yield no contrast.
 * - Central tendency = median (robust to outliers).
 * - Every outcome is a morning reading (the night ending on the day, readiness on waking), so
 *   a habit of day J is compared with the morning of J+1. Prior-night factors already describe
 *   that night, and concurrent states (fever, pain…) share their own morning: both lag 0.
 * - Load: the outcome is adjusted for the TSS of the day before it was measured, by a linear
 *   fit over the athlete's own days, so a habit that follows hard sessions is not blamed for
 *   the sessions.
 * - Net vs lead: a Mann–Whitney rank test per contrast, then Benjamini–Hochberg across every
 *   contrast tested, so testing fifty habits does not manufacture associations.
 * - Habits always logged together are inseparable in the data: one row names them all, and
 *   none of them can be the lever.
 * - recoveryScore vs bodyBattery collapsed when redundant (same polarity); plausibility
 *   priors demote exploratory supplements; contradictory polarities on the same habit are
 *   stripped from actionable findings.
 */

import {
  isDayContextFactorId,
  isPriorNightFactor,
} from '@sharpit/app/lib/journal/day-context-factors';
import { habitOutcomePlausibility } from '@sharpit/app/lib/journal/journal-habit-priors';
import {
  benjaminiHochberg,
  loadAdjuster,
  mannWhitneyPValue,
} from '@sharpit/app/lib/journal/journal-habit-statistics';

export type RecordedFactor = 'yes' | 'no';

export type JournalOutcomeKey = 'sleepMinutes' | 'recoveryScore' | 'bodyBattery';

export type ObservationConfidence = 'high' | 'medium' | 'none';

export type ObservationPolarity = 'plus' | 'minus';

export type JournalAnalysisDay = {
  trainingDayId: string;
  factors: Record<string, RecordedFactor | null>;
  sleepMinutes: number | null;
  recoveryScore: number | null;
  bodyBattery: number | null;
};

export type FactorOutcomeEffect = {
  factorId: string;
  outcome: JournalOutcomeKey;
  nYes: number;
  nNo: number;
  /** Median outcome when habit = yes. */
  medianYes: number;
  /** Median outcome when habit = no. */
  medianNo: number;
  /** Every measured outcome value on days with the habit — the distribution behind medianYes. */
  yesValues: number[];
  /** Every measured outcome value on days without the habit. */
  noValues: number[];
  absDelta: number;
  /** Habit present associated with better (plus) or worse (minus) outcome. */
  polarity: ObservationPolarity;
  confidence: ObservationConfidence;
  lagDays: number;
  /** Two-sided Mann–Whitney p-value of the contrast. */
  pValue: number;
};

export type JournalHabitAnalysisOptions = {
  /**
   * TSS per training day (`YYYY-MM-DD`); a day missing from the map trained 0. Absent: no
   * load adjustment.
   */
  loadByDay?: ReadonlyMap<string, number>;
};

export type JournalHabitFinding = {
  kind: 'effect';
  factorId: string;
  outcome: JournalOutcomeKey;
  nYes: number;
  nNo: number;
  medianYes: number;
  medianNo: number;
  yesValues: number[];
  noValues: number[];
  absDelta: number;
  polarity: ObservationPolarity;
  confidence: 'high' | 'medium';
  lagDays: number;
  /** Habits logged on the same days as this one: the data cannot tell them apart. */
  companionFactorIds?: readonly string[];
};

/** One athlete-facing row: same habit + polarity, possibly several outcomes. */
export type CompiledJournalHabitFinding = {
  kind: 'compiled';
  factorId: string;
  polarity: ObservationPolarity;
  confidence: 'high' | 'medium';
  effects: JournalHabitFinding[];
  /** Habits logged on the same days: the row names them all, and none can be the lever. */
  companionFactorIds: readonly string[];
};

export const OUTCOMES: readonly JournalOutcomeKey[] = [
  'sleepMinutes',
  'recoveryScore',
  'bodyBattery',
];

/** Minimum |median_yes − median_no| to treat as a meaningful gap. */
export const MIN_ABS_DELTA: Record<JournalOutcomeKey, number> = {
  sleepMinutes: 40,
  recoveryScore: 10,
  bodyBattery: 10,
};

/** Solid association: both arms well sampled (~two weeks of contrast). */
export const MIN_N_PER_GROUP_HIGH = 6;

/** Early signal only — still needs a real contrast, not a 3-day fluke. */
export const MIN_N_PER_GROUP_MEDIUM = 4;

/** Share of net associations allowed to be chance, across every contrast tested at once. */
export const NET_FALSE_DISCOVERY_RATE = 0.1;

/** A lead still has to be unlikely as chance on its own. */
export const LEAD_MAX_P_VALUE = 0.2;

/** Two habits this correlated over the days both were noted cannot be told apart. */
export const INSEPARABLE_PHI = 0.7;

/** States the morning already carries (a fever, a period): compared with their own morning. */
const CONCURRENT_STATE_FACTORS: ReadonlySet<string> = new Set([
  'mood_low',
  'menstruation',
  'fever',
  'headache',
  'pain',
  'allergies',
  'cold_congestion',
  'cramps',
  'abdominal_cramps',
  'pregnant',
]);

export function recordedFactorValue(state: string | null | undefined): RecordedFactor | null {
  return state === 'yes' || state === 'no' ? state : null;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Days to shift the outcome relative to the factor's training day. Outcomes are read on waking,
 * so a habit of day J (a supplement, a cold shower, alcohol) can only show on the morning of
 * J+1 — comparing it with morning J would credit it with a night it came after. Prior-night
 * factors already describe the night ending on morning J, and concurrent states share it.
 */
export function outcomeLagDays(factorId: string): number {
  if (isDayContextFactorId(factorId) && isPriorNightFactor(factorId)) {
    return 0;
  }
  return CONCURRENT_STATE_FACTORS.has(factorId) ? 0 : 1;
}

export function shiftTrainingDayId(trainingDayId: string, deltaDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trainingDayId)) {
    return null;
  }
  const [y, m, d] = trainingDayId.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function outcomeValue(day: JournalAnalysisDay, outcome: JournalOutcomeKey): number | null {
  return day[outcome];
}

export function scoreObservationConfidence(input: {
  nYes: number;
  nNo: number;
  absDelta: number;
  outcome: JournalOutcomeKey;
}): ObservationConfidence {
  const { nYes, nNo, absDelta, outcome } = input;
  const threshold = MIN_ABS_DELTA[outcome];
  const minN = Math.min(nYes, nNo);
  const total = nYes + nNo;

  if (minN < MIN_N_PER_GROUP_MEDIUM || absDelta < threshold * 0.8) {
    return 'none';
  }

  const sampleScore = Math.min(1, total / 20) * Math.min(1, minN / MIN_N_PER_GROUP_HIGH);
  const effectScore = Math.min(1, absDelta / (threshold * 1.5));
  const score = sampleScore * 0.6 + effectScore * 0.4;

  return confidenceFromScore({ minN, absDelta, threshold, score });
}

/**
 * Exploratory factors (most supplements) never become "high" and need a high-n
 * sample just to appear as medium. Primary/secondary keep the scored confidence.
 */
export function applyPlausibilityToEffect(effect: FactorOutcomeEffect): FactorOutcomeEffect | null {
  const rank = habitOutcomePlausibility(effect.factorId, effect.outcome);
  if (effect.confidence === 'none') {
    return null;
  }
  if (rank === 'exploratory') {
    const minN = Math.min(effect.nYes, effect.nNo);
    if (minN < MIN_N_PER_GROUP_HIGH) {
      return null;
    }
    return { ...effect, confidence: 'medium' };
  }
  if (rank === 'secondary' && effect.confidence === 'high') {
    const minN = Math.min(effect.nYes, effect.nNo);
    if (minN < MIN_N_PER_GROUP_HIGH + 2) {
      return { ...effect, confidence: 'medium' };
    }
  }
  return effect;
}

/**
 * Same habit lifting one outcome and dragging another is noise under confounders —
 * keep nothing actionable for that factor until the pattern clarifies.
 */
export function dropContradictoryFactorFindings(findings: readonly JournalHabitFinding[]): {
  kept: JournalHabitFinding[];
  incoherentFactorIds: string[];
} {
  const polarities = new Map<string, Set<ObservationPolarity>>();
  for (const finding of findings) {
    const set = polarities.get(finding.factorId) ?? new Set<ObservationPolarity>();
    set.add(finding.polarity);
    polarities.set(finding.factorId, set);
  }

  const incoherentFactorIds = [...polarities.entries()]
    .filter(([, set]) => set.has('plus') && set.has('minus'))
    .map(([factorId]) => factorId)
    .sort();

  if (incoherentFactorIds.length === 0) {
    return { kept: [...findings], incoherentFactorIds };
  }

  const drop = new Set(incoherentFactorIds);
  return {
    kept: findings.filter((finding) => !drop.has(finding.factorId)),
    incoherentFactorIds,
  };
}

function confidenceFromScore(input: {
  minN: number;
  absDelta: number;
  threshold: number;
  score: number;
}): ObservationConfidence {
  const { minN, absDelta, threshold, score } = input;
  if (minN >= MIN_N_PER_GROUP_HIGH && absDelta >= threshold && score >= 0.72) {
    return 'high';
  }
  if (minN >= MIN_N_PER_GROUP_MEDIUM && absDelta >= threshold * 0.9 && score >= 0.5) {
    return 'medium';
  }
  return 'none';
}

function indexDaysById(days: readonly JournalAnalysisDay[]): Map<string, JournalAnalysisDay> {
  const map = new Map<string, JournalAnalysisDay>();
  for (const day of days) {
    map.set(day.trainingDayId, day);
  }
  return map;
}

/** A morning's outcome, brought back to the athlete's average load of the day before it. */
type OutcomeReader = (outcomeDayId: string) => number | null;

/** The TSS of the day before the morning: the session the night and the readiness follow. */
function loadBeforeMorning(loadByDay: ReadonlyMap<string, number>, outcomeDayId: string): number {
  const previous = shiftTrainingDayId(outcomeDayId, -1);
  return previous ? (loadByDay.get(previous) ?? 0) : 0;
}

function outcomeReader(
  days: readonly JournalAnalysisDay[],
  outcome: JournalOutcomeKey,
  loadByDay: ReadonlyMap<string, number> | undefined,
): OutcomeReader {
  const byId = indexDaysById(days);
  const raw = (dayId: string) => {
    const day = byId.get(dayId);
    return day ? outcomeValue(day, outcome) : null;
  };
  if (!loadByDay) {
    return raw;
  }
  const points = days.flatMap((day) => {
    const value = outcomeValue(day, outcome);
    return value === null ? [] : [{ value, load: loadBeforeMorning(loadByDay, day.trainingDayId) }];
  });
  const adjust = loadAdjuster(points);
  if (!adjust) {
    return raw;
  }
  return (dayId) => {
    const value = raw(dayId);
    return value === null ? null : adjust(value, loadBeforeMorning(loadByDay, dayId));
  };
}

function splitOutcomeByFactor(
  days: readonly JournalAnalysisDay[],
  factorId: string,
  lagDays: number,
  readOutcome: OutcomeReader,
): { yesValues: number[]; noValues: number[] } {
  const yesValues: number[] = [];
  const noValues: number[] = [];

  for (const day of days) {
    const factor = day.factors[factorId] ?? null;
    const outcomeDayId = shiftTrainingDayId(day.trainingDayId, lagDays);
    const value = factor === null || !outcomeDayId ? null : readOutcome(outcomeDayId);
    if (value === null) {
      continue;
    }
    (factor === 'yes' ? yesValues : noValues).push(value);
  }

  return { yesValues, noValues };
}

export function compareFactorOutcome(
  days: readonly JournalAnalysisDay[],
  factorId: string,
  outcome: JournalOutcomeKey,
  options: JournalHabitAnalysisOptions & { readOutcome?: OutcomeReader } = {},
): FactorOutcomeEffect | null {
  const lagDays = outcomeLagDays(factorId);
  const readOutcome = options.readOutcome ?? outcomeReader(days, outcome, options.loadByDay);
  const { yesValues, noValues } = splitOutcomeByFactor(days, factorId, lagDays, readOutcome);

  if (yesValues.length === 0 || noValues.length === 0) {
    return null;
  }

  const medianYes = median(yesValues);
  const medianNo = median(noValues);
  const absDelta = Math.abs(medianYes - medianNo);
  const polarity: ObservationPolarity = medianYes >= medianNo ? 'plus' : 'minus';
  const confidence = scoreObservationConfidence({
    nYes: yesValues.length,
    nNo: noValues.length,
    absDelta,
    outcome,
  });

  return {
    factorId,
    outcome,
    nYes: yesValues.length,
    nNo: noValues.length,
    medianYes,
    medianNo,
    yesValues,
    noValues,
    absDelta,
    polarity,
    confidence,
    lagDays,
    pValue: mannWhitneyPValue(yesValues, noValues),
  };
}

function collectFactorIds(days: readonly JournalAnalysisDay[]): string[] {
  const ids = new Set<string>();
  for (const day of days) {
    for (const [id, value] of Object.entries(day.factors)) {
      if (value !== null) {
        ids.add(id);
      }
    }
  }
  return [...ids].sort();
}

function confidenceRank(confidence: 'high' | 'medium'): number {
  return confidence === 'high' ? 2 : 1;
}

export function relativeEffectForFinding(effect: {
  absDelta: number;
  outcome: JournalOutcomeKey;
}): number {
  return effect.absDelta / MIN_ABS_DELTA[effect.outcome];
}

/**
 * Keep sleep freely; between recoveryScore and bodyBattery for the same factor+polarity,
 * keep only the stronger signal (reduces Garmin-composite double counting).
 */
export function collapseRedundantRecoveryFindings(
  findings: readonly JournalHabitFinding[],
): JournalHabitFinding[] {
  const kept: JournalHabitFinding[] = [];
  const recoveryKeys = new Set<string>();

  const sorted = [...findings].sort((a, b) => {
    const conf = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (conf !== 0) {
      return conf;
    }
    return relativeEffectForFinding(b) - relativeEffectForFinding(a);
  });

  for (const finding of sorted) {
    if (finding.outcome === 'sleepMinutes') {
      kept.push(finding);
      continue;
    }
    if (finding.outcome === 'recoveryScore' || finding.outcome === 'bodyBattery') {
      const key = `${finding.factorId}:${finding.polarity}`;
      if (recoveryKeys.has(key)) {
        continue;
      }
      recoveryKeys.add(key);
      kept.push(finding);
      continue;
    }
    kept.push(finding);
  }

  return kept.sort((a, b) => {
    const conf = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (conf !== 0) {
      return conf;
    }
    return relativeEffectForFinding(b) - relativeEffectForFinding(a);
  });
}

/**
 * Phi coefficient of two habits over the days both were noted; null when either never varies
 * there. |phi| near 1 means the journal holds no day that separates them.
 */
export function factorCorrelation(
  days: readonly JournalAnalysisDay[],
  a: string,
  b: string,
): number | null {
  let both = 0;
  let onlyA = 0;
  let onlyB = 0;
  let neither = 0;
  for (const day of days) {
    const x = day.factors[a] ?? null;
    const y = day.factors[b] ?? null;
    if (x === null || y === null) {
      continue;
    }
    if (x === 'yes' && y === 'yes') {
      both += 1;
    } else if (x === 'yes') {
      onlyA += 1;
    } else if (y === 'yes') {
      onlyB += 1;
    } else {
      neither += 1;
    }
  }
  const spread = (both + onlyA) * (onlyB + neither) * (both + onlyB) * (onlyA + neither);
  return spread === 0 ? null : (both * neither - onlyA * onlyB) / Math.sqrt(spread);
}

/** Groups of habits the days cannot tell apart, each habit in at most one group. */
export function inseparableFactorGroups(
  days: readonly JournalAnalysisDay[],
  factorIds: readonly string[],
): string[][] {
  const groupOf = new Map<string, string[]>();
  for (const [index, a] of factorIds.entries()) {
    for (const b of factorIds.slice(index + 1)) {
      const phi = factorCorrelation(days, a, b);
      if (phi === null || Math.abs(phi) < INSEPARABLE_PHI) {
        continue;
      }
      const groupA = groupOf.get(a);
      const groupB = groupOf.get(b);
      if (groupA && groupB) {
        if (groupA === groupB) {
          continue;
        }
        groupA.push(...groupB);
        groupB.forEach((id) => groupOf.set(id, groupA));
      } else if (groupA) {
        groupA.push(b);
        groupOf.set(b, groupA);
      } else if (groupB) {
        groupB.push(a);
        groupOf.set(a, groupB);
      } else {
        const group = [a, b];
        groupOf.set(a, group);
        groupOf.set(b, group);
      }
    }
  }
  return [...new Set(groupOf.values())].map((group) => [...group].sort());
}

type TestedEffect = FactorOutcomeEffect & { qValue: number };

/** Every factor × outcome contrast with enough days on both sides to be tested at all. */
function testableEffects(
  days: readonly JournalAnalysisDay[],
  factorIds: readonly string[],
  options: JournalHabitAnalysisOptions,
): FactorOutcomeEffect[] {
  return OUTCOMES.flatMap((outcome) => {
    const readOutcome = outcomeReader(days, outcome, options.loadByDay);
    return factorIds.flatMap((factorId) => {
      const effect = compareFactorOutcome(days, factorId, outcome, { readOutcome });
      return effect && Math.min(effect.nYes, effect.nNo) >= MIN_N_PER_GROUP_MEDIUM ? [effect] : [];
    });
  });
}

/** Net needs the false-discovery bar across all contrasts; a lead, a plausible p-value alone. */
function statisticalConfidence(effect: TestedEffect): ObservationConfidence {
  if (effect.confidence === 'none') {
    return 'none';
  }
  if (effect.confidence === 'high' && effect.qValue <= NET_FALSE_DISCOVERY_RATE) {
    return 'high';
  }
  return effect.pValue <= LEAD_MAX_P_VALUE ? 'medium' : 'none';
}

function toFinding(effect: FactorOutcomeEffect): JournalHabitFinding | null {
  const gated = applyPlausibilityToEffect(effect);
  if (!gated || gated.confidence === 'none') {
    return null;
  }
  return {
    kind: 'effect',
    factorId: gated.factorId,
    outcome: gated.outcome,
    nYes: gated.nYes,
    nNo: gated.nNo,
    medianYes: gated.medianYes,
    medianNo: gated.medianNo,
    yesValues: gated.yesValues,
    noValues: gated.noValues,
    absDelta: gated.absDelta,
    polarity: gated.polarity,
    confidence: gated.confidence,
    lagDays: gated.lagDays,
  };
}

/** One finding per inseparable group: its first member speaks, naming the others. */
function mergeInseparable(
  findings: readonly JournalHabitFinding[],
  groups: readonly string[][],
): JournalHabitFinding[] {
  const groupOf = new Map(groups.flatMap((group) => group.map((id) => [id, group] as const)));
  const speaking = new Map<string, string>();
  for (const finding of findings) {
    const group = groupOf.get(finding.factorId);
    if (group && !speaking.has(group[0]!)) {
      speaking.set(group[0]!, finding.factorId);
    }
  }
  return findings.flatMap((finding) => {
    const group = groupOf.get(finding.factorId);
    if (!group) {
      return [finding];
    }
    if (speaking.get(group[0]!) !== finding.factorId) {
      return [];
    }
    const companionFactorIds = group.filter((id) => id !== finding.factorId);
    return [{ ...finding, companionFactorIds }];
  });
}

/**
 * Build athlete-facing associations: every factor×outcome contrast after lag and load
 * adjustment, a rank test with a false-discovery correction across all of them, the
 * plausibility gate, inseparable habits merged, redundancy collapse and contradiction drop.
 */
export function buildJournalHabitFindings(
  days: readonly JournalAnalysisDay[],
  options: JournalHabitAnalysisOptions = {},
): JournalHabitFinding[] {
  const factorIds = collectFactorIds(days);
  const effects = testableEffects(days, factorIds, options);
  const qValues = benjaminiHochberg(effects.map((effect) => effect.pValue));

  const findings = effects.flatMap((effect, index) => {
    const tested = { ...effect, qValue: qValues[index]! };
    const finding = toFinding({ ...effect, confidence: statisticalConfidence(tested) });
    return finding ? [finding] : [];
  });

  // Strongest first, so the habit that speaks for a group is the one with the clearest gap.
  const ranked = [...findings].sort(
    (a, b) => relativeEffectForFinding(b) - relativeEffectForFinding(a),
  );
  const merged = mergeInseparable(ranked, inseparableFactorGroups(days, factorIds));
  const collapsed = collapseRedundantRecoveryFindings(merged);
  return dropContradictoryFactorFindings(collapsed).kept;
}

export function partitionHabitFindings(findings: readonly JournalHabitFinding[]): {
  plusHigh: JournalHabitFinding[];
  minusHigh: JournalHabitFinding[];
  plusMedium: JournalHabitFinding[];
  minusMedium: JournalHabitFinding[];
} {
  const plusHigh: JournalHabitFinding[] = [];
  const minusHigh: JournalHabitFinding[] = [];
  const plusMedium: JournalHabitFinding[] = [];
  const minusMedium: JournalHabitFinding[] = [];

  for (const finding of findings) {
    if (finding.confidence === 'high' && finding.polarity === 'plus') {
      plusHigh.push(finding);
    } else if (finding.confidence === 'high' && finding.polarity === 'minus') {
      minusHigh.push(finding);
    } else if (finding.polarity === 'plus') {
      plusMedium.push(finding);
    } else {
      minusMedium.push(finding);
    }
  }

  return { plusHigh, minusHigh, plusMedium, minusMedium };
}

/**
 * Collapse same habit + polarity across outcomes into one row
 * (e.g. sleep + recovery both lower → a single athlete-facing association).
 * Opposite polarities stay separate.
 */
export function compileJournalHabitFindings(
  findings: readonly JournalHabitFinding[],
): CompiledJournalHabitFinding[] {
  const groups = new Map<string, JournalHabitFinding[]>();

  for (const finding of findings) {
    const key = `${finding.factorId}:${finding.polarity}`;
    const list = groups.get(key);
    if (list) {
      list.push(finding);
    } else {
      groups.set(key, [finding]);
    }
  }

  const compiled: CompiledJournalHabitFinding[] = [];
  for (const effects of groups.values()) {
    const sortedEffects = [...effects].sort(
      (a, b) => relativeEffectForFinding(b) - relativeEffectForFinding(a),
    );
    const primary = sortedEffects[0]!;
    compiled.push({
      kind: 'compiled',
      factorId: primary.factorId,
      polarity: primary.polarity,
      confidence: sortedEffects.some((e) => e.confidence === 'high') ? 'high' : 'medium',
      effects: sortedEffects,
      companionFactorIds: primary.companionFactorIds ?? [],
    });
  }

  return compiled.sort((a, b) => {
    const conf = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (conf !== 0) {
      return conf;
    }
    return relativeEffectForFinding(b.effects[0]!) - relativeEffectForFinding(a.effects[0]!);
  });
}

export function partitionCompiledFindings(findings: readonly CompiledJournalHabitFinding[]): {
  plusHigh: CompiledJournalHabitFinding[];
  minusHigh: CompiledJournalHabitFinding[];
  plusMedium: CompiledJournalHabitFinding[];
  minusMedium: CompiledJournalHabitFinding[];
} {
  const plusHigh: CompiledJournalHabitFinding[] = [];
  const minusHigh: CompiledJournalHabitFinding[] = [];
  const plusMedium: CompiledJournalHabitFinding[] = [];
  const minusMedium: CompiledJournalHabitFinding[] = [];

  for (const finding of findings) {
    if (finding.confidence === 'high' && finding.polarity === 'plus') {
      plusHigh.push(finding);
    } else if (finding.confidence === 'high' && finding.polarity === 'minus') {
      minusHigh.push(finding);
    } else if (finding.polarity === 'plus') {
      plusMedium.push(finding);
    } else {
      minusMedium.push(finding);
    }
  }

  return { plusHigh, minusHigh, plusMedium, minusMedium };
}
