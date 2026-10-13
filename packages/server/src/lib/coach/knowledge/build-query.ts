/**
 * Builds a deterministic retrieval query for plan/adapt from the athlete focus and Twin cues.
 * Pure — no I/O.
 */

export type CoachKnowledgeSituation = 'absence' | 'pain' | 'return';

export type CoachKnowledgeQueryCues = {
  focus?: string | null;
  sports?: readonly string[] | null;
  verdict?: string | null;
  limitingFactor?: string | null;
  planPhase?: string | null;
  /** Week training quality label or code (see knowledge/periodization-qualities.md). */
  quality?: string | null;
  /** Absence / pain / return playbook cue (see knowledge/absence-and-pain-playbooks.md). */
  situation?: CoachKnowledgeSituation | null;
};

const LOAD_RECOVERY_BIAS = 'recuperation fatigue charge entrainement';

const SITUATION_QUERY: Record<CoachKnowledgeSituation, string> = {
  absence: 'absence semaines manque reprise progressive reporter annuler',
  pain: 'douleur blessure zone douleur playbook pause alleger',
  return: 'reprise retour blessure progressive confiance',
};

export function buildCoachKnowledgeQuery(input: CoachKnowledgeQueryCues): string {
  const parts = [
    input.focus?.trim() || null,
    input.quality?.trim() ? `qualite ${input.quality.trim()}` : null,
    input.verdict ? `verdict ${input.verdict}` : null,
    input.limitingFactor ? `facteur ${input.limitingFactor}` : null,
    input.planPhase ? `phase ${input.planPhase}` : null,
    input.situation ? SITUATION_QUERY[input.situation] : null,
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
    input.quality?.trim() ? `qualite ${input.quality.trim()}` : null,
    input.verdict ? `verdict ${input.verdict}` : null,
    input.limitingFactor ? `facteur ${input.limitingFactor}` : null,
    input.planPhase ? `phase ${input.planPhase}` : null,
    input.situation ? SITUATION_QUERY[input.situation] : null,
    input.sports && input.sports.length > 0 ? input.sports.join(' ') : null,
    LOAD_RECOVERY_BIAS,
  ].filter(Boolean);
  return parts.join(' ');
}
