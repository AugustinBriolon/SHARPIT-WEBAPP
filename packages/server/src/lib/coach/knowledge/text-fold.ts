/**
 * Folded text helpers for coach knowledge retrieval (same rules as the hub help search).
 * Kept inside @sharpit/server so the coach never imports apps/hub.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const FOLDED_AS: Record<string, string> = { '’': "'", '₂': '2' };

const STOPWORDS = new Set(
  (
    'a au aux avec c ce ces cet cette comment d dans de des du elle en est est-ce et il j je l la le les ' +
    'leur m ma mais me mes mon ne nous on ou par pas peut peux pour pourquoi puis qu quand que quel ' +
    'quelle quelles quels qui quoi s sa sans se ses son sur t ta te tes ton tu un une vos votre vous'
  ).split(' '),
);

/** Lowercase, accents stripped; indices stay aligned with the source when characters fold 1:1. */
export function fold(text: string): string {
  let folded = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    const base =
      FOLDED_AS[char] ?? char.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
    folded += base.length === 1 ? base : char;
  }
  return folded;
}

/** Query words without stopwords; trailing plural s/x dropped when length > 3. */
export function queryTokens(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word));
}

/** Markdown body → plain words for indexing and snippets. */
export function markdownToPlainText(markdown: string): string {
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
