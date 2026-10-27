import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acrossAthletes,
  athleteScopeMode,
  checkAthleteScope,
  findUnscopedAthleteQuery,
  isAthleteScoped,
} from './athlete-scope';

// An unscoped `condition.findMany` once fed one athlete's injuries to every other athlete
// (ADR-093, ADR-116).
describe('findUnscopedAthleteQuery', () => {
  it('flags a many-row read on athlete data with no athlete', () => {
    expect(findUnscopedAthleteQuery({ model: 'Condition', operation: 'findMany', args: {} })).toBe(
      'Condition.findMany without an athleteId filter',
    );
  });

  it('flags a read with no arguments at all', () => {
    expect(
      findUnscopedAthleteQuery({ model: 'GoogleAccount', operation: 'findFirst', args: undefined }),
    ).not.toBeNull();
  });

  it('flags an athlete id left undefined, which Prisma drops', () => {
    const args = { where: { athleteId: undefined, status: 'ACTIVE' } };
    expect(
      findUnscopedAthleteQuery({ model: 'Condition', operation: 'findMany', args }),
    ).not.toBeNull();
  });

  it('lets a read scoped to one athlete through', () => {
    const args = { where: { athleteId: 'athlete-b' } };
    expect(
      findUnscopedAthleteQuery({ model: 'Condition', operation: 'findMany', args }),
    ).toBeNull();
  });

  it('lets a many-row write that names its row through', () => {
    const args = { where: { id: 'condition-1' }, data: {} };
    expect(
      findUnscopedAthleteQuery({ model: 'Condition', operation: 'updateMany', args }),
    ).toBeNull();
  });

  it('leaves single-row operations and models without an athlete alone', () => {
    expect(
      findUnscopedAthleteQuery({ model: 'Condition', operation: 'update', args: {} }),
    ).toBeNull();
    expect(
      findUnscopedAthleteQuery({ model: 'AthleteProfile', operation: 'findMany', args: {} }),
    ).toBeNull();
  });
});

describe('isAthleteScoped', () => {
  it('reads the athlete through the relation and through AND', () => {
    expect(isAthleteScoped({ athlete: { clerkUserId: 'user_1' } })).toBe(true);
    expect(isAthleteScoped({ AND: [{ status: 'ACTIVE' }, { athleteId: 'athlete-b' }] })).toBe(true);
  });

  it('needs every OR branch scoped', () => {
    expect(isAthleteScoped({ OR: [{ athleteId: 'a' }, { athleteId: 'b' }] })).toBe(true);
    expect(isAthleteScoped({ OR: [{ athleteId: 'a' }, { status: 'ACTIVE' }] })).toBe(false);
    expect(isAthleteScoped({ OR: [] })).toBe(false);
  });
});

describe('checkAthleteScope', () => {
  const unscoped = { model: 'Condition', operation: 'findMany', args: {} };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when enforced', () => {
    expect(() => checkAthleteScope(unscoped, 'enforce')).toThrow('[athlete-scope]');
  });

  it('logs instead of throwing when reported', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkAthleteScope(unscoped, 'report');
    expect(error).toHaveBeenCalledWith(
      '[athlete-scope] Condition.findMany without an athleteId filter',
    );
  });

  it('lets work declared as spanning athletes through, once awaited inside the scope', async () => {
    // A lazy thenable stands in for a Prisma query: it checks the scope only when awaited.
    const lazyQuery: PromiseLike<string> = {
      then: (onFulfilled, onRejected) =>
        new Promise<string>((resolve) => {
          checkAthleteScope(unscoped, 'enforce');
          resolve('ran');
        }).then(onFulfilled, onRejected),
    };

    await expect(acrossAthletes('provider webhook', () => lazyQuery)).resolves.toBe('ran');
  });
});

describe('athleteScopeMode', () => {
  it('enforces outside production and reports in production', () => {
    expect(athleteScopeMode({ NODE_ENV: 'test' })).toBe('enforce');
    expect(athleteScopeMode({ NODE_ENV: 'development' })).toBe('enforce');
    expect(athleteScopeMode({ NODE_ENV: 'production' })).toBe('report');
  });

  it('follows an explicit setting', () => {
    expect(athleteScopeMode({ NODE_ENV: 'production', SHARPIT_ATHLETE_SCOPE: 'enforce' })).toBe(
      'enforce',
    );
  });
});
