import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { onProviderSyncCompleted } from '@sharpit/server/lib/athlete-state/orchestrator';
import { importLiveStrengthSession } from '@sharpit/server/lib/integrations/ios-strength/live-strength-session';
import { athleteHasHealthDataConsent } from '@sharpit/server/lib/privacy/consent-store';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';

/**
 * Additive end-of-session endpoint for strength workouts recorded by the iOS app
 * with live heart rate (watch or BLE). Contract: docs/ios/STRENGTH_LIVE_HR_CONTRACT.md.
 *
 * Rejects with `{ code }` only — never echoes HR values. Logs never include bpm.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  try {
    const athleteId = await getCurrentAthleteId();
    if (!(await athleteHasHealthDataConsent(athleteId))) {
      return NextResponse.json({ code: 'CONSENT_REQUIRED' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(rateLimiters.strengthLiveHr, `${athleteId}:strength`);
    if (!rateLimit.ok) {
      const limited = rateLimitJsonResponse(rateLimit);
      return NextResponse.json(
        { code: rateLimit.cause === 'limited' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE' },
        { status: limited.status },
      );
    }

    const result = await importLiveStrengthSession(athleteId, body);
    if (!result.ok) {
      // Codes only — no sample values, no zod flatten.
      console.warn('[api/v1/strength-sessions]', { code: result.code, ok: false });
      return NextResponse.json({ code: result.code }, { status: 400 });
    }

    if (result.outcome === 'created' || result.outcome === 'merged') {
      await onProviderSyncCompleted(athleteId, [
        {
          provider: 'manual',
          imported: result.outcome === 'created' ? 1 : 0,
          updated: result.outcome === 'merged' ? 1 : 0,
          observationCount: 0,
          activityIds: [result.activityId],
        },
      ]).catch((error) => {
        console.error('[api/v1/strength-sessions] refresh', {
          ok: false,
          hasError: Boolean(error),
        });
      });
    }

    console.info('[api/v1/strength-sessions]', {
      ok: true,
      outcome: result.outcome,
      hasHr: result.hasHr,
      sampleCount: result.sampleCount,
      liveHrIsBle: result.liveHrSource === 'ble',
    });

    return NextResponse.json({
      apiVersion: 1,
      activityId: result.activityId,
      outcome: result.outcome,
      hasHr: result.hasHr,
      liveHrSource: result.liveHrSource,
    });
  } catch (error) {
    console.error('[api/v1/strength-sessions]', { ok: false, hasError: Boolean(error) });
    return NextResponse.json({ code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
