import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';

/**
 * A read or write over many rows of an athlete's data must name the athlete. An unscoped
 * `findMany` on conditions once fed one athlete's injuries to every other athlete (ADR-093, ADR-116).
 */
const ATHLETE_OWNED_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'athleteId'))
    .map((model) => model.name),
);

/** Operations that can match more than one row. A single-row update or delete names its row. */
const MANY_ROW_OPERATIONS: ReadonlySet<string> = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

type Where = Record<string, unknown>;

function isWhere(value: unknown): value is Where {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Whether a filter only matches rows of one known athlete, or one known row. `undefined` counts
 * as absent: Prisma drops it, so `{ athleteId: undefined }` matches every athlete.
 */
export function isAthleteScoped(where: unknown): boolean {
  if (!isWhere(where)) {
    return false;
  }
  if (where.athleteId !== undefined || where.athlete !== undefined || where.id !== undefined) {
    return true;
  }
  if (where.AND !== undefined && asList(where.AND).some(isAthleteScoped)) {
    return true;
  }
  return (
    where.OR !== undefined && asList(where.OR).length > 0 && asList(where.OR).every(isAthleteScoped)
  );
}

type QueryShape = { model?: string; operation: string; args: unknown };

/** The reason this query reads or writes across athletes, or null when it stays within one. */
export function findUnscopedAthleteQuery({ model, operation, args }: QueryShape): string | null {
  if (!model || !ATHLETE_OWNED_MODELS.has(model) || !MANY_ROW_OPERATIONS.has(operation)) {
    return null;
  }
  const where = isWhere(args) ? args.where : undefined;
  return isAthleteScoped(where) ? null : `${model}.${operation} without an athleteId filter`;
}

const acrossAthletesScope = new AsyncLocalStorage<string>();

/**
 * Runs work that is meant to span athletes — a provider webhook keyed by the provider's own user
 * id, a cron over every athlete. The reason is named so the exception reads in review.
 */
export function acrossAthletes<T>(reason: string, work: () => PromiseLike<T>): Promise<T> {
  // A Prisma query is lazy and runs when awaited: await it inside the scope, not after it.
  return acrossAthletesScope.run(reason, async () => await work());
}

export type AthleteScopeMode = 'enforce' | 'report' | 'off';

/**
 * Enforced in development and tests, reported in production: a cross-athlete query this guard
 * has not seen yet logs instead of failing an athlete's request.
 */
export function athleteScopeMode(env: NodeJS.ProcessEnv = process.env): AthleteScopeMode {
  const configured = env.SHARPIT_ATHLETE_SCOPE;
  if (configured === 'enforce' || configured === 'report' || configured === 'off') {
    return configured;
  }
  return env.NODE_ENV === 'production' ? 'report' : 'enforce';
}

export function checkAthleteScope(query: QueryShape, mode: AthleteScopeMode): void {
  if (mode === 'off' || acrossAthletesScope.getStore() !== undefined) {
    return;
  }
  const problem = findUnscopedAthleteQuery(query);
  if (!problem) {
    return;
  }
  if (mode === 'enforce') {
    throw new Error(`[athlete-scope] ${problem}`);
  }
  console.error(`[athlete-scope] ${problem}`);
}

/** The Prisma extension that checks every query before it runs. */
export function athleteScopeExtension(mode: AthleteScopeMode = athleteScopeMode()) {
  return Prisma.defineExtension({
    name: 'athlete-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          checkAthleteScope({ model, operation, args }, mode);
          return query(args);
        },
      },
    },
  });
}
