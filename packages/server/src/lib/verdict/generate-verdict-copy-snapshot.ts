/**
 * Regenerates `verdict-copy.snapshot.json` from the shared glossary.
 *
 *   yarn workspace @sharpit/server exec tsx src/lib/verdict/generate-verdict-copy-snapshot.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeVerdictCopyGlossary } from '@sharpit/server/lib/verdict/verdict-copy';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'verdict-copy.snapshot.json');

const snapshot = serializeVerdictCopyGlossary();
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.info(`Wrote ${out}`);
