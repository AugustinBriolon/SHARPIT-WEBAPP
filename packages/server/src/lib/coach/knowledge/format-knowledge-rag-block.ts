import type { CoachKnowledgeHit } from '@sharpit/server/lib/coach/knowledge/types';

/**
 * Prompt block for plan/adapt. Empty string when retrieval refused (weak evidence) —
 * the model must not invent science outside Twin facts already in the athlete context.
 */
export function formatKnowledgeRagBlock(hits: readonly CoachKnowledgeHit[] | null): string {
  if (!hits || hits.length === 0) {
    return '';
  }
  const body = hits
    .map(
      (hit) =>
        `### ${hit.title}\nSource: ${hit.source}\n${hit.text.slice(0, 700)}${hit.text.length > 700 ? '…' : ''}`,
    )
    .join('\n\n');
  return `

## Références Sharpit (corpus interne)
N'utilise ces extraits que s'ils éclairent la prescription. Ne fabrique pas de science hors Twin et hors de ces sources. Si un extrait contredit le verdict du jour, le verdict l'emporte.

${body}`;
}
