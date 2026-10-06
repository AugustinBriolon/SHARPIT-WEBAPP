/**
 * Builds a deterministic retrieval query for plan/adapt from the athlete focus and Twin cues.
 * Pure — no I/O.
 */

export type CoachKnowledgeQueryCues = {
  focus?: string | null;
  sports?: readonly string[] | null;
  verdict?: string | null;
  limitingFactor?: string | null;
  planPhase?: string | null;
};

const LOAD_RECOVERY_BIAS = 'recuperation fatigue charge entrainement';

export function buildCoachKnowledgeQuery(input: CoachKnowledgeQueryCues): string {
  const parts = [
    input.focus?.trim() || null,
    input.verdict ? `verdict ${input.verdict}` : null,
    input.limitingFactor ? `facteur ${input.limitingFactor}` : null,
    input.planPhase ? `phase ${input.planPhase}` : null,
    input.sports && input.sports.length > 0 ? input.sports.join(' ') : null,
    // Bias toward load/recovery science when the athlete gave no focus.
    !input.focus?.trim() ? LOAD_RECOVERY_BIAS : null,
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * Corrective rewrite: drop free-text focus (often zero-hit) and always bias load/recovery.
 * Pure — no I/O.
 */
export function rewriteCoachKnowledgeQuery(input: CoachKnowledgeQueryCues): string {
  const parts = [
    input.verdict ? `verdict ${input.verdict}` : null,
    input.limitingFactor ? `facteur ${input.limitingFactor}` : null,
    input.planPhase ? `phase ${input.planPhase}` : null,
    input.sports && input.sports.length > 0 ? input.sports.join(' ') : null,
    LOAD_RECOVERY_BIAS,
  ].filter(Boolean);
  return parts.join(' ');
}
