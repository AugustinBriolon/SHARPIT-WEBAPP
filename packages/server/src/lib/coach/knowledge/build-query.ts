/**
 * Builds a deterministic retrieval query for plan/adapt from the athlete focus and Twin cues.
 * Pure — no I/O.
 */

export function buildCoachKnowledgeQuery(input: {
  focus?: string | null;
  sports?: readonly string[] | null;
  verdict?: string | null;
  limitingFactor?: string | null;
  planPhase?: string | null;
}): string {
  const parts = [
    input.focus?.trim() || null,
    input.verdict ? `verdict ${input.verdict}` : null,
    input.limitingFactor ? `facteur ${input.limitingFactor}` : null,
    input.planPhase ? `phase ${input.planPhase}` : null,
    input.sports && input.sports.length > 0 ? input.sports.join(' ') : null,
    // Bias toward load/recovery science when the athlete gave no focus.
    !input.focus?.trim() ? 'recuperation fatigue charge entrainement' : null,
  ].filter(Boolean);
  return parts.join(' ');
}
