/**
 * Resolve Plan Gate evidenceRefs to athlete-facing French labels.
 * Unknown or opaque refs are omitted — never surface raw rule codes via this path.
 */

const EVIDENCE_REF_LABELS: Record<string, string> = {
  'decision.confidenceTier': 'Niveau de confiance de la décision',
  'decision.confidence': 'Score de confiance',
  'decision.overallVerdict': 'Verdict du jour',
  'decision.limitingFactor': 'Facteur limitant',
  fatigueTrainingCapacity: "Capacité d'entraînement (fatigue)",
  'physicalHealth.aggregateTrainingCapacity': 'Capacité liée à la santé physique',
  'physicalHealth.conditions': 'Conditions de santé déclarées',
  'athleteProfile.hasThresholds': 'Seuils athlète configurés',
  'proposal.strengthPrescription': 'Prescription de force',
  'proposal.durationMin': 'Durée proposée',
  'proposal.date': 'Date proposée',
  'proposal.type': 'Type de séance proposé',
  'context.practicedSports': 'Sports pratiqués',
  'context.now': "Horloge du jour d'évaluation",
  'wellness.checkin': 'Check-in bien-être',
};

export function labelEvidenceRefs(refs: readonly string[]): readonly string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const exact = EVIDENCE_REF_LABELS[ref];
    if (exact) {
      if (!seen.has(exact)) {
        seen.add(exact);
        labels.push(exact);
      }
      continue;
    }
    // Structured path prefixes we understand without leaking IDs
    if (ref.startsWith('existingSessions')) {
      const label = 'Séances déjà planifiées';
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
      continue;
    }
    if (ref.startsWith('planWeeks') || ref.includes('weekly') || ref.startsWith('proposals[')) {
      const label = 'Charge / intensité de la semaine';
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
      continue;
    }
    if (ref.startsWith('goal') || ref.includes('goal.')) {
      const label = 'Objectif / phase de plan';
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
  }
  return labels;
}
