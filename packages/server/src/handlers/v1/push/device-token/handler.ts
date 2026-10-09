import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { prisma } from '@sharpit/db/client';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';

const cleanHexToken = (val: unknown) =>
  typeof val === 'string' ? val.replace(/[\s<>]/g, '').toLowerCase() : val;

const registerSchema = z.object({
  token: z.preprocess(
    cleanHexToken,
    z
      .string()
      .min(32)
      .max(128)
      .regex(/^[a-f0-9]+$/),
  ),
  platform: z.string().trim().max(32).default('ios'),
  bundleId: z.string().trim().max(128).default('app.sharpit.ios'),
  /** A build run from Xcode: its token belongs to the APNs sandbox. */
  debug: z.boolean().optional(),
});

const unregisterSchema = z.object({
  token: z.preprocess(
    cleanHexToken,
    z
      .string()
      .min(32)
      .max(128)
      .regex(/^[a-f0-9]+$/),
  ),
});

/**
 * Registers or reactivates an APNs device token for the signed-in athlete.
 */
export async function POST(request: NextRequest) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token APNs invalide' }, { status: 400 });
  }

  try {
    const athleteId = await getCurrentAthleteId();
    const rateLimit = await checkRateLimit(rateLimiters.apiGeneral, `push-token:${athleteId}`);
    if (!rateLimit.ok) {
      const limited = rateLimitJsonResponse(rateLimit);
      return NextResponse.json(limited.body, { status: limited.status });
    }

    const { token, platform, bundleId, debug } = parsed.data;
    const environment = debug ? 'sandbox' : 'production';

    // Refuse hijacking another athlete's APNs token via upsert reassignment.
    const existing = await prisma.deviceToken.findUnique({
      where: { token },
      select: { athleteId: true },
    });
    if (existing && existing.athleteId !== athleteId) {
      return NextResponse.json(
        { error: 'Ce jeton APNs appartient déjà à un autre compte' },
        { status: 409 },
      );
    }

    const device = await prisma.deviceToken.upsert({
      where: { token },
      create: {
        athleteId,
        token,
        platform,
        bundleId,
        environment,
        enabled: true,
      },
      update: {
        platform,
        bundleId,
        environment,
        enabled: true,
      },
    });

    return NextResponse.json({
      apiVersion: 1,
      ok: true,
      id: device.id,
      enabled: device.enabled,
    });
  } catch (error) {
    console.error('[api/v1/push/device-token] POST', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer le token' }, { status: 500 });
  }
}

/**
 * Deactivates or removes a device token.
 */
export async function DELETE(request: NextRequest) {
  const parsed = unregisterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token APNs invalide' }, { status: 400 });
  }

  try {
    const athleteId = await getCurrentAthleteId();
    const { token } = parsed.data;

    await prisma.deviceToken.deleteMany({
      where: {
        token,
        athleteId,
      },
    });

    return NextResponse.json({
      apiVersion: 1,
      ok: true,
    });
  } catch (error) {
    console.error('[api/v1/push/device-token] DELETE', error);
    return NextResponse.json({ error: 'Impossible de désinscrire le token' }, { status: 500 });
  }
}
