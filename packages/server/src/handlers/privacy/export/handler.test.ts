import { describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: () => Promise.resolve('athlete-1'),
}));
vi.mock('@sharpit/app/lib/next/await-request', () => ({ awaitRequest: () => Promise.resolve() }));
vi.mock('@sharpit/server/lib/privacy/export', () => ({
  buildAthleteExportJson: () => Promise.resolve({ profile: { id: 'athlete-1' }, observations: [] }),
}));

describe('GET /privacy/export', () => {
  it('streams the export as a JSON attachment', async () => {
    const { GET } = await import('./handler');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    expect(response.headers.get('Content-Disposition')).toContain('sharpit-export-athlete-1.json');
    expect(await response.json()).toEqual({ profile: { id: 'athlete-1' }, observations: [] });
  });
});
