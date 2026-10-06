import { describe, expect, it } from 'vitest';
import { labelEvidenceRefs } from './evidence-ref-labels';

describe('labelEvidenceRefs', () => {
  it('maps known decision refs to French labels', () => {
    expect(labelEvidenceRefs(['decision.confidenceTier', 'decision.overallVerdict'])).toEqual([
      'État en calibration / niveau de confiance',
      'Verdict du jour',
    ]);
  });

  it('deduplicates labels', () => {
    expect(labelEvidenceRefs(['decision.confidenceTier', 'decision.confidenceTier'])).toEqual([
      'État en calibration / niveau de confiance',
    ]);
  });

  it('omits unknown raw refs instead of leaking them', () => {
    expect(labelEvidenceRefs(['some.internal.path', 'decision.confidence'])).toEqual([
      'Score de confiance',
    ]);
  });

  it('collapses existingSessions[*] refs', () => {
    expect(labelEvidenceRefs(['existingSessions[id=abc]'])).toEqual(['Séances déjà planifiées']);
  });
});
