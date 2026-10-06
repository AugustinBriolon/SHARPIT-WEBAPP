import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The web stays lean: every source file is reachable from a Next.js entry point (a page,
 * layout, route, metadata file, the proxy or the instrumentation hooks). A file only its own test
 * imports is dead code — delete both.
 */
const SRC = 'src';
const ENTRY =
  /^src\/(?:app\/(?:.*\/)?(?:page|layout|route|loading|error|not-found|template|default|global-error|icon|apple-icon|manifest|root-layout-head)\.tsx?|proxy\.ts|instrumentation(?:-client)?\.ts)$/;
const TEST = /\.test\.tsx?$|__tests__/;
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') ? [path] : [];
  });
}

function resolveLocal(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = join(dirname(from), specifier);
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
}

describe('web source files', () => {
  it('are all reachable from a Next.js entry point', () => {
    const files = sourceFiles(SRC).filter((file) => !TEST.test(file));
    const reachable = new Set<string>();
    const visit = (file: string) => {
      if (reachable.has(file)) {
        return;
      }
      reachable.add(file);
      for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        const target = resolveLocal(match[1] ?? match[2] ?? match[3], file);
        if (target) {
          visit(target);
        }
      }
    };
    files.filter((file) => ENTRY.test(file)).forEach(visit);

    expect(files.filter((file) => !reachable.has(file))).toEqual([]);
  });
});
