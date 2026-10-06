import { describe, expect, it } from 'vitest';
import { sensitiveZonesFrom } from '@sharpit/app/lib/physical-health/sensitive-zones';
import { normalizeAthleteEquipment } from '@sharpit/app/lib/equipment/parse';
import { normalizeTrainingAvailability } from '@sharpit/server/lib/training-availability/parse';
import {
  buildPhysicalContext,
  formatConstraintsSection,
  formatDecisionSection,
  formatCoachContext,
  type CoachContext,
} from './coach-context';

function baseConstraint(
  overrides: Partial<CoachContext['constraints'][number]> = {},
): CoachContext['constraints'][number] {
  return {
    label: 'Tendinite genou',
    locationLabel: null,
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    isActiveNow: true,
    note: null,
    trainingConstraint: 'REDUCED',
    allowedDisciplines: [],
    ...overrides,
  };
}

function baseDecision(overrides: Partial<CoachContext['decision']> = {}): CoachContext['decision'] {
  return {
    verdict: 'TRAIN_EASY',
    headline: 'Journée de récupération active',
    topAction: 'Footing léger 30 min',
    rationale: 'Charge élevée hier, récupération encore en cours',
    limitingFactorDomain: 'RECOVERY',
    limitingFactorDescription: 'Récupération autonome incomplète',
    confidence: 0.75,
    confidenceTier: 'MEDIUM',
    attentionDomain: 'RECOVERY',
    physiologicalConsistency: 'ALIGNED',
    consistencyScore: 90,
    criticalEvidence: undefined,
    primaryConflict: null,
    primaryOpportunity: null,
    adviceActionable: true,
    prescriptiveAdviceAllowed: true,
    ...overrides,
  } as CoachContext['decision'];
}

function minimalContext(overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    today: 'lundi 10 août 2026',
    note: null,
    equipment: normalizeAthleteEquipment(null),
    practicedSports: ['run', 'bike', 'swim', 'triathlon'],
    profile: null,
    fitness: { ctl: 50, atl: 40, tsb: 10 },
    load: {
      dailyLoad: 40,
      weeklyLoad: 200,
      acwr: 1.0,
      fatigue: 'Medium',
      loadMonotony: null,
      loadStrain: null,
    },
    availableDays: ['Lundi'],
    trainingAvailability: normalizeTrainingAvailability(null),
    health: {
      readinessToday: 70,
      readinessLevel: null,
      hrvStatus: null,
      bodyBattery: null,
      avgSleepMin: 420,
      avgHrv: null,
      avgRestingHr: null,
      avgReadiness: null,
    },
    primaryRace: null,
    races: [],
    metricGoals: [],
    recent: [],
    realizedSessions: [],
    upcomingPlanned: [
      {
        id: 'ps_abc',
        date: 'mar. 11 août',
        dateIso: '2026-08-11',
        type: 'Course',
        title: 'Tempo',
        intensity: 'TEMPO',
        durationMin: 50,
        startTime: '07:00',
        locationLabel: null,
        brickGroupId: null,
        brickOrder: null,
      },
    ],
    travel: [],
    constraints: [],
    physical: [],
    fatigue: null,
    adaptation: null,
    decision: null,
    environment: {
      homeLabel: 'Sens',
      thermalLabel: 'Chaleur marquée',
      summaryLine: null,
      detailLine: null,
      trainingImpact: 'MODERATE',
      airTemperatureC: 28,
      relativeHumidityPct: 55,
      recoveryDemandAdjustment: 0.05,
      performanceAdjustment: -0.03,
    },
    scenarioComparison: null,
    activityStatus: {
      status: 'active',
      label: 'Actif',
      planningImpact: 'Charge et séances suivent le plan.',
      retentionSummary: null,
    },
    ...overrides,
  } as CoachContext;
}

describe('formatDecisionSection', () => {
  it('returns nothing when there is no decision', () => {
    expect(formatDecisionSection(null)).toEqual([]);
  });

  it('surfaces calibrating-only copy when the verdict is INSUFFICIENT_DATA', () => {
    const lines = formatDecisionSection(baseDecision({ verdict: 'INSUFFICIENT_DATA' }));
    const text = lines.join('\n');
    expect(text).toContain('en calibration');
    expect(text).not.toContain('Verdict :');
  });

  it('surfaces calibrating when confidence tier is LOW', () => {
    const lines = formatDecisionSection(baseDecision({ confidenceTier: 'LOW' }));
    expect(lines.join('\n')).toContain('en calibration');
  });

  it('exposes the verdict and prescribes an action when prescriptiveAdviceAllowed is true', () => {
    const lines = formatDecisionSection(baseDecision());
    const text = lines.join('\n');
    expect(text).toContain('Verdict :');
    expect(text).toContain('Action prioritaire :');
    expect(text).not.toContain('Hors fenêtre de conseil actionnable');
    expect(text).not.toContain('en calibration');
  });

  it('withholds the verdict and refuses to prescribe when prescriptiveAdviceAllowed is false (F11)', () => {
    const lines = formatDecisionSection(baseDecision({ prescriptiveAdviceAllowed: false }));
    const text = lines.join('\n');
    expect(text).not.toContain('Verdict :');
    expect(text).not.toContain('Action prioritaire :');
    expect(text).not.toContain('Journée de récupération active');
    expect(text).not.toContain('Footing léger 30 min');
    expect(text).toContain('NE PRESCRIS AUCUNE action');
  });

  it('still surfaces factual observations (limiting factor) even when prescriptiveAdviceAllowed is false', () => {
    const lines = formatDecisionSection(baseDecision({ prescriptiveAdviceAllowed: false }));
    const text = lines.join('\n');
    expect(text).toContain('Facteur limitant');
    expect(text).toContain('Récupération autonome incomplète');
  });
});

describe('formatConstraintsSection', () => {
  it('returns nothing when there are no active/upcoming constraints', () => {
    expect(formatConstraintsSection([])).toEqual([]);
  });

  it('renders active constraints', () => {
    const text = formatConstraintsSection([baseConstraint()]).join('\n');
    expect(text).toContain('Tendinite genou');
  });
});

describe('formatCoachContext activity status', () => {
  it('omits the section when the athlete is active', () => {
    const text = formatCoachContext(minimalContext());
    expect(text).not.toContain('Statut d’activité');
  });

  it('surfaces an imperative block when the athlete is sick', () => {
    const text = formatCoachContext(
      minimalContext({
        activityStatus: {
          status: 'sick',
          label: 'Malade',
          planningImpact: 'Repos avant la charge — reprendre seulement quand le corps suit.',
          retentionSummary: 'jusqu’au 2026-10-10',
        },
      }),
    );
    expect(text).toContain('Statut d’activité (impératif)');
    expect(text).toContain('Malade (sick)');
    expect(text).toContain('Respecte ABSOLUMENT ce statut');
    expect(text).toContain('jusqu’au 2026-10-10');
  });
});

describe('formatCoachContext availability', () => {
  // Intent and reality are different facts: a plan built on four wanted days
  // when three actually happen is a plan that will slip.
  it('labels declared rhythm apart from observed days', () => {
    const text = formatCoachContext(
      minimalContext({
        availableDays: ['Lundi', 'Mercredi'],
        trainingAvailability: {
          version: 1,
          targetSessionsPerWeek: 4,
          availableWeekdays: [2, 4, 6],
        },
      }),
    );

    expect(text).toContain('Souhaité : 4 séances par semaine.');
    expect(text).toContain('Jours déclarés libres : Mardi, Jeudi, Samedi.');
    expect(text).toContain('Jours observés (8 dernières semaines) : Lundi, Mercredi.');
  });

  it('still reads the observed days when nothing was declared', () => {
    const text = formatCoachContext(
      minimalContext({
        availableDays: ['Samedi'],
        trainingAvailability: normalizeTrainingAvailability(null),
      }),
    );

    expect(text).toContain('Jours observés (8 dernières semaines) : Samedi.');
    expect(text).not.toContain('Souhaité :');
  });

  it('drops the section when neither source has anything', () => {
    const text = formatCoachContext(
      minimalContext({
        availableDays: [],
        trainingAvailability: normalizeTrainingAvailability(null),
      }),
    );

    expect(text).not.toContain('## Disponibilités');
  });
});

describe('formatCoachContext relevance contract', () => {
  it('keeps day load and training status distinct in the PMC block', () => {
    const text = formatCoachContext(minimalContext());
    expect(text).toContain('État de forme (PMC)');
    expect(text).toContain('charge du jour = coût physiologique');
    expect(text).toContain('n’est pas un statut de surentraînement');
  });

  it('includes practiced sports allowlist for twin-informed proposals', () => {
    const text = formatCoachContext(minimalContext({ practicedSports: ['run'] }));
    expect(text).toContain('## Sports pratiqués');
    expect(text).toContain('IMPÉRATIF');
    expect(text).toContain('Course');
    expect(text).toContain('historique');
  });

  it('includes planned session ids for update without listPlannedSessions', () => {
    const text = formatCoachContext(minimalContext());
    expect(text).toContain('id=ps_abc');
    expect(text).toContain('2026-08-11');
  });

  it('includes home environment temperature for outdoor session adaptation', () => {
    const text = formatCoachContext(minimalContext());
    expect(text).toContain('Environnement du jour');
    expect(text).toContain('Sens');
    expect(text).toContain('28 °C');
    expect(text).toContain('Chaleur marquée');
  });

  it('does not require scenario comparison on every message', () => {
    const text = formatCoachContext(minimalContext({ scenarioComparison: null }));
    expect(text).not.toContain('Comparaison de scénarios');
  });

  it('includes scenario comparison when present (plan/adapt path)', () => {
    const text = formatCoachContext(
      minimalContext({
        scenarioComparison:
          '## Comparaison de scénarios (Scenario Engine — orchestration)\nRecommandation : KEEP',
      }),
    );
    expect(text).toContain('Comparaison de scénarios');
  });
});

describe('formatCoachContext travel contract', () => {
  const joigny: CoachContext['travel'][number] = {
    label: 'Week-end Joigny',
    locationLabel: 'Joigny',
    startDate: '2026-09-19',
    endDate: '2026-09-20',
    isActiveNow: true,
    note: null,
    trainingConstraint: 'FULL',
    allowedDisciplines: ['RUN', 'MOBILITY'],
  };

  it('lists the declared sports and makes them a strict constraint', () => {
    const text = formatCoachContext(minimalContext({ travel: [joigny] }));

    expect(text).toContain('sports : Course, Mobilité / étirements');
    expect(text).toContain('contrainte STRICTE');
  });

  it('tells the coach declared travel already exists so it is not recreated', () => {
    const text = formatCoachContext(minimalContext({ travel: [joigny] }));

    expect(text).toContain('DÉJÀ enregistrés');
  });

  it('adds no travel rules when nothing is declared', () => {
    const text = formatCoachContext(minimalContext({ travel: [] }));

    expect(text).not.toContain('contrainte STRICTE');
  });
});

describe('physical context', () => {
  it('keeps the raw kind, so a declared pain becomes a sensitive zone', () => {
    const physical = buildPhysicalContext(
      { physicalHealth: null } as never,
      [
        {
          category: 'PAIN',
          status: 'ACTIVE',
          title: 'Douleur genou droit',
          bodyPart: 'Genou',
          side: 'RIGHT',
          severity: 5,
          description: null,
          checkins: [],
        },
      ] as never,
    );

    expect(physical[0]).toMatchObject({ type: 'PAIN', category: 'Douleur' });
    const [zone] = sensitiveZonesFrom(physical);
    expect(zone?.region).toBe('Genou');
    expect(zone?.groups).toEqual(['upper legs', 'lower legs']);
  });
});

describe('physical context — the declaration wins (ADR-068)', () => {
  const posture = {
    category: 'POSTURE',
    status: 'ACTIVE',
    title: 'Épaules enroulées',
    bodyPart: 'Épaule',
    side: 'BILATERAL',
    severity: 5,
    functionalImpact: null,
    description: null,
    affectsTraining: true,
    resolvedAt: null,
    checkins: [],
  };
  const inferred = {
    physicalHealth: {
      conditions: [
        {
          type: 'PAIN',
          label: 'Ancienne douleur',
          bodyRegion: 'Genou',
          side: 'NA',
          status: 'STABLE',
          affectsTraining: true,
          severity: 2,
          trend: 'STABLE',
          functionalCapacity: 'FULL',
          confidence: 0.6,
        },
      ],
    },
  };

  it('reads declared zones before the inferred conditions, with what the plan does', () => {
    const physical = buildPhysicalContext(inferred as never, [posture] as never);
    expect(physical).toEqual([
      expect.objectContaining({ title: 'Épaules enroulées', strategy: 'À corriger' }),
    ]);
  });

  it('falls back to the inferred conditions when nothing open is declared', () => {
    const resolved = { ...posture, status: 'RESOLVED' };
    const physical = buildPhysicalContext(inferred as never, [resolved] as never);
    expect(physical.map((entry) => entry.title)).toEqual(['Ancienne douleur']);
  });
});

describe('formatCoachContext bricks', () => {
  const leg = (id: string, type: string, brickOrder: number) => ({
    id,
    date: 'jeu. 1 oct.',
    dateIso: '2026-10-01',
    type,
    title: `${type} enchaîné`,
    intensity: 'TEMPO' as const,
    durationMin: 40,
    startTime: '12:00',
    locationLabel: null,
    brickGroupId: 'group-1',
    brickOrder,
  });

  it('marks the legs of a brick as one session and says how to move it', () => {
    const context = {
      ...minimalContext(),
      upcomingPlanned: [leg('ps_bike', 'Vélo', 0), leg('ps_run', 'Course', 1)],
    };
    const text = formatCoachContext(context);

    expect(text).toContain(
      'id=ps_bike · 2026-10-01 (jeu. 1 oct.) · Vélo Vélo enchaîné (brick B1 · jambe 1/2)',
    );
    expect(text).toContain(
      'id=ps_run · 2026-10-01 (jeu. 1 oct.) · Course Course enchaîné (brick B1 · jambe 2/2)',
    );
    expect(text).toContain(
      'pour le déplacer, change la date d’une jambe avec updatePlannedSession',
    );
  });

  it('adds nothing about bricks when there is none', () => {
    expect(formatCoachContext(minimalContext())).not.toContain('brick B1');
    expect(formatCoachContext(minimalContext())).not.toContain('Les jambes d’un même brick');
  });
});
