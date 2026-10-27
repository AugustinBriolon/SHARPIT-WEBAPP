/**
 * The coach's data cards: the values a read tool measured, handed to the app to draw beside the
 * prose. The model never writes them. A read tool returns its card with its markdown, built from
 * the same numbers, so a figure on the card is the figure the tool read (ADR-119).
 *
 * The Swift models decode the same shapes, pinned by the fixtures in `data-fixtures`.
 */
import { z } from 'zod';

export const COACH_DATA_CARD_SCHEMA_VERSION = 1;

const trainingDayId = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const score = z.number().min(0).max(100);

export const coachTargetBandSchema = z.object({
  low: z.number(),
  high: z.number(),
  status: z.enum(['below', 'within', 'above']).nullable(),
});

const sleepVsReadinessCard = z.object({
  kind: z.literal('sleepVsReadiness'),
  windowDays: z.union([z.literal(7), z.literal(14)]),
  points: z.array(
    z.object({
      trainingDayId,
      sleepMinutes: z.number().min(0).nullable(),
      readiness: score.nullable(),
    }),
  ),
});

const dayScoresCard = z.object({
  kind: z.literal('dayScores'),
  trainingDayId,
  energyBank: z.object({ value: score, typicalBaseline: score.nullable() }).nullable(),
  stress: score.nullable(),
  targetBand: coachTargetBandSchema.nullable(),
  readiness: score.nullable(),
});

const targetBandCard = z.object({
  kind: z.literal('targetBand'),
  trainingDayId,
  band: coachTargetBandSchema,
  readiness: score.nullable(),
});

export const coachDataCardSchema = z.discriminatedUnion('kind', [
  sleepVsReadinessCard,
  dayScoresCard,
  targetBandCard,
]);
export type CoachDataCard = z.infer<typeof coachDataCardSchema>;

export type CoachDataCardOutput = {
  ok: true;
  markdown: string;
  /** Present with `card`: the contract version the card was built for. */
  schemaVersion?: typeof COACH_DATA_CARD_SCHEMA_VERSION;
  card?: CoachDataCard;
};

/**
 * A card that breaks the contract (a score out of range, say) is left out and the markdown still
 * answers: no card is better than one the app cannot draw or that shows a wrong figure.
 */
export function coachDataCardOutput(markdown: string, card: unknown): CoachDataCardOutput {
  const parsed = coachDataCardSchema.safeParse(card);
  return parsed.success
    ? { ok: true, markdown, schemaVersion: COACH_DATA_CARD_SCHEMA_VERSION, card: parsed.data }
    : { ok: true, markdown };
}
