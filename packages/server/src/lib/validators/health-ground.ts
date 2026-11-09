import { z } from 'zod';
import { HEALTH_GROUND_KEYS, healthGroundStage } from '@sharpit/app/lib/health-grounds/catalog';

/** Athlete-written context on a ground; it reaches the coach prompt, so it stays short. */
export const HEALTH_GROUND_DETAILS_MAX = 200;

const groundSchema = z
  .object({
    key: z.enum(HEALTH_GROUND_KEYS),
    stage: z.string().min(1),
    details: z
      .string()
      .max(HEALTH_GROUND_DETAILS_MAX)
      .optional()
      .nullable()
      .transform((value) => (value?.trim() ? value.trim() : null)),
  })
  .refine((ground) => healthGroundStage(ground.key, ground.stage) !== undefined, {
    message: 'Stade inconnu pour ce terrain',
    path: ['stage'],
  });

/** The whole declared set: the athlete's grounds are replaced as one answer. */
export const putHealthGroundsSchema = z
  .object({ grounds: z.array(groundSchema).max(HEALTH_GROUND_KEYS.length) })
  .refine(
    (body) => new Set(body.grounds.map((ground) => ground.key)).size === body.grounds.length,
    { message: 'Un terrain déclaré deux fois', path: ['grounds'] },
  );

export type PutHealthGroundsInput = z.infer<typeof putHealthGroundsSchema>;
