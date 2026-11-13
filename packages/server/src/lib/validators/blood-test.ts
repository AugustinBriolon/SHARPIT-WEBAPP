import { z } from 'zod';
import { BLOOD_MARKER_KEYS, bloodMarker } from '@sharpit/app/lib/blood-markers/catalog';

const bound = z.number().finite().nullable().default(null);

const resultSchema = z
  .object({
    markerKey: z.enum(BLOOD_MARKER_KEYS),
    value: z.number().finite(),
    unit: z.string().min(1),
    refLow: bound,
    refHigh: bound,
  })
  .strict()
  .superRefine((result, ctx) => {
    const marker = bloodMarker(result.markerKey);
    if (!marker) {
      return;
    }
    if (result.unit !== marker.unit) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: `Unité attendue : ${marker.unit}` });
    }
    const [min, max] = marker.plausible;
    if (result.value < min || result.value > max) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Valeur hors du plausible' });
    }
    if (result.refLow !== null && result.refHigh !== null && result.refLow > result.refHigh) {
      ctx.addIssue({ code: 'custom', path: ['refLow'], message: 'Bornes inversées' });
    }
  });

/**
 * A blood test as the athlete confirmed it: the sampling time and the results, nothing else.
 * `.strict()` refuses any other field, so a name or a file can never ride along (ADR-128).
 */
export const postBloodTestSchema = z
  .object({
    sampledAt: z.coerce.date().refine((date) => date.getTime() <= Date.now(), {
      message: 'Prélèvement dans le futur',
    }),
    results: z.array(resultSchema).min(1).max(BLOOD_MARKER_KEYS.length),
  })
  .strict()
  .refine(
    (body) => new Set(body.results.map((result) => result.markerKey)).size === body.results.length,
    { message: 'Un marqueur présent deux fois', path: ['results'] },
  );

export type PostBloodTestInput = z.infer<typeof postBloodTestSchema>;
