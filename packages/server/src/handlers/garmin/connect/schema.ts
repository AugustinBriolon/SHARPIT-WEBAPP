import { z } from 'zod';

export const garminConnectSchema = z.object({
  apiKey: z.string().trim().min(8).max(512),
  dataClass: z.string().optional().nullable(),
});
