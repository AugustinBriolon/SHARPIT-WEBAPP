import type { AdaptationData, TopAction } from '@sharpit/app/athlete-state/today-state';
import { isSet } from '@sharpit/shared/value';
import type { DailyPhase } from '@sharpit/app/lib/daily-phase/types';
import { isForwardAdvicePhase } from '@sharpit/app/lib/daily-phase/resolve';
import { resolveCode } from '@sharpit/app/lib/french';
import {
  mapVerdictToDisplay,
  type OverallVerdict,
} from '@sharpit/app/lib/today/dashboard/today-mapping';
import { ADAPTATION_STATUS_SIGNAL } from '@sharpit/app/lib/today/dashboard/today-dashboard-labels';

export function buildTopActionLine(topAction: TopAction | null): string | null {
  if (!topAction) {
    return null;
  }
  const verb = resolveCode(topAction.verbCode);
  const focus = resolveCode(topAction.focusCode);
  if (!verb || verb === topAction.verbCode) {
    return null;
  }
  return focus && focus !== topAction.focusCode ? `${verb} — ${focus}` : verb;
}

export function actionRowLabels(phase: DailyPhase): {
  limiting: string;
  action: string;
} {
  switch (phase) {
    case 'BEFORE_SESSION':
      return {
        limiting: 'Ce qui peut impacter ta séance',
        action: 'Séance du jour',
      };
    case 'SESSION_COMPLETED':
      return {
        limiting: 'Impact sur ta progression',
        action: 'Ce que tu as fait',
      };
    case 'RECOVERY_WINDOW':
      return {
        limiting: 'Frein du jour',
        action: 'Prochaines actions',
      };
    case 'END_OF_DAY':
      return {
        limiting: 'Détail',
        action: 'Bilan du jour',
      };
    default:
      return {
        limiting: 'Frein du jour',
        action: 'Aujourd’hui',
      };
  }
}

export function trajectoryEyebrow(phase: DailyPhase): string {
  switch (phase) {
    case 'SESSION_COMPLETED':
      return 'Après séance · 14 j';
    case 'RECOVERY_WINDOW':
    case 'END_OF_DAY':
      return 'Avant demain · 14 j';
    default:
      return '14 derniers jours';
  }
}

export function shouldShowForwardTrainingCopy(phase: DailyPhase): boolean {
  return isForwardAdvicePhase(phase);
}

function adaptationTrendArrow(trend: AdaptationData['adaptationTrend']): string {
  if (trend === 'IMPROVING') {
    return '↑';
  }
  if (trend === 'DECLINING') {
    return '↓';
  }
  return '→';
}

function adaptationTrendClass(trend: AdaptationData['adaptationTrend']): string {
  if (trend === 'IMPROVING') {
    return 'text-primary';
  }
  if (trend === 'DECLINING') {
    return 'text-signal-caution';
  }
  return 'text-muted-foreground';
}

export function buildProgressionSummary(
  adaptation: Pick<
    AdaptationData,
    'adaptationIndex' | 'adaptationStatus' | 'adaptationTrend'
  > | null,
  weeklyLoad: number,
): {
  headline: string;
  detail: string | null;
  trendArrow: string;
  trendClass: string;
} {
  if (!adaptation || adaptation.adaptationStatus === 'INSUFFICIENT_DATA') {
    return {
      headline: 'Historique en cours de construction',
      detail: weeklyLoad > 0 ? `${weeklyLoad} TSS cette semaine` : null,
      trendArrow: '→',
      trendClass: 'text-muted-foreground',
    };
  }

  const status = ADAPTATION_STATUS_SIGNAL[adaptation.adaptationStatus];
  const trendArrow = adaptationTrendArrow(adaptation.adaptationTrend);
  const trendClass = adaptationTrendClass(adaptation.adaptationTrend);

  const headline = status?.label ?? adaptation.adaptationStatus;
  const index = isSet(adaptation.adaptationIndex) ? ` · indice ${adaptation.adaptationIndex}` : '';
  const load = weeklyLoad > 0 ? `${weeklyLoad} TSS cette semaine` : null;

  return {
    headline: `Adaptation · ${headline}${index}`,
    detail: load,
    trendArrow,
    trendClass,
  };
}

export function verdictHeadline(verdict: OverallVerdict, adviceActionable: boolean): string {
  if (!adviceActionable) {
    return 'Pas encore de verdict fiable';
  }
  return mapVerdictToDisplay(verdict).label;
}

export function canTrainHardAnswer(verdict: OverallVerdict, adviceActionable: boolean): string {
  if (!adviceActionable) {
    return 'SharpIt n’a pas encore assez de signaux pour répondre.';
  }
  switch (verdict) {
    case 'TRAIN_HARD':
    case 'RACE_READY':
      return 'Oui — ta physiologie supporte une séance exigeante.';
    case 'TRAIN_SMART':
      return 'Oui — avec une séance ciblée et maîtrisée.';
    case 'TRAIN_EASY':
      return 'Légèrement — reste en endurance ou technique.';
    case 'CAUTION':
      return 'Avec prudence — réduis l’intensité prévue.';
    case 'RECOVER':
      return 'Non — la récupération est prioritaire aujourd’hui.';
    default:
      return 'Réponse indisponible pour l’instant.';
  }
}
