import { describe, expect, it } from 'vitest';
import { checkTurn, type CoachToolCall, type TurnCheckId } from './turn-checks';

const written = (output: unknown = { ok: true }): CoachToolCall => ({
  name: 'createPlannedSession',
  input: {},
  output,
  state: 'output-available',
});

function checksOf(text: string, tools: CoachToolCall[] = []): TurnCheckId[] {
  return checkTurn({ text, tools }).map((finding) => finding.check);
}

// Synthetic turns: each one reproduces a failure seen in the phase 0 audit (ADR-118). None holds
// athlete data.
describe('checkTurn', () => {
  it('flags an answer with no text and no tool call', () => {
    expect(checksOf('   ')).toEqual(['empty-answer']);
  });

  it('flags a written session followed by a request for approval', () => {
    expect(checksOf('Voici la séance. Est-ce que cela te convient ?', [written()])).toContain(
      'writes-then-asks',
    );
  });

  it('does not flag an approval question when nothing was written', () => {
    expect(checksOf('Est-ce que cela te convient ?')).toEqual([]);
  });

  it('flags a claimed change that no tool call made', () => {
    expect(checksOf("J'ai mis à jour la structure de ta séance.")).toContain('claims-without-tool');
  });

  it('does not flag a claimed change backed by a successful write', () => {
    expect(checksOf("J'ai décalé ton déroulage à demain.", [written()])).not.toContain(
      'claims-without-tool',
    );
  });

  it('flags a tool call pasted into the answer as JSON', () => {
    expect(checksOf('{ "updatePlannedSession": { "id": "x" } }')).toContain('raw-tool-json');
  });

  it('flags an internal verdict code shown to the athlete', () => {
    expect(checksOf('Ton verdict est RECOVER aujourd’hui.')).toContain('internal-codes');
  });

  it('flags a session the server called underfilled when the answer ignores it', () => {
    const audit = { strengthAudit: { message: 'Séance sous-remplie : 9 exercices ≈ 40 min' } };

    expect(checksOf('Ta séance est bien enregistrée.', [written(audit)])).toContain(
      'audit-warning-ignored',
    );
  });

  it('does not flag an underfilled session the answer mentions', () => {
    const audit = { strengthAudit: { message: 'Séance sous-remplie : 9 exercices ≈ 40 min' } };

    expect(
      checksOf('Elle est un peu courte, je peux la compléter.', [written(audit)]),
    ).not.toContain('audit-warning-ignored');
  });

  it('flags a refused tool call described as an error', () => {
    const denied: CoachToolCall = {
      name: 'createPlannedSession',
      input: {},
      output: undefined,
      state: 'output-denied',
    };

    expect(checksOf("Il semble y avoir eu une petite erreur dans l'envoi.", [denied])).toContain(
      'denied-misread',
    );
  });

  it('returns nothing for a clean answer', () => {
    expect(checkTurn({ text: 'Bonne séance, reste sur ton rythme.', tools: [] })).toEqual([]);
  });
});
