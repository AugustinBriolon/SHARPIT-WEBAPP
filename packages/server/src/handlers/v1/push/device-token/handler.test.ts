import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from './handler';
import { prisma } from '@sharpit/db/client';
import * as authModule from '@sharpit/server/lib/auth/current-athlete';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    deviceToken: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn(),
}));

vi.mock('@sharpit/server/lib/rate-limit', () => ({
  rateLimiters: { apiGeneral: {} },
  checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitJsonResponse: vi.fn(),
}));

describe('/api/v1/push/device-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST', () => {
    it('rejects an invalid token with 400', async () => {
      const req = new NextRequest('https://sharpit.app/api/v1/push/device-token', {
        method: 'POST',
        body: JSON.stringify({ token: 'short' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Token APNs invalide');
    });

    it('cleans brackets and spaces from device token and upserts cleanly', async () => {
      vi.mocked(authModule.getCurrentAthleteId).mockResolvedValueOnce('ath-1');
      vi.mocked(prisma.deviceToken.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.deviceToken.upsert).mockResolvedValueOnce({
        id: 'tok-1',
        athleteId: 'ath-1',
        token: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        platform: 'ios',
        bundleId: 'app.sharpit.ios',
        environment: 'production',
        enabled: true,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const rawToken = '<12345678 90abcdef 12345678 90abcdef 12345678 90abcdef 12345678 90abcdef>';
      const req = new NextRequest('https://sharpit.app/api/v1/push/device-token', {
        method: 'POST',
        body: JSON.stringify({ token: rawToken }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.apiVersion).toBe(1);

      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' },
        create: {
          athleteId: 'ath-1',
          token: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          platform: 'ios',
          bundleId: 'app.sharpit.ios',
          environment: 'production',
          enabled: true,
        },
        update: {
          platform: 'ios',
          bundleId: 'app.sharpit.ios',
          environment: 'production',
          enabled: true,
        },
      });
    });

    it('files a token from a build run in Xcode under the APNs sandbox', async () => {
      vi.mocked(authModule.getCurrentAthleteId).mockResolvedValueOnce('ath-1');
      vi.mocked(prisma.deviceToken.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.deviceToken.upsert).mockResolvedValueOnce({
        id: 'tok-2',
        enabled: true,
      } as never);

      const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const req = new NextRequest('https://sharpit.app/api/v1/push/device-token', {
        method: 'POST',
        body: JSON.stringify({ token, debug: true }),
      });

      expect((await POST(req)).status).toBe(200);
      expect(vi.mocked(prisma.deviceToken.upsert).mock.calls[0]?.[0]).toMatchObject({
        create: { environment: 'sandbox' },
        update: { environment: 'sandbox', enabled: true },
      });
    });

    it('refuses reassigning another athlete’s APNs token', async () => {
      vi.mocked(authModule.getCurrentAthleteId).mockResolvedValueOnce('ath-1');
      vi.mocked(prisma.deviceToken.findUnique).mockResolvedValueOnce({
        athleteId: 'ath-2',
      } as never);

      const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const req = new NextRequest('https://sharpit.app/api/v1/push/device-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      expect(prisma.deviceToken.upsert).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('removes device token for the current athlete', async () => {
      vi.mocked(authModule.getCurrentAthleteId).mockResolvedValueOnce('ath-1');
      vi.mocked(prisma.deviceToken.deleteMany).mockResolvedValueOnce({ count: 1 });

      const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const req = new NextRequest('https://sharpit.app/api/v1/push/device-token', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.apiVersion).toBe(1);

      expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
        where: {
          token,
          athleteId: 'ath-1',
        },
      });
    });
  });
});
