/**
 * Deterministic checks on one coach answer: what the text claims against the tools it actually
 * ran. No model is called, so they run in CI and on stored turns alike (ADR-118).
 */

export type CoachToolCall = {
  name: string;
  input: unknown;
  output: unknown;
  /** The SDK's tool-part state: 'output-available', 'output-denied', 'output-error', … */
  state: string;
};

export type CoachTurn = { text: string; tools: CoachToolCall[] };

export type TurnCheckId =
  | 'empty-answer'
  | 'writes-then-asks'
  | 'claims-without-tool'
  | 'raw-tool-json'
  | 'internal-codes'
  | 'audit-warning-ignored'
  | 'denied-misread';

export type TurnFinding = { check: TurnCheckId; detail: string };

const WRITE_TOOLS: ReadonlySet<string> = new Set(['createPlannedSession', 'updatePlannedSession']);

const ASKS_FOR_APPROVAL =
  /(te convient|ça te va|on valide|valides[- ]tu|souhaites[- ]tu|veux[- ]tu|on garde|est-ce que .{0,80}\?)/i;
const CLAIMS_A_WRITE =
  /\b(je (mets|ai mis|ai déplacé|ai ajouté|ai créé|ai modifié|ai inversé|ai décalé|viens de)|j'ai (mis|déplacé|ajouté|créé|modifié|inversé|décalé|enregistré))\b|\b(est|sont) (bien )?(enregistrée?s?|créée?s?|déplacée?s?|mise?s? à jour)\b/i;
const RAW_TOOL_JSON = /"(createPlannedSession|updatePlannedSession|suggestFollowUps)"\s*:/;
const INTERNAL_CODES =
  /\b(RECOVER|TRAIN_EASY|TRAIN_HARD|TRAIN_MODERATE|PROTECT)\b|`cm[a-z0-9]{20,}`/;
const UNDERFILLED = /sous-remplie|sous remplie/i;
const ACKNOWLEDGES_UNDERFILL = /(sous-remplie|courte|étoff|rallong|complète|ajout|plus long)/i;
const DENIAL_MISREAD = /(petite erreur|il semble y avoir eu|une erreur)/i;

function isOk(output: unknown): boolean {
  return typeof output === 'object' && output !== null && (output as { ok?: unknown }).ok === true;
}

function successfulWrites(turn: CoachTurn): CoachToolCall[] {
  return turn.tools.filter(
    (tool) => WRITE_TOOLS.has(tool.name) && tool.state === 'output-available' && isOk(tool.output),
  );
}

function underfilledWarnings(turn: CoachTurn): string[] {
  return turn.tools.flatMap((tool) => {
    const message = (tool.output as { strengthAudit?: { message?: unknown } } | null)?.strengthAudit
      ?.message;
    return typeof message === 'string' && UNDERFILLED.test(message) ? [message] : [];
  });
}

/** Each check returns a finding when the turn breaks it; a clean turn returns nothing. */
export function checkTurn(turn: CoachTurn): TurnFinding[] {
  const { text } = turn;
  const writes = successfulWrites(turn);
  const findings: Array<TurnFinding | null> = [
    turn.text.trim() === '' && turn.tools.length === 0
      ? { check: 'empty-answer', detail: 'no text and no tool call' }
      : null,
    writes.length > 0 && ASKS_FOR_APPROVAL.test(text)
      ? { check: 'writes-then-asks', detail: 'session written, then asks whether it suits' }
      : null,
    CLAIMS_A_WRITE.test(text) && writes.length === 0
      ? { check: 'claims-without-tool', detail: 'says a session was changed, no write succeeded' }
      : null,
    RAW_TOOL_JSON.test(text)
      ? { check: 'raw-tool-json', detail: 'tool call written into the answer as JSON' }
      : null,
    INTERNAL_CODES.test(text)
      ? { check: 'internal-codes', detail: 'internal verdict code or id shown to the athlete' }
      : null,
    underfilledWarnings(turn).length > 0 && !ACKNOWLEDGES_UNDERFILL.test(text)
      ? { check: 'audit-warning-ignored', detail: 'session flagged as underfilled, not mentioned' }
      : null,
    turn.tools.some((tool) => tool.state === 'output-denied') && DENIAL_MISREAD.test(text)
      ? { check: 'denied-misread', detail: 'a refused tool call is described as an error' }
      : null,
  ];
  return findings.filter((finding): finding is TurnFinding => finding !== null);
}
