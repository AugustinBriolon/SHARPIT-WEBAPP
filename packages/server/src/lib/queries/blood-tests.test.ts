import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();
const findManyMock = vi.fn();
const deleteManyMock = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    bloodTest: {
      create: (...args: unknown[]) => createMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
      deleteMany: (...args: unknown[]) => deleteManyMock(...args),
    },
  },
}));

const sampledAt = new Date('2026-01-10T08:00:00.000Z');
const results = [
  { markerKey: 'ferritin' as const, value: 61.5, unit: 'µg/L', refLow: 30, refHigh: 400 },
  { markerKey: 'cholesterol_ldl' as const, value: 1.47, unit: 'g/L', refLow: null, refHigh: 1.3 },
];

describe('blood test storage', () => {
  beforeEach(() => {
    vi.stubEnv('SECRET_ENCRYPTION_KEY', 'test-key');
    createMock.mockReset();
    findManyMock.mockReset();
    deleteManyMock.mockReset();
  });

  it('writes no value and no marker name in clear, and reads them back with a status', async () => {
    createMock.mockImplementation(({ data }) => Promise.resolve({ id: 'bt1', ...data }));
    const { createBloodTest, listBloodTests } = await import('./blood-tests');

    const created = await createBloodTest('ath1', { sampledAt, results });

    const written = createMock.mock.calls[0]?.[0].data;
    const stored = JSON.stringify(written);
    for (const leak of ['ferritin', 'cholesterol', '61.5', '1.47', 'µg/L']) {
      expect(stored).not.toContain(leak);
    }
    expect(written.athleteId).toBe('ath1');

    findManyMock.mockResolvedValue([
      { id: 'bt1', sampledAt, sealedResults: written.sealedResults },
    ]);
    const [listed] = await listBloodTests('ath1');
    expect(listed).toEqual(created);
    expect(listed?.results.map((result) => result.status)).toEqual(['in_range', 'high']);
    expect(findManyMock.mock.calls[0]?.[0].where).toEqual({ athleteId: 'ath1' });
  });

  it('deletes only within the athlete’s own tests', async () => {
    deleteManyMock.mockResolvedValue({ count: 0 });
    const { deleteBloodTest } = await import('./blood-tests');

    expect(await deleteBloodTest('ath1', 'someone-elses')).toBe(false);
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { id: 'someone-elses', athleteId: 'ath1' },
    });
  });
});
