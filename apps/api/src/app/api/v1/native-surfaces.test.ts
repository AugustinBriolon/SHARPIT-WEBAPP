import { beforeAll, describe, expect, it, vi } from 'vitest';

// Route modules import `server-only`; loading them here only inspects their exports.
vi.mock('server-only', () => ({}));
import {
  NATIVE_V1_DEFERRED,
  NATIVE_V1_ONLY,
  NATIVE_V1_SURFACES,
} from '@sharpit/server/lib/api-v1/native-surfaces';

type RouteModule = Record<string, unknown>;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

type RouteLoaders = Record<string, () => Promise<RouteModule>>;

// Lazy: only the modules a test asks for are loaded.
const v1Routes = import.meta.glob('./**/route.ts') as RouteLoaders;
// The /api twins the web calls, mounted here too (ADR-048 phase 3): the native contract must run
// their very handler.
const legacyRoutes = import.meta.glob('../**/route.ts') as RouteLoaders;
const LEGACY = '..';

async function load(routes: RouteLoaders, key: string): Promise<RouteModule> {
  const loader = routes[key];
  if (!loader) {
    throw new Error(`missing route module ${key}`);
  }
  return loader();
}

describe('/api/v1 native surfaces', () => {
  // The first route loaded pays the cold transform of the import graph every handler shares
  // (~20 s alone, past 30 s with the monorepo's suites in parallel). Paid here, it is a setup
  // cost rather than one route's test timing out.
  beforeAll(async () => {
    const [first] = NATIVE_V1_SURFACES;
    await load(v1Routes, `./${first.path}/route.ts`);
    await load(legacyRoutes, `${LEGACY}/${first.path}/route.ts`);
  }, 180_000);

  it.each(NATIVE_V1_SURFACES)(
    '/api/v1/$path serves the /api handler',
    async (surface) => {
      const v1 = await load(v1Routes, `./${surface.path}/route.ts`);
      const legacy = await load(legacyRoutes, `${LEGACY}/${surface.path}/route.ts`);

      const exported = HTTP_METHODS.filter((method) => method in v1);
      expect(exported).toEqual([...surface.methods].sort(byHttpOrder));
      for (const method of surface.methods) {
        expect(v1[method]).toBe(legacy[method]);
      }
      expect(v1.maxDuration).toBe(legacy.maxDuration);
      // Loading a handler's whole import graph is slow on a busy machine.
    },
    30_000,
  );

  it.each(NATIVE_V1_ONLY)('/api/v1/$path is a native-only route', async (surface) => {
    const v1 = await load(v1Routes, `./${surface.path}/route.ts`);
    const exported = HTTP_METHODS.filter((method) => method in v1);
    expect(exported).toEqual([...surface.methods].sort(byHttpOrder));
    expect(legacyRoutes[`${LEGACY}/${surface.path}/route.ts`]).toBeUndefined();
  });

  it('inventories every /api/v1 route', () => {
    const listed = new Set<string>([
      ...NATIVE_V1_SURFACES.map((s) => s.path),
      ...NATIVE_V1_ONLY.map((s) => s.path),
    ]);
    const onDisk = Object.keys(v1Routes)
      .map((key) => key.replace(/^\.\//, '').replace(/\/route\.ts$/, ''))
      .filter((path) => path !== 'route.ts');
    expect(onDisk.filter((path) => !listed.has(path))).toEqual([]);
  });

  it.each(NATIVE_V1_DEFERRED)('/api/v1/%s stays off the native contract', (path) => {
    expect(v1Routes[`./${path}/route.ts`]).toBeUndefined();
  });
});

function byHttpOrder(a: string, b: string): number {
  return HTTP_METHODS.indexOf(a) - HTTP_METHODS.indexOf(b);
}
