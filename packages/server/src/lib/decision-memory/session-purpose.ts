/**
 * The athlete-facing "why" for a planned session — the LLM rationale stored on the
 * CoachingDecision proposal that created (or last accepted) it. Decision Memory is the
 * source of truth: PlannedSession itself does not store prose.
 */

export function purposeFromProposal(proposal: unknown): string | null {
  if (!proposal || typeof proposal !== 'object') {
    return null;
  }
  const { rationale } = proposal as { rationale?: unknown };
  if (typeof rationale !== 'string') {
    return null;
  }
  const trimmed = rationale.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * First action wins — callers must pass actions newest-first so the latest decision
 * that created or accepted the session supplies the purpose.
 */
export function mapPurposesFromActions(
  actions: ReadonlyArray<{
    resultingPlannedSessionId: string | null;
    proposal: unknown;
  }>,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const action of actions) {
    const id = action.resultingPlannedSessionId;
    if (!id || result.has(id)) {
      continue;
    }
    const purpose = purposeFromProposal(action.proposal);
    if (purpose) {
      result.set(id, purpose);
    }
  }
  return result;
}
