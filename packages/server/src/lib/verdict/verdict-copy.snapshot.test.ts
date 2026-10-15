import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { serializeVerdictCopyGlossary } from '@sharpit/server/lib/verdict/verdict-copy';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotPath = join(here, 'verdict-copy.snapshot.json');

describe('verdict-copy.snapshot.json', () => {
  it('stays in sync with serializeVerdictCopyGlossary()', () => {
    const onDisk = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const expected = serializeVerdictCopyGlossary();
    expect(onDisk).toEqual(expected);
  });
});
