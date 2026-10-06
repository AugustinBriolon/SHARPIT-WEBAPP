/**
 * The help centre's search, run in the browser over every article. Pure: no DOM, no fetch, so
 * the ranking is tested like any other rule.
 */

export type HelpSearchEntry = {
  href: string;
  title: string;
  category: string;
  summary: string;
  /** The article's body as plain text. */
  text: string;
};

export type PreparedEntry = HelpSearchEntry & {
  folded: { title: string; category: string; summary: string; text: string };
};

export type HelpSearchResult = {
  href: string;
  title: string;
  category: string;
  /** A line around the first match, cut in three so the match can be marked. */
  snippet: { before: string; match: string; after: string };
};

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Characters a reader types otherwise: « VO₂max » is searched as « vo2max ». */
const FOLDED_AS: Record<string, string> = { '’': "'", '₂': '2' };

/**
 * Lowercase, accents removed, apostrophes and subscripts typed plainly, one character for one: an index in the
 * folded text is the same index in the original, so a match found folded is marked in place.
 */
export function fold(text: string): string {
  let folded = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const base =
      FOLDED_AS[char] ?? char.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
    folded += base.length === 1 ? base : char;
  }
  return folded;
}

/** The words a question carries no meaning in: « comment supprimer mon compte » searches « supprimer compte ». */
const STOPWORDS = new Set(
  (
    'a au aux avec c ce ces cet cette comment d dans de des du elle en est est-ce et il j je l la le les ' +
    'leur m ma mais me mes mon ne nous on ou par pas peut peux pour pourquoi puis qu quand que quel ' +
    'quelle quelles quels qui quoi s sa sans se ses son sur t ta te tes ton tu un une vos votre vous'
  ).split(' '),
);

/** The words of a query, folded, without stopwords, plurals reduced to their singular. */
export function queryTokens(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word));
}

/** Markdown to the words a reader sees: link text kept, syntax and table rules dropped. */
export function markdownToText(markdown: string): string {
  return (
    markdown
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // A heading runs into its paragraph once flattened: a full stop keeps them apart.
      .replace(/^#{1,6}\s+(.+)$/gm, '$1.')
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
      .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
      .replace(/[*_`]/g, '')
      .replace(/[#>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function prepareEntries(entries: readonly HelpSearchEntry[]): PreparedEntry[] {
  return entries.map((entry) => ({
    ...entry,
    folded: {
      title: fold(entry.title),
      category: fold(entry.category),
      summary: fold(entry.summary),
      text: fold(entry.text),
    },
  }));
}

function startsWord(haystack: string, index: number): boolean {
  return index === 0 || !/[a-z0-9]/.test(haystack[index - 1]);
}

/** How well one token matches an entry: the title counts most, the body least; 0 is no match. */
function tokenScore(entry: PreparedEntry, token: string): number {
  const { title, category, summary, text } = entry.folded;
  const inTitle = title.indexOf(token);
  if (inTitle >= 0) {
    return startsWord(title, inTitle) ? 10 : 6;
  }
  if (category.includes(token)) {
    return 4;
  }
  if (summary.includes(token)) {
    return 3;
  }
  return text.includes(token) ? 1 : 0;
}

const SNIPPET_RADIUS = 60;

function snippet(entry: PreparedEntry, tokens: readonly string[]): HelpSearchResult['snippet'] {
  for (const field of ['summary', 'text'] as const) {
    const folded = entry.folded[field];
    for (const token of tokens) {
      const at = folded.indexOf(token);
      if (at < 0) {
        continue;
      }
      const source = entry[field];
      const start = Math.max(0, at - SNIPPET_RADIUS);
      const end = Math.min(source.length, at + token.length + SNIPPET_RADIUS);
      return {
        before: (start > 0 ? '…' : '') + source.slice(start, at),
        match: source.slice(at, at + token.length),
        after: source.slice(at + token.length, end) + (end < source.length ? '…' : ''),
      };
    }
  }
  return { before: entry.summary, match: '', after: '' };
}

/**
 * Entries matching every word of the query, best first. When no entry holds them all, those
 * holding the most of them: a question worded differently from the article still finds it.
 */
export function searchHelp(
  entries: readonly PreparedEntry[],
  query: string,
  limit = 8,
): HelpSearchResult[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const scored = entries
    .map((entry) => {
      const scores = tokens.map((token) => tokenScore(entry, token));
      return {
        entry,
        matched: scores.filter((score) => score > 0).length,
        score: scores.reduce((sum, score) => sum + score, 0),
      };
    })
    .filter((candidate) => candidate.matched > 0);
  const best = Math.max(0, ...scored.map((candidate) => candidate.matched));
  return scored
    .filter((candidate) => candidate.matched === best)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'fr'))
    .slice(0, limit)
    .map(({ entry }) => ({
      href: entry.href,
      title: entry.title,
      category: entry.category,
      snippet: snippet(entry, tokens),
    }));
}
