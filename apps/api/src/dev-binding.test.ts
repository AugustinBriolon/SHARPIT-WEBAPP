import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.join(__dirname, '../../..');
const read = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

/**
 * With `DEV_BYPASS_CLERK`, a dev server answers every request as the local athlete, and dev skips
 * rate limits and the AI budget. Reachable from the LAN, that is an open API spending real AI
 * credits. Listening on the LAN (phone testing) is an explicit `dev:lan`, never the default.
 */
describe('local dev servers stay on loopback', () => {
  it.each(['apps/api/package.json', 'apps/web/package.json', 'apps/hub/package.json'])(
    '%s dev script binds 127.0.0.1',
    (file) => {
      const { scripts } = JSON.parse(read(file)) as { scripts: Record<string, string> };
      expect(scripts.dev).toMatch(/-H 127\.0\.0\.1\b/);
    },
  );

  it('publishes local Postgres on loopback only', () => {
    expect(read('docker-compose.yml')).toMatch(/- '127\.0\.0\.1:5432:5432'/);
  });
});
