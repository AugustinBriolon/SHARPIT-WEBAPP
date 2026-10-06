import { describe, expect, it } from 'vitest';
import { buildCoachKnowledgeQuery } from './build-query';
import { formatKnowledgeRagBlock } from './format-knowledge-rag-block';
import { coachKnowledgeIndexSize, retrieveCoachKnowledge } from './retrieve-coach-knowledge';

describe('coach knowledge RAG', () => {
  it('bundles a non-empty scientific index', () => {
    expect(coachKnowledgeIndexSize()).toBeGreaterThan(20);
  });

  it('retrieves recovery-related chunks for a recovery query', () => {
    const hits = retrieveCoachKnowledge('recuperation HRV sommeil score readiness');
    expect(hits).not.toBeNull();
    expect(hits!.length).toBeGreaterThan(0);
    expect(hits![0]!.score).toBeGreaterThanOrEqual(4);
    expect(
      hits!.some((h) => /recovery|recuperation|sommeil|sleep|hrv/i.test(h.source + h.title)),
    ).toBe(true);
  });

  it('refuses injection when the query has no meaningful tokens', () => {
    expect(retrieveCoachKnowledge('le la les')).toBeNull();
    expect(formatKnowledgeRagBlock(null)).toBe('');
  });

  it('refuses injection when the best score is below the threshold', () => {
    expect(retrieveCoachKnowledge('xyzzy plugh unrelated', { minScore: 50 })).toBeNull();
  });

  it('formats a prompt block with sources when hits exist', () => {
    const hits = retrieveCoachKnowledge('recuperation HRV sommeil score readiness');
    expect(hits).not.toBeNull();
    const block = formatKnowledgeRagBlock(hits);
    expect(block).toContain('## Références Sharpit');
    expect(block).toContain('Source:');
    expect(block).toContain('knowledge/');
  });

  it('builds a deterministic query from focus and twin cues', () => {
    expect(
      buildCoachKnowledgeQuery({
        focus: 'alléger la semaine',
        verdict: 'RECOVER',
        limitingFactor: 'FATIGUE',
        sports: ['RUN'],
      }),
    ).toContain('alléger la semaine');
    expect(buildCoachKnowledgeQuery({ focus: null })).toMatch(/recuperation/i);
  });
});
