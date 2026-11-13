import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ADR-128: blood values are opened in `queries/blood-tests` only. Anything that imports it can
 * put a value in a prompt, a coach trace or a log, so each importer is listed here on purpose.
 */
const ALLOWED_IMPORTERS = [
  'packages/server/src/handlers/blood-tests/[id]/handler.ts',
  'packages/server/src/handlers/blood-tests/handler.ts',
  'packages/server/src/lib/privacy/consent-store.ts',
  'packages/server/src/lib/privacy/export.ts',
];

describe('blood test read boundary', () => {
  it('lets only the listed modules import the blood test queries', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const tracked = execFileSync(
      'git',
      [
        'grep',
        '--untracked',
        '-l',
        '-E',
        'queries/blood-tests|prisma\\.bloodTest',
        '--',
        'packages/**/*.ts',
        'apps/**/*.ts',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    const importers = tracked
      .split('\n')
      .filter((file) => file && !file.includes('queries/blood-tests'))
      .sort();

    expect(importers).toEqual(ALLOWED_IMPORTERS);
  });
});
