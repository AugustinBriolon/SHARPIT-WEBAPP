import { DAY_CONTEXT_FACTORS } from '@sharpit/app/lib/journal/day-context-factors';
import type {
  CompiledJournalHabitFinding,
  JournalHabitFinding,
  JournalOutcomeKey,
} from '@sharpit/app/lib/journal/journal-habit-analysis';
import { journalTrackableById } from '@sharpit/app/lib/journal/journal-trackables';

const OUTCOME_LABELS: Record<JournalOutcomeKey, string> = {
  sleepMinutes: 'sommeil',
  recoveryScore: 'récupération',
  bodyBattery: 'Body Battery',
};

export function journalFactorDisplayLabel(factorId: string): string {
  const trackable = journalTrackableById(factorId);
  if (trackable) {
    return trackable.label;
  }
  const factor = DAY_CONTEXT_FACTORS.find((item) => item.id === factorId);
  if (factor) {
    return factor.label;
  }
  if (factorId.startsWith('custom_')) {
    return 'Élément perso';
  }
  return factorId;
}

/** « Oméga-3 » alone, « Oméga-3, Collagène et Vitamine D » for habits the days cannot separate. */
export function habitGroupLabel(
  factorId: string,
  companionFactorIds: readonly string[] = [],
): string {
  return joinFrench([factorId, ...companionFactorIds].map(journalFactorDisplayLabel));
}

export function formatOutcomeValue(outcome: JournalOutcomeKey, value: number): string {
  if (outcome === 'sleepMinutes') {
    // Round the total first: 479.6 min reads 8 h 00, never 7 h 60.
    const total = Math.round(value);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${hours} h ${minutes.toString().padStart(2, '0')}`;
  }
  return `${Math.round(value)}`;
}

export function confidenceLabel(confidence: 'high' | 'medium'): string {
  return confidence === 'high' ? 'Association nette' : 'À confirmer';
}

/** « a », « a et b », « a, b et c ». */
export function joinFrench(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

function joinOutcomeLabels(outcomes: readonly JournalOutcomeKey[]): string {
  return joinFrench(outcomes.map((outcome) => OUTCOME_LABELS[outcome]));
}

function directionWord(polarity: 'plus' | 'minus'): string {
  return polarity === 'minus' ? 'plus bas' : 'plus haut';
}

export function formatJournalHabitFinding(finding: JournalHabitFinding): {
  title: string;
  detail: string;
  confidenceLabel: string;
} {
  const habit = journalFactorDisplayLabel(finding.factorId);
  const outcome = OUTCOME_LABELS[finding.outcome];
  const withHabit = formatOutcomeValue(finding.outcome, finding.medianYes);
  const withoutHabit = formatOutcomeValue(finding.outcome, finding.medianNo);
  const lagNote =
    finding.lagDays > 0 ? ` Mesure ${outcome} le lendemain (+${finding.lagDays} j).` : '';

  return {
    title: `${habit} · ${outcome} ${directionWord(finding.polarity)}`,
    detail: `Médiane avec ${habit.toLowerCase()} : ${withHabit}, sans : ${withoutHabit} · ${finding.nYes} vs ${finding.nNo} jours.${lagNote}`,
    confidenceLabel: confidenceLabel(finding.confidence),
  };
}

export function formatCompiledJournalHabitFinding(finding: CompiledJournalHabitFinding): {
  title: string;
  detail: string;
  confidenceLabel: string;
} {
  const habit = habitGroupLabel(finding.factorId, finding.companionFactorIds);
  const outcomeOrder: JournalOutcomeKey[] = ['sleepMinutes', 'recoveryScore', 'bodyBattery'];
  const effects = [...finding.effects].sort(
    (a, b) => outcomeOrder.indexOf(a.outcome) - outcomeOrder.indexOf(b.outcome),
  );
  const outcomes = effects.map((effect) => effect.outcome);
  const outcomePhrase = joinOutcomeLabels(outcomes);
  const direction = directionWord(finding.polarity);

  const medianBits = effects.map((effect) => {
    const label = OUTCOME_LABELS[effect.outcome];
    const withHabit = formatOutcomeValue(effect.outcome, effect.medianYes);
    const withoutHabit = formatOutcomeValue(effect.outcome, effect.medianNo);
    const lag = effect.lagDays > 0 ? ` (mesure ${label} +${effect.lagDays} j)` : '';
    return `${label} ${withHabit} vs ${withoutHabit}${lag} · ${effect.nYes}/${effect.nNo} j`;
  });

  return {
    title: `${habit} · ${outcomePhrase} ${direction}`,
    detail: `Médiane avec vs sans : ${medianBits.join(' · ')}.`,
    confidenceLabel: confidenceLabel(finding.confidence),
  };
}

const MINUS_SIGN = '\u2212';

/** Signed gap « avec − sans » in the outcome's unit: `−52′`, `+1 h 05`, `+14`. */
export function formatSignedDelta(outcome: JournalOutcomeKey, delta: number): string {
  const sign = delta < 0 ? MINUS_SIGN : '+';
  const magnitude = Math.round(Math.abs(delta));
  if (outcome !== 'sleepMinutes') {
    return `${sign}${magnitude}`;
  }
  return magnitude >= 60
    ? `${sign}${formatOutcomeValue('sleepMinutes', magnitude)}`
    : `${sign}${magnitude}′`;
}

/** The single on-page form of the measurement shift. */
export function formatLagLabel(lagDays: number): string | null {
  return lagDays > 0 ? `mesure +${lagDays} j` : null;
}

export function formatMediansLine(finding: JournalHabitFinding): string {
  const without = formatOutcomeValue(finding.outcome, finding.medianNo);
  const withHabit = formatOutcomeValue(finding.outcome, finding.medianYes);
  return `sans ${without} → avec ${withHabit}`;
}

/** Text equivalent of a dumbbell, read by assistive tech. */
export function formatDumbbellAriaLabel(finding: JournalHabitFinding): string {
  const habit = habitGroupLabel(finding.factorId, finding.companionFactorIds);
  const withHabit = formatOutcomeValue(finding.outcome, finding.medianYes);
  const without = formatOutcomeValue(finding.outcome, finding.medianNo);
  const lag = finding.lagDays > 0 ? ', mesuré le lendemain' : '';
  return `${habit}, ${OUTCOME_LABELS[finding.outcome]}${lag} : ${withHabit} avec contre ${without} sans, ${finding.nYes} jours contre ${finding.nNo}`;
}

/** Verb for days with the habit that land on the « sans » side of the gap. */
const CROSSING_VERB: Record<'plus' | 'minus', { singular: string; plural: string }> = {
  minus: { singular: 'atteint', plural: 'atteignent' },
  plus: { singular: 'reste sous', plural: 'restent sous' },
};

/** Days with the habit that did not move the way the median says. */
function countCrossingDays(finding: JournalHabitFinding): number {
  return finding.yesValues.filter((value) =>
    finding.polarity === 'minus' ? value >= finding.medianNo : value <= finding.medianNo,
  ).length;
}

/**
 * What the expanded distribution shows, written from the data: a gap can be
 * net on the median while some days with the habit still land on the other side.
 */
export function describeDistributionOverlap(finding: JournalHabitFinding): string {
  const gap = finding.confidence === 'high' ? 'l’écart est net' : 'l’écart reste à confirmer';
  const crossing = countCrossingDays(finding);
  const total = finding.yesValues.length;
  if (crossing === 0) {
    const side = finding.polarity === 'minus' ? 'sous' : 'au-dessus de';
    return `Les ${total} jours avec l’habitude sont tous ${side} la médiane sans : ${gap} et régulier.`;
  }
  const plural = crossing > 1;
  const verb = CROSSING_VERB[finding.polarity][plural ? 'plural' : 'singular'];
  return `${crossing} ${plural ? 'jours' : 'jour'} sur ${total} avec l’habitude ${verb} la médiane sans : ${gap}, mais la règle n’est pas absolue.`;
}
