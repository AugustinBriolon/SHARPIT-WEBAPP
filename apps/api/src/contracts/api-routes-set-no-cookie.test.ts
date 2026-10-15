import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER_ROOT = join('..', '..', 'packages', 'server', 'src');
const HANDLERS_ROOT = join(SERVER_ROOT, 'handlers');
const SERVER_SPECIFIER = /from '@sharpit\/server\/([^']+)'|import\('@sharpit\/server\/([^']+)'\)/g;
const IMPORTS_NEXT_COOKIES = /import \{[^}]*\bcookies\b[^}]*\} from 'next\/headers'/;
const WRITES = /\.(set|delete)\(/;
const WRITES_A_RESPONSE_COOKIE = /\.cookies\.(set|delete)\(|\.(append|set)\(\s*['"]set-cookie['"]/i;
/**
 * Handlers that set a cookie for the web session only, never for a Bearer request (their own
 * handler test proves it). An entry stays valid only while the file still gates on `hasBearer(`.
 */
const WEB_SESSION_ONLY_COOKIES = new Set([join(HANDLERS_ROOT, 'athlete-profile', 'handler.ts')]);

function writesACookie(source: string): boolean {
  return (
    (IMPORTS_NEXT_COOKIES.test(source) && WRITES.test(source)) ||
    WRITES_A_RESPONSE_COOKIE.test(source)
  );
}

function setsACookieForApiClients(file: string): boolean {
  const source = readFileSync(file, 'utf8');
  if (!writesACookie(source)) {
    return false;
  }
  return !(WEB_SESSION_ONLY_COOKIES.has(file) && source.includes('hasBearer('));
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return routeFiles(path);
    }
    return path.endsWith('route.ts') ? [path] : [];
  });
}

function resolveServerModule(specifier: string): string | null {
  const base = join(SERVER_ROOT, specifier);
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function serverImportsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(SERVER_SPECIFIER)]
    .map((match) => resolveServerModule(match[1] ?? match[2]))
    .filter((path): path is string => path !== null);
}

/** Every `@sharpit/server` module a route reaches: a cookie written by a helper counts too. */
function closureOf(routeFile: string, seen = new Set<string>()): Set<string> {
  for (const file of serverImportsOf(routeFile)) {
    if (!seen.has(file)) {
      seen.add(file);
      closureOf(file, seen);
    }
  }
  return seen;
}

describe('api host contract', () => {
  // Closure walk over every API route → @sharpit/server import graph; CI runners
  // routinely land near the default 15s Vitest ceiling.
  it('no route sets a cookie, directly or through a helper', { timeout: 30_000 }, () => {
    const routes = routeFiles(join('src', 'app', 'api'));
    const reached = new Set(routes.flatMap((route) => [route, ...closureOf(route)]));
    const offenders = [...reached].filter(setsACookieForApiClients);

    expect(routes.length).toBeGreaterThan(150);
    expect(reached.size).toBeGreaterThan(routes.length * 2);
    expect(offenders.map((file) => relative(SERVER_ROOT, file))).toEqual([]);
  });
});
