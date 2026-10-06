import {
  rewriteCoachKnowledgeQuery,
  type CoachKnowledgeQueryCues,
} from '@sharpit/server/lib/coach/knowledge/build-query';
import { fold, queryTokens } from '@sharpit/server/lib/coach/knowledge/text-fold';
import type {
  CoachKnowledgeChunk,
  CoachKnowledgeHit,
} from '@sharpit/server/lib/coach/knowledge/types';
import indexJson from './coach-knowledge-index.json';

/** Minimum best-hit score before we inject a RAG block (typed refuse below this). */
export const COACH_KNOWLEDGE_MIN_SCORE = 4;

const TOP_K = 3;

type IndexedChunk = CoachKnowledgeChunk & {
  foldedTitle: string;
  foldedText: string;
};

const INDEX: readonly IndexedChunk[] = (indexJson as CoachKnowledgeChunk[]).map((chunk) => ({
  ...chunk,
  foldedTitle: fold(chunk.title),
  foldedText: fold(chunk.text),
}));

function startsWord(haystack: string, index: number): boolean {
  return index === 0 || !/[a-z0-9]/.test(haystack[index - 1]!);
}

function tokenScore(chunk: IndexedChunk, token: string): number {
  const inTitle = chunk.foldedTitle.indexOf(token);
  if (inTitle >= 0) {
    return startsWord(chunk.foldedTitle, inTitle) ? 10 : 6;
  }
  return chunk.foldedText.includes(token) ? 1 : 0;
}

/**
 * Keyword retrieval over the bundled scientific knowledge index.
 * Returns null when nothing is strong enough — callers must omit the RAG block.
 */
export function retrieveCoachKnowledge(
  query: string,
  options: { limit?: number; minScore?: number } = {},
): CoachKnowledgeHit[] | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return null;
  }
  const limit = options.limit ?? TOP_K;
  const minScore = options.minScore ?? COACH_KNOWLEDGE_MIN_SCORE;

  const scored = INDEX.map((chunk) => {
    const scores = tokens.map((token) => tokenScore(chunk, token));
    return {
      chunk,
      matched: scores.filter((score) => score > 0).length,
      score: scores.reduce((sum, score) => sum + score, 0),
    };
  }).filter((candidate) => candidate.matched > 0);

  if (scored.length === 0) {
    return null;
  }

  const bestMatchCount = Math.max(...scored.map((c) => c.matched));
  const hits = scored
    .filter((c) => c.matched === bestMatchCount || c.matched >= Math.max(1, tokens.length - 1))
    .sort((a, b) => b.score - a.score || b.matched - a.matched)
    .slice(0, limit)
    .map((c): CoachKnowledgeHit => ({
      id: c.chunk.id,
      title: c.chunk.title,
      source: c.chunk.source,
      text: c.chunk.text,
      score: c.score,
    }));

  if (!hits[0] || hits[0].score < minScore) {
    return null;
  }
  return hits;
}

/**
 * One corrective retry when the primary query misses: rewrite without free-text focus,
 * bias load/recovery. Still returns null if the fallback also fails the score floor.
 */
export function retrieveCoachKnowledgeWithCorrection(
  primaryQuery: string,
  cues: CoachKnowledgeQueryCues,
  options: { limit?: number; minScore?: number } = {},
): CoachKnowledgeHit[] | null {
  const primary = retrieveCoachKnowledge(primaryQuery, options);
  if (primary) {
    return primary;
  }
  const fallback = rewriteCoachKnowledgeQuery(cues).trim();
  if (!fallback || fallback === primaryQuery.trim()) {
    return null;
  }
  return retrieveCoachKnowledge(fallback, options);
}

/** Test helper: size of the bundled index. */
export function coachKnowledgeIndexSize(): number {
  return INDEX.length;
}
