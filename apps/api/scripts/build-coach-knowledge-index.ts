/**
 * Builds the bundled coach knowledge index from `knowledge/*.md`.
 *
 *   yarn api data:coach-knowledge
 *
 * Writes packages/server/src/lib/coach/knowledge/coach-knowledge-index.json.
 * Excludes research scrapes, README stubs, and retired constitution docs.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');
const KNOWLEDGE_DIR = join(REPO_ROOT, 'knowledge');
const OUTPUT = resolve(
  __dirname,
  '../../../packages/server/src/lib/coach/knowledge/coach-knowledge-index.json',
);

/** Files that are indexes, redirects, or superseded — not athlete-facing science. */
const EXCLUDED = new Set([
  'README.md',
  'architecture-links.md',
  'product-constitution.md',
  'decision-engine.md',
  'recommendation-engine.md',
  'future-research.md',
]);

const MAX_CHUNK_CHARS = 900;

type Chunk = {
  id: string;
  title: string;
  source: string;
  text: string;
};

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+(.+)$/gm, '$1.')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/[#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function chunkMarkdown(fileName: string, raw: string): Chunk[] {
  const fileTitle = basename(fileName, '.md');
  // Split on ## headings; keep the H1 doc title as prefix.
  const h1 = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fileTitle;
  const sections = raw.split(/\n(?=##\s+)/);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const heading = section.match(/^##\s+(.+)$/m)?.[1]?.trim();
    const title = heading ? `${h1} — ${heading}` : h1;
    const plain = markdownToPlainText(section);
    if (plain.length < 80) {
      continue;
    }
    const text = plain.length > MAX_CHUNK_CHARS ? `${plain.slice(0, MAX_CHUNK_CHARS)}…` : plain;
    const anchor = heading ? slugify(heading) : 'intro';
    chunks.push({
      id: `${fileName.replace(/\.md$/, '')}--${anchor}`,
      title,
      source: `knowledge/${fileName}${heading ? `#${anchor}` : ''}`,
      text,
    });
  }

  // Fallback: whole file as one chunk when no ## sections produced usable pieces.
  if (chunks.length === 0) {
    const plain = markdownToPlainText(raw);
    if (plain.length >= 80) {
      chunks.push({
        id: `${fileName.replace(/\.md$/, '')}--all`,
        title: h1,
        source: `knowledge/${fileName}`,
        text: plain.length > MAX_CHUNK_CHARS ? `${plain.slice(0, MAX_CHUNK_CHARS)}…` : plain,
      });
    }
  }
  return chunks;
}

function build(): Chunk[] {
  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((name) => name.endsWith('.md') && !EXCLUDED.has(name))
    .sort();
  return files.flatMap((name) =>
    chunkMarkdown(name, readFileSync(join(KNOWLEDGE_DIR, name), 'utf8')),
  );
}

const chunks = build();
writeFileSync(OUTPUT, `${JSON.stringify(chunks, null, 2)}\n`, 'utf8');
console.log(`Wrote ${chunks.length} chunks → ${OUTPUT}`);
