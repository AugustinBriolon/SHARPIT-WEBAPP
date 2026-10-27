/**
 * The data cards of the day-score insight tools, built from the numbers their markdown states
 * (ADR-119): same rounding, so the card and the prose can never differ by a figure.
 */
import type { CoachDataCard } from '@sharpit/app/lib/coach/chat/cards/coach-data-cards';
import type { V1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';
import { isSet } from '@sharpit/shared/value';

export function roundedScore(value: number | null | undefined): number | null {
  return isSet(value) ? Math.round(value) : null;
}

export function roundedBand(band: NonNullable<V1DayScores['targetBand']>) {
  return { low: Math.round(band.low), high: Math.round(band.high), status: band.status };
}

export function dayScoresCard(
  trainingDayId: string,
  scores: V1DayScores,
  readiness: number | null,
): CoachDataCard {
  return {
    kind: 'dayScores',
    trainingDayId,
    energyBank: isSet(scores.energyBank?.value)
      ? {
          value: Math.round(scores.energyBank.value),
          typicalBaseline: roundedScore(scores.energyBank.typicalBaseline),
        }
      : null,
    stress: roundedScore(scores.stress?.value),
    targetBand: scores.targetBand ? roundedBand(scores.targetBand) : null,
    readiness: roundedScore(readiness),
  };
}
