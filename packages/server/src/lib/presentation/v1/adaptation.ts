import type { AdaptationViewModel } from '@sharpit/app/presentation/adaptation-view-model';
import { toneFromClass, type V1RecoveryTone } from '@sharpit/server/lib/presentation/v1/recovery';

export type V1AdaptationSource = Omit<
  AdaptationViewModel,
  'insights' | 'globalDecision' | 'hierarchy' | 'sections'
>;

export type V1AdaptationResponse = {
  apiVersion: 1;
  trainingDayId: string;
  empty: { title: string; message: string | null } | null;
  /** 0–100; how the body answers the load. */
  index: number | null;
  status: { label: string; tone: V1RecoveryTone };
  trendLabel: string;
  verdict: { key: string; label: string; tone: V1RecoveryTone };
  loadMultiplier: number;
  rationale: string[];
  keyEvidence: string[];
  /** The dimension holding the adaptation back, worded. */
  limitingFactor: string | null;
  plateauRisk: boolean;
  overreachingWithoutAdaptation: boolean;
  /** Higher is better. */
  dimensions: Array<{
    key: string;
    label: string;
    description: string;
    available: boolean;
    score: number | null;
    isLimiting: boolean;
  }>;
  historyLength: number;
  confidencePct: number | null;
};

/** Canonical Adaptation payload for native clients — a projection, no new domain logic. */
export function projectV1Adaptation(
  source: V1AdaptationSource,
  trainingDayId: string,
): V1AdaptationResponse {
  return {
    apiVersion: 1,
    trainingDayId,
    empty: source.emptyState
      ? { title: source.emptyState.title, message: source.emptyState.description ?? null }
      : null,
    index: source.adaptationIndex,
    status: { label: source.statusLabel, tone: toneFromClass(source.statusClassName) },
    trendLabel: source.trendLabel,
    verdict: {
      key: source.verdictKey,
      label: source.verdictLabel,
      tone: toneFromClass(source.verdictClassName),
    },
    loadMultiplier: source.loadMultiplier,
    rationale: source.rationale,
    keyEvidence: source.keyEvidence,
    limitingFactor: source.limitingFactor,
    plateauRisk: source.plateauRisk,
    overreachingWithoutAdaptation: source.overreachingWithoutAdaptation,
    dimensions: source.dimensions.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      description: dimension.description,
      available: dimension.dim.available,
      score: dimension.dim.available ? dimension.dim.score : null,
      isLimiting: dimension.label === source.limitingFactor,
    })),
    historyLength: source.historyLength,
    confidencePct: source.emptyState ? null : source.confidencePct,
  };
}
