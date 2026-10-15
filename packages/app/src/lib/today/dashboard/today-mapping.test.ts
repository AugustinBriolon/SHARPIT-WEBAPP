import { describe, it, expect } from 'vitest';
import {
  mapVerdictToDisplay,
  mapConfidenceToTier,
  resolveVisibleConfidenceLabel,
  mapRecoveryToSignal,
  mapFatigueTrajectoryToArrow,
  mapFatigueToSignal,
  mapAdaptationToSignal,
  mapAdaptationDecisionToObjective,
  mapDeviationRisk,
  mapConsistencyToDisplay,
  mapConsistencyToAthleteDisplay,
  mapRecoveryProjection,
  mapFatigueProjection,
  mapAdaptationProjection,
  mapRecoveryIntensityLabel,
  mapFatigueCapacityLabel,
  mapScoreToColorClass,
  mapScoreToBarColorClass,
  mapStripScoreToColorClass,
  mapStripStrainToColorClass,
  mapFatigueDimensionIntensity,
} from './today-mapping';

// ─────────────────────────────────────────────────────────────────────────────
// mapVerdictToDisplay
// ─────────────────────────────────────────────────────────────────────────────

describe('mapVerdictToDisplay', () => {
  it('returns correct label for TRAIN_HARD', () => {
    expect(mapVerdictToDisplay('TRAIN_HARD').label).toBe('Intense');
  });

  it('returns correct label for RECOVER', () => {
    expect(mapVerdictToDisplay('RECOVER').label).toBe('Repos');
  });

  it('RECOVER uses protective primary, not punitive red', () => {
    const d = mapVerdictToDisplay('RECOVER');
    expect(d.colorClass).toBe('text-primary');
    expect(d.bgClass).toContain('primary');
    expect(d.dotClass).toBe('bg-primary');
    expect(d.colorClass).not.toContain('red');
  });

  it('RACE_READY uses Pic tag', () => {
    expect(mapVerdictToDisplay('RACE_READY').label).toBe('Pic');
  });

  it('TRAIN_HARD and RACE_READY share primary colour', () => {
    const h = mapVerdictToDisplay('TRAIN_HARD');
    const r = mapVerdictToDisplay('RACE_READY');
    expect(h.colorClass).toBe(r.colorClass);
  });

  it('INSUFFICIENT_DATA uses muted colours', () => {
    const d = mapVerdictToDisplay('INSUFFICIENT_DATA');
    expect(d.colorClass).toContain('muted');
  });

  it('TRAIN_EASY uses olive-lime tempo, not brown caution', () => {
    const d = mapVerdictToDisplay('TRAIN_EASY');
    expect(d.colorClass).toContain('signal-tempo');
    expect(d.bgClass).toContain('signal-tempo');
    expect(d.colorClass).not.toContain('caution');
  });

  it('returns a display for every verdict variant', () => {
    const verdicts = [
      'TRAIN_HARD',
      'TRAIN_SMART',
      'TRAIN_EASY',
      'RECOVER',
      'RACE_READY',
      'CAUTION',
      'INSUFFICIENT_DATA',
    ] as const;
    for (const v of verdicts) {
      expect(mapVerdictToDisplay(v).label).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapConfidenceToTier
// ─────────────────────────────────────────────────────────────────────────────

describe('mapConfidenceToTier', () => {
  it('returns high for 0.7', () => expect(mapConfidenceToTier(0.7)).toBe('high'));
  it('returns high for 1.0', () => expect(mapConfidenceToTier(1.0)).toBe('high'));
  it('returns medium for 0.4', () => expect(mapConfidenceToTier(0.4)).toBe('medium'));
  it('returns medium for 0.69', () => expect(mapConfidenceToTier(0.69)).toBe('medium'));
  it('returns low for 0.39', () => expect(mapConfidenceToTier(0.39)).toBe('low'));
  it('returns low for 0.0', () => expect(mapConfidenceToTier(0.0)).toBe('low'));
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveVisibleConfidenceLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveVisibleConfidenceLabel', () => {
  it('hides the label at high confidence when advice is actionable', () => {
    expect(resolveVisibleConfidenceLabel('Estimation fiable', 'high', true)).toBeNull();
  });

  it('shows the label at medium confidence', () => {
    expect(resolveVisibleConfidenceLabel('Estimation modérée', 'medium', true)).toBe(
      'Estimation modérée',
    );
  });

  it('shows the label at low confidence', () => {
    expect(resolveVisibleConfidenceLabel('Estimation partielle', 'low', true)).toBe(
      'Estimation partielle',
    );
  });

  it('shows the label at high confidence when advice is not actionable (incomplete data)', () => {
    expect(resolveVisibleConfidenceLabel('Estimation fiable', 'high', false)).toBe(
      'Estimation fiable',
    );
  });

  it('shows the label when there is no tier (unknown confidence is not "high")', () => {
    expect(resolveVisibleConfidenceLabel('Estimation fiable', null, true)).toBe(
      'Estimation fiable',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapRecoveryToSignal
// ─────────────────────────────────────────────────────────────────────────────

describe('mapRecoveryToSignal', () => {
  it('OPTIMAL → isAvailable=true, arrowDirection=up', () => {
    const s = mapRecoveryToSignal('OPTIMAL');
    expect(s.isAvailable).toBe(true);
    expect(s.arrowDirection).toBe('up');
  });

  it('ADEQUATE → neutral arrow', () => {
    expect(mapRecoveryToSignal('ADEQUATE').arrowDirection).toBe('neutral');
  });

  it('VERY_LOW → arrowDirection=down', () => {
    expect(mapRecoveryToSignal('VERY_LOW').arrowDirection).toBe('down');
  });

  it('BASELINE_PENDING → isAvailable=false', () => {
    expect(mapRecoveryToSignal('BASELINE_PENDING').isAvailable).toBe(false);
  });

  it('INSUFFICIENT_DATA → isAvailable=false', () => {
    expect(mapRecoveryToSignal('INSUFFICIENT_DATA').isAvailable).toBe(false);
  });

  it('returns a signal for every ReadinessCategory', () => {
    const categories = [
      'OPTIMAL',
      'ADEQUATE',
      'REDUCED',
      'LOW',
      'VERY_LOW',
      'BASELINE_PENDING',
      'INSUFFICIENT_DATA',
    ] as const;
    for (const c of categories) {
      expect(mapRecoveryToSignal(c).label).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapFatigueTrajectoryToArrow
// ─────────────────────────────────────────────────────────────────────────────

describe('mapFatigueTrajectoryToArrow', () => {
  it('RESOLVING → direction=down', () => {
    expect(mapFatigueTrajectoryToArrow('RESOLVING').direction).toBe('down');
  });

  it('STABLE → direction=neutral', () => {
    expect(mapFatigueTrajectoryToArrow('STABLE').direction).toBe('neutral');
  });

  it('ACCUMULATING → direction=up', () => {
    expect(mapFatigueTrajectoryToArrow('ACCUMULATING').direction).toBe('up');
  });

  it('ACCELERATING → direction=up, double arrow', () => {
    const r = mapFatigueTrajectoryToArrow('ACCELERATING');
    expect(r.direction).toBe('up');
    expect(r.arrow).toBe('↑↑');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapFatigueToSignal
// ─────────────────────────────────────────────────────────────────────────────

describe('mapFatigueToSignal', () => {
  it('FRESH → isAvailable=true, primary colour', () => {
    const s = mapFatigueToSignal('FRESH', 'STABLE');
    expect(s.isAvailable).toBe(true);
    expect(s.qualityClass).toContain('primary');
  });

  it('OVERREACHING_RISK → label=Critique', () => {
    expect(mapFatigueToSignal('OVERREACHING_RISK', 'ACCELERATING').label).toBe('Critique');
  });

  it('INSUFFICIENT_DATA → isAvailable=false regardless of trajectory', () => {
    expect(mapFatigueToSignal('INSUFFICIENT_DATA', 'STABLE').isAvailable).toBe(false);
  });

  it('trajectory arrow propagates into signal', () => {
    const s = mapFatigueToSignal('FRESH', 'ACCUMULATING');
    expect(s.arrowDirection).toBe('up');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapAdaptationToSignal
// ─────────────────────────────────────────────────────────────────────────────

describe('mapAdaptationToSignal', () => {
  it('POSITIVELY_ADAPTING → label=Progression, primary', () => {
    const s = mapAdaptationToSignal('POSITIVELY_ADAPTING', 'IMPROVING');
    expect(s.label).toBe('Progression');
    expect(s.qualityClass).toContain('primary');
  });

  it('DETRAINING → label=Désentraînement, risk', () => {
    const s = mapAdaptationToSignal('DETRAINING', 'DECLINING');
    expect(s.label).toBe('Désentraînement');
    expect(s.qualityClass).toContain('signal-risk');
  });

  it('INSUFFICIENT_DATA → isAvailable=false', () => {
    expect(mapAdaptationToSignal('INSUFFICIENT_DATA', 'STABLE').isAvailable).toBe(false);
  });

  it('trend arrow propagates into signal', () => {
    const s = mapAdaptationToSignal('MAINTAINING', 'DECLINING');
    expect(s.arrowDirection).toBe('down');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapAdaptationDecisionToObjective
// ─────────────────────────────────────────────────────────────────────────────

describe('mapAdaptationDecisionToObjective', () => {
  it('INCREASE_LOAD → Développer ta condition', () => {
    expect(mapAdaptationDecisionToObjective('INCREASE_LOAD')).toBe('Développer ta condition');
  });

  it('SUSTAIN → Maintenir les acquis', () => {
    expect(mapAdaptationDecisionToObjective('SUSTAIN')).toBe('Maintenir les acquis');
  });

  it('CONSOLIDATE → Consolider les adaptations', () => {
    expect(mapAdaptationDecisionToObjective('CONSOLIDATE')).toBe('Consolider les adaptations');
  });

  it("REDUCE_LOAD → Absorber le stress d'entraînement", () => {
    expect(mapAdaptationDecisionToObjective('REDUCE_LOAD')).toBe(
      "Absorber le stress d'entraînement",
    );
  });

  it('RECOVERY_PRIORITY → Récupération active', () => {
    expect(mapAdaptationDecisionToObjective('RECOVERY_PRIORITY')).toBe('Récupération active');
  });

  it('INSUFFICIENT_DATA → null', () => {
    expect(mapAdaptationDecisionToObjective('INSUFFICIENT_DATA')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapDeviationRisk
// ─────────────────────────────────────────────────────────────────────────────

describe('mapDeviationRisk', () => {
  it('LOW risk + stable trajectory → safe', () => {
    const result = mapDeviationRisk('LOW', 'LOW', 'STABLE');
    expect(result.level).toBe('safe');
    expect(result.message).toBe('');
  });

  it('MODERATE risk + accumulating fatigue → caution', () => {
    const result = mapDeviationRisk('MODERATE', 'LOW', 'ACCUMULATING');
    expect(result.level).toBe('caution');
  });

  it('HIGH risk + stable trajectory → caution', () => {
    const result = mapDeviationRisk('HIGH', 'LOW', 'STABLE');
    expect(result.level).toBe('caution');
  });

  it('HIGH risk + accumulating trajectory → warning', () => {
    const result = mapDeviationRisk('HIGH', 'LOW', 'ACCUMULATING');
    expect(result.level).toBe('warning');
  });

  it('CRITICAL risk → warning regardless of trajectory', () => {
    const result = mapDeviationRisk('CRITICAL', 'LOW', 'RESOLVING');
    expect(result.level).toBe('warning');
  });

  it('functional overreaching risk drives result when higher', () => {
    const result = mapDeviationRisk('LOW', 'CRITICAL', 'STABLE');
    expect(result.level).toBe('warning');
  });

  it('warning message is non-empty', () => {
    const result = mapDeviationRisk('CRITICAL', 'CRITICAL', 'ACCELERATING');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapConsistencyToDisplay
// ─────────────────────────────────────────────────────────────────────────────

describe('mapConsistencyToDisplay', () => {
  it('ALIGNED includes score in label', () => {
    const result = mapConsistencyToDisplay('ALIGNED', 91);
    expect(result.label).toContain('91');
    expect(result.colorClass).toContain('primary');
  });

  it('PARTIALLY_ALIGNED includes score in label with caution colour', () => {
    const result = mapConsistencyToDisplay('PARTIALLY_ALIGNED', 65);
    expect(result.label).toContain('65');
    expect(result.colorClass).toContain('signal-caution');
  });

  it('CONFLICTING uses elevated colour', () => {
    const result = mapConsistencyToDisplay('CONFLICTING', 40);
    expect(result.colorClass).toContain('signal-vo2');
  });

  it('mapConsistencyToAthleteDisplay hides raw conflict and shows verdict', () => {
    const result = mapConsistencyToAthleteDisplay('CONFLICTING', 33, 'TRAIN_EASY', 'RECOVERY');
    expect(result.label).toBe('Décision : Léger');
    expect(result.detail).toContain('récupération');
    expect(result.label).not.toContain('conflit');
  });

  it('INSUFFICIENT_DATA returns muted colour and no score', () => {
    const result = mapConsistencyToDisplay('INSUFFICIENT_DATA', 0);
    expect(result.colorClass).toBe('text-muted-foreground');
    expect(result.label).not.toContain('0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapRecoveryProjection
// ─────────────────────────────────────────────────────────────────────────────

describe('mapRecoveryProjection', () => {
  it('OVERREACHED → rest message with day count', () => {
    const result = mapRecoveryProjection('OVERREACHED', 'CRITICAL');
    expect(result).toContain('2 à 3 jours');
  });

  it('FATIGUED → active recovery message', () => {
    const result = mapRecoveryProjection('FATIGUED', 'MODERATE');
    expect(result).toContain('accélère');
  });

  it('PARTIALLY_RECOVERED + HIGH risk → manage load message', () => {
    const result = mapRecoveryProjection('PARTIALLY_RECOVERED', 'HIGH');
    expect(result).toContain('maîtrisée');
  });

  it('PARTIALLY_RECOVERED + LOW risk → 24–48h recovery message', () => {
    const result = mapRecoveryProjection('PARTIALLY_RECOVERED', 'LOW');
    expect(result).toContain('24 à 48');
  });

  it('RECOVERED + LOW risk → hold message', () => {
    const result = mapRecoveryProjection('RECOVERED', 'LOW');
    expect(result).toContain('maintenir');
  });

  it('RECOVERED + MODERATE risk → manage intensity message', () => {
    const result = mapRecoveryProjection('RECOVERED', 'MODERATE');
    expect(result).toContain('intensité');
  });

  it('INSUFFICIENT_DATA → empty string', () => {
    expect(mapRecoveryProjection('INSUFFICIENT_DATA', 'LOW')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapFatigueProjection
// ─────────────────────────────────────────────────────────────────────────────

describe('mapFatigueProjection', () => {
  it('REST_WEEK → rest message', () => {
    const result = mapFatigueProjection('REST_WEEK', 'STABLE', 'FULL');
    expect(result).toContain('dissiper');
  });

  it('TAPER → rest message', () => {
    const result = mapFatigueProjection('TAPER', 'RESOLVING', 'REDUCED');
    expect(result).toContain('dissiper');
  });

  it('REDUCE + ACCELERATING → non-functional overreaching warning', () => {
    const result = mapFatigueProjection('REDUCE', 'ACCELERATING', 'REDUCED');
    expect(result).toContain('surmenage');
  });

  it('REDUCE + ACCUMULATING → compounding message', () => {
    const result = mapFatigueProjection('REDUCE', 'ACCUMULATING', 'REDUCED');
    expect(result).toContain("s'aggrave");
  });

  it('MAINTAIN → functional range message', () => {
    const result = mapFatigueProjection('MAINTAIN', 'STABLE', 'FULL');
    expect(result).toContain('fonctionnelle');
  });

  it('BUILD + RESOLVING → maximises adaptation message', () => {
    const result = mapFatigueProjection('BUILD', 'RESOLVING', 'FULL');
    expect(result).toContain('adaptation');
  });

  it('BUILD + STABLE + FULL → full capacity message', () => {
    const result = mapFatigueProjection('BUILD', 'STABLE', 'FULL');
    expect(result).toContain('bonne capacité');
  });

  it('INSUFFICIENT_DATA → empty string', () => {
    expect(mapFatigueProjection('INSUFFICIENT_DATA', 'STABLE', 'FULL')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapAdaptationProjection
// ─────────────────────────────────────────────────────────────────────────────

describe('mapAdaptationProjection', () => {
  it('RECOVERY_PRIORITY → protect fitness base message', () => {
    const result = mapAdaptationProjection('RECOVERY_PRIORITY', 1.0);
    expect(result).toContain('forme');
  });

  it('REDUCE_LOAD → adaptations take root message', () => {
    const result = mapAdaptationProjection('REDUCE_LOAD', 0.8);
    expect(result).toContain("s'ancrer");
  });

  it('CONSOLIDATE → consolidates message', () => {
    const result = mapAdaptationProjection('CONSOLIDATE', 1.0);
    expect(result).toContain('consolide');
  });

  it('SUSTAIN → sustains gains message', () => {
    const result = mapAdaptationProjection('SUSTAIN', 1.0);
    expect(result).toContain('maintient');
  });

  it('INCREASE_LOAD + multiplier > 1.1 → 10–14 days message', () => {
    const result = mapAdaptationProjection('INCREASE_LOAD', 1.2);
    expect(result).toContain('10 à 14 jours');
  });

  it('INCREASE_LOAD + multiplier ≤ 1.1 → compound message', () => {
    const result = mapAdaptationProjection('INCREASE_LOAD', 1.05);
    expect(result).toContain('cumulera');
  });

  it('INSUFFICIENT_DATA → empty string', () => {
    expect(mapAdaptationProjection('INSUFFICIENT_DATA', 1.0)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapRecoveryIntensityLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('mapRecoveryIntensityLabel', () => {
  it('REST → Repos complet', () => expect(mapRecoveryIntensityLabel('REST')).toBe('Repos complet'));
  it('VERY_EASY → Mouvement très léger', () =>
    expect(mapRecoveryIntensityLabel('VERY_EASY')).toBe('Mouvement très léger'));
  it('EASY → Effort facile', () => expect(mapRecoveryIntensityLabel('EASY')).toBe('Effort facile'));
  it('MODERATE → Effort modéré', () =>
    expect(mapRecoveryIntensityLabel('MODERATE')).toBe('Effort modéré'));
  it('HARD → Haute intensité', () =>
    expect(mapRecoveryIntensityLabel('HARD')).toBe('Haute intensité'));
});

// ─────────────────────────────────────────────────────────────────────────────
// mapFatigueCapacityLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('mapFatigueCapacityLabel', () => {
  it('FULL → Capacité totale', () =>
    expect(mapFatigueCapacityLabel('FULL')).toBe('Capacité totale'));
  it('REDUCED → Capacité réduite', () =>
    expect(mapFatigueCapacityLabel('REDUCED')).toBe('Capacité réduite'));
  it('LIGHT_ONLY → Activité légère uniquement', () =>
    expect(mapFatigueCapacityLabel('LIGHT_ONLY')).toBe('Activité légère uniquement'));
  it('REST_ONLY → Repos uniquement', () =>
    expect(mapFatigueCapacityLabel('REST_ONLY')).toBe('Repos uniquement'));
});

// ─────────────────────────────────────────────────────────────────────────────
// mapScoreToColorClass
// ─────────────────────────────────────────────────────────────────────────────

describe('mapScoreToColorClass', () => {
  it('null → muted', () => expect(mapScoreToColorClass(null)).toBe('text-muted-foreground'));
  it('85 → foreground (in range)', () => expect(mapScoreToColorClass(85)).toBe('text-foreground'));
  it('65 → foreground (in range)', () => expect(mapScoreToColorClass(65)).toBe('text-foreground'));
  it('45 → caution', () => expect(mapScoreToColorClass(45)).toBe('text-signal-caution'));
  it('20 → risk', () => expect(mapScoreToColorClass(20)).toBe('text-signal-risk'));
  it('60 boundary → foreground', () => expect(mapScoreToColorClass(60)).toBe('text-foreground'));
  it('40 boundary → caution', () => expect(mapScoreToColorClass(40)).toBe('text-signal-caution'));
});

describe('mapStripScoreToColorClass', () => {
  it('null → muted', () => expect(mapStripScoreToColorClass(null)).toBe('text-muted-foreground'));
  it('75 → capacity primary', () => expect(mapStripScoreToColorClass(75)).toContain('primary'));
  it('55 → stable foreground', () => expect(mapStripScoreToColorClass(55)).toBe('text-foreground'));
  it('40 → caution', () => expect(mapStripScoreToColorClass(40)).toBe('text-signal-caution'));
  it('25 → soft elevated', () => expect(mapStripScoreToColorClass(25)).toContain('signal-vo2'));
  it('10 → risk', () => expect(mapStripScoreToColorClass(10)).toBe('text-signal-risk'));
});

describe('mapStripStrainToColorClass', () => {
  it('null → muted', () => expect(mapStripStrainToColorClass(null)).toBe('text-muted-foreground'));
  it('any strain → threshold/tempo, never risk red', () => {
    expect(mapStripStrainToColorClass(1.2)).toContain('signal-threshold');
    expect(mapStripStrainToColorClass(3)).not.toContain('risk');
  });
});

describe('mapScoreToBarColorClass', () => {
  it('null → muted bar', () =>
    expect(mapScoreToBarColorClass(null)).toBe('bg-muted-foreground/10'));
  it('85 → primary bar', () => expect(mapScoreToBarColorClass(85)).toContain('bg-primary'));
  it('45 → caution bar', () => expect(mapScoreToBarColorClass(45)).toContain('bg-signal-caution'));
  it('20 → risk bar', () => expect(mapScoreToBarColorClass(20)).toContain('bg-signal-risk'));
});

describe('mapFatigueDimensionIntensity', () => {
  it('0 → Faible', () => expect(mapFatigueDimensionIntensity(0)).toBe('Faible'));
  it('30 → Modérée', () => expect(mapFatigueDimensionIntensity(30)).toBe('Modérée'));
  it('55 → Élevée', () => expect(mapFatigueDimensionIntensity(55)).toBe('Élevée'));
  it('80 → Critique', () => expect(mapFatigueDimensionIntensity(80)).toBe('Critique'));
});
