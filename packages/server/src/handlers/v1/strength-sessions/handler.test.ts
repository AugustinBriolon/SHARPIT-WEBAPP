import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ getCurrentAthleteId: vi.fn() }));
const consent = vi.hoisted(() => ({ athleteHasHealthDataConsent: vi.fn() }));
const rate = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimitJsonResponse: vi.fn(),
  rateLimiters: { strengthLiveHr: {} },
}));
const importSession = vi.hoisted(() => ({ importLiveStrengthSession: vi.fn() }));
const orch = vi.hoisted(() => ({ onProviderSyncCompleted: vi.fn() }));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => auth);
vi.mock('@sharpit/server/lib/privacy/consent-store', () => consent);
vi.mock('@sharpit/server/lib/rate-limit', () => rate);
vi.mock('@sharpit/server/lib/integrations/ios-strength/live-strength-session', () => importSession);
vi.mock('@sharpit/server/lib/athlete-state/orchestrator', () => orch);

const { POST } = await import('./handler');

function request(body: unknown) {
  return new NextRequest('http://localhost/api/v1/strength-sessions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/v1/strength-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentAthleteId.mockResolvedValue('athlete-1');
    consent.athleteHasHealthDataConsent.mockResolvedValue(true);
    rate.checkRateLimit.mockResolvedValue({ ok: true });
    orch.onProviderSyncCompleted.mockResolvedValue({});
  });

  it('returns codes only on validation failure', async () => {
    importSession.importLiveStrengthSession.mockResolvedValue({
      ok: false,
      code: 'INVALID_BPM',
    });
    const res = await POST(request({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'INVALID_BPM' });
  });

  it('returns the happy-path shape without HR values', async () => {
    importSession.importLiveStrengthSession.mockResolvedValue({
      ok: true,
      activityId: 'act-1',
      outcome: 'created',
      hasHr: true,
      sampleCount: 12,
      liveHrSource: 'ble',
    });
    const res = await POST(request({ clientSessionId: 'x' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      apiVersion: 1,
      activityId: 'act-1',
      outcome: 'created',
      hasHr: true,
      liveHrSource: 'ble',
    });
    expect(orch.onProviderSyncCompleted).toHaveBeenCalled();
  });
});
