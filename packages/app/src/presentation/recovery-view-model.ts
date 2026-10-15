import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import type { GlobalDecisionContext } from '@sharpit/app/presentation/global-decision-context';
import type { ProductInsightBundle } from '@sharpit/core/product-insight/types';
import type {
  PresentationEmptyState,
  PresentationHierarchy,
  PresentationSection,
} from '@sharpit/app/presentation/types';

// Note: les pages drill-down conservent date/isToday/handlers côté client.
export type RecoveryViewModel = {
  readinessScore: number | null;
  signal: { label: string; qualityClass: string; arrow: string };
  limiterLabel: string | null;
  /** Stable machine code for the frein signal — same vocabulary as Today `limiterSignal`. */
  limiterSignal:
    | 'hrv_low'
    | 'rhr_high'
    | 'sleep_short'
    | 'sleep_poor'
    | 'subjective_low'
    | 'load_elevated'
    | null;
  estimatedRecoveryDays: number | null;
  isCalibrating: boolean;
  availableDimCount: number;

  dimensions: NonNullable<AthleteSnapshot['recovery']>['dimensions'];
  intensityLabel: string;
  intensityClassName: string;
  rationale: string[];
  autonomicLabel: string;
  autonomicClass: string;
  wellnessLabel: string;
  wellnessClass: string;
  loadLabel: string;
  loadClass: string;
  dissonanceDetected: boolean;

  sparkHrv: { date: string; value: number | null }[];
  sparkRhr: { date: string; value: number | null }[];
  dualData: { date: string; a: number | null; b: number | null }[];
  baselineLow: number | null;
  baselineHigh: number | null;
  hrv: number | null;
  restingHr: number | null;
  bodyBattery: number | null;

  confidencePct: number;
  confidenceTone: 'good' | 'warn' | 'neutral' | 'bad';
  completenessLabel: string;
  overreaching?: { label: string; colorClass: string };
  illness?: { label: string; colorClass: string };
  keyEvidence: string[];

  insights: ProductInsightBundle;

  /** Product decision from Decision Engine — distinct from domain intensity below. */
  globalDecision: GlobalDecisionContext;

  emptyState: PresentationEmptyState | null;
  hierarchy: PresentationHierarchy;
  sections: PresentationSection[];
};
