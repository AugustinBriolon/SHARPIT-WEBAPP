import { describe, expect, it } from 'vitest';
import { buildDailyPhaseDayContext } from '@sharpit/app/lib/daily-phase/day-context';
import {
  assertPhaseNarrativeConsistency,
  buildPhaseNarrative,
  pickAdaptationReminders,
  VERDICT_STATUS_TAG,
} from '@sharpit/app/lib/daily-phase/narrative';
import { resolveDailyPhase } from '@sharpit/app/lib/daily-phase/resolve';
import type {
  DailyPhaseAthleteSignals,
  DailyPhaseInput,
  DailyPhase,
} from '@sharpit/app/lib/daily-phase/types';
import { DAILY_PHASE_PRIMARY_QUESTION } from '@sharpit/app/lib/daily-phase/types';
import type { OverallVerdict } from '@sharpit/app/lib/today/dashboard/today-mapping';

function minutesSinceLastActivityForPhase(phase: DailyPhase): number | null {
  if (phase === 'SESSION_COMPLETED') {
    return 30;
  }
  if (phase === 'RECOVERY_WINDOW') {
    return 120;
  }
  return null;
}

function testActivitiesForPhase(phase: DailyPhase) {
  if (phase === 'MORNING' || phase === 'BEFORE_SESSION') {
    return [];
  }
  return [
    {
      id: 'a1',
      type: 'RUN',
      date: new Date('2026-07-07T08:00:00'),
      load: 65,
      duration: 3600,
      title: 'Sortie',
    } as never,
  ];
}

function testPlannedForPhase(phase: DailyPhase, ref: Date) {
  if (phase !== 'BEFORE_SESSION') {
    return [];
  }
  return [
    {
      id: 'p1',
      type: 'BIKE',
      date: ref,
      startTime: '18:00',
      completed: false,
      activityId: null,
    } as never,
  ];
}

function narrativeForPhase(
  phase: ReturnType<typeof resolveDailyPhase>['phase'],
  overrides: Partial<DailyPhaseAthleteSignals> & {
    sportLabel?: string | null;
    totalTss?: number | null;
  } = {},
) {
  const ref = new Date('2026-07-07T10:00:00');
  const activities = testActivitiesForPhase(phase);
  const planned = testPlannedForPhase(phase, ref);

  const dayContext = buildDailyPhaseDayContext(ref, activities, planned);
  const athlete: DailyPhaseAthleteSignals = {
    recommendationAvailable: true,
    adviceActionable: true,
    dailyStrainAvailable: phase === 'RECOVERY_WINDOW' || phase === 'SESSION_COMPLETED',
    newSessionSincePriorSnapshot: phase === 'SESSION_COMPLETED',
    newInferenceSincePriorSnapshot: false,
    newObservationsSincePriorSnapshot: false,
    minutesSinceLastActivity: minutesSinceLastActivityForPhase(phase),
    minutesSinceSnapshotGenerated: 60,
    priorPhase: phase === 'RECOVERY_WINDOW' ? 'SESSION_COMPLETED' : null,
    sleepLoggedTonight: phase === 'END_OF_DAY',
    ...overrides,
  };

  const input: DailyPhaseInput = {
    dayContext,
    athlete,
    localHour: ref.getHours(),
  };

  const resolution = resolveDailyPhase(input, ref);
  return buildPhaseNarrative({
    resolution: { ...resolution, phase },
    verdict: 'TRAIN_HARD',
    adviceActionable: true,
    actionLine: 'Entraîne-toi — endurance',
    sportLabel: overrides.sportLabel ?? 'Course',
    totalTssToday: overrides.totalTss ?? 65,
    dailyStrainScore: 12,
    dailyStrainAvailable: athlete.dailyStrainAvailable,
  });
}

describe('buildPhaseNarrative', () => {
  it('morning uses matters-today question', () => {
    const n = narrativeForPhase('MORNING');
    expect(n.heroEyebrow).toBe(DAILY_PHASE_PRIMARY_QUESTION.MORNING);
    expect(n.heroHeadline).toContain('effort');
  });

  it('before session uses approach question', () => {
    const ref = new Date('2026-07-07T16:00:00');
    const dayContext = buildDailyPhaseDayContext(
      ref,
      [],
      [
        {
          id: 'p1',
          type: 'BIKE',
          date: ref,
          startTime: '18:00',
          completed: false,
          activityId: null,
        } as never,
      ],
    );
    const resolution = resolveDailyPhase(
      {
        dayContext,
        athlete: {
          recommendationAvailable: true,
          adviceActionable: true,
          dailyStrainAvailable: false,
          newSessionSincePriorSnapshot: false,
          newInferenceSincePriorSnapshot: false,
          newObservationsSincePriorSnapshot: false,
          minutesSinceLastActivity: null,
          minutesSinceSnapshotGenerated: 30,
          priorPhase: null,
          sleepLoggedTonight: false,
        },
        localHour: 16,
      },
      ref,
    );
    const n = buildPhaseNarrative({
      resolution,
      verdict: 'TRAIN_SMART',
      adviceActionable: true,
      actionLine: null,
      sportLabel: 'Vélo',
      totalTssToday: null,
      dailyStrainScore: null,
      dailyStrainAvailable: false,
    });
    expect(n.heroEyebrow).toBe(DAILY_PHASE_PRIMARY_QUESTION.BEFORE_SESSION);
    expect(n.heroHeadline).toContain('Vélo');
  });

  it('session completed debriefs accomplishment not adaptation', () => {
    const n = narrativeForPhase('SESSION_COMPLETED');
    expect(n.heroEyebrow).toBe(DAILY_PHASE_PRIMARY_QUESTION.SESSION_COMPLETED);
    expect(n.heroHeadline).toContain('exigeant');
    expect(n.adaptationReminders).toHaveLength(0);
  });

  it('recovery window focuses on adaptation levers', () => {
    const n = narrativeForPhase('RECOVERY_WINDOW');
    expect(n.heroEyebrow).toBe('Après la séance');
    expect(n.adaptationReminders.length).toBeGreaterThan(0);
    expect(n.focusPriority).toMatch(/Hydrate|sommeil/i);
    expect(n.posture).toBe('steady');
  });

  it('recovery window on a rest day never references a session that never happened', () => {
    const ref = new Date('2026-07-07T14:00:00');
    const dayContext = buildDailyPhaseDayContext(ref, [], []);
    const resolution = resolveDailyPhase(
      {
        dayContext,
        athlete: {
          recommendationAvailable: true,
          adviceActionable: true,
          dailyStrainAvailable: false,
          newSessionSincePriorSnapshot: false,
          newInferenceSincePriorSnapshot: true,
          newObservationsSincePriorSnapshot: false,
          minutesSinceLastActivity: null,
          minutesSinceSnapshotGenerated: 180,
          priorPhase: 'MORNING',
          sleepLoggedTonight: false,
        },
        localHour: 14,
      },
      ref,
    );
    expect(resolution.phase).toBe('RECOVERY_WINDOW');
    expect(resolution.signals.sessionStatus).toBe('NONE_TODAY');

    const n = buildPhaseNarrative({
      resolution,
      verdict: 'TRAIN_EASY',
      adviceActionable: true,
      actionLine: null,
      sportLabel: null,
      totalTssToday: null,
      dailyStrainScore: null,
      dailyStrainAvailable: false,
    });

    expect(n.heroEyebrow).toBe('Jour de repos');
    expect(n.heroHeadline).not.toMatch(/après|séance/i);
    for (const reminder of n.adaptationReminders) {
      expect(reminder).not.toMatch(/dans l’heure qui suit|dans les 2 h/i);
    }
    expect(pickAdaptationReminders('RECOVERY_WINDOW', 3, true)).toEqual(
      n.adaptationReminders.slice(0, 3),
    );
  });

  it('end of day targets tomorrow impact', () => {
    const ref = new Date('2026-07-07T22:30:00');
    const dayContext = buildDailyPhaseDayContext(
      ref,
      [{ id: 'a1', type: 'RUN', date: new Date('2026-07-07T08:00:00'), load: 50 } as never],
      [],
    );
    const resolution = resolveDailyPhase(
      {
        dayContext,
        athlete: {
          recommendationAvailable: true,
          adviceActionable: true,
          dailyStrainAvailable: true,
          newSessionSincePriorSnapshot: false,
          newInferenceSincePriorSnapshot: false,
          newObservationsSincePriorSnapshot: false,
          minutesSinceLastActivity: 500,
          minutesSinceSnapshotGenerated: 120,
          priorPhase: 'RECOVERY_WINDOW',
          sleepLoggedTonight: false,
        },
        localHour: 22,
      },
      ref,
    );
    const n = buildPhaseNarrative({
      resolution,
      verdict: 'RECOVER',
      adviceActionable: true,
      actionLine: null,
      sportLabel: 'Course',
      totalTssToday: 50,
      dailyStrainScore: 10,
      dailyStrainAvailable: true,
      evening: {
        effortLevel: 'moderate',
        totalDurationMin: 50,
        completedSessionCount: 1,
        tomorrowSession: null,
        sleep: {
          recommendedBedtimeMin: 22 * 60,
          recommendedDurationMin: 480,
          debt7Min: null,
          hasSleepHistory: true,
          bedtimeTargetMin: 22 * 60,
        },
      },
    });
    expect(n.heroEyebrow).toBe('Ce soir');
    expect(n.heroHeadline).toMatch(/^Journée (active|exigeante|chargée|engagée)\. /);
    expect(n.posture).toBe('protect');
    expect(n.postureLabel).toBe('');
    expect(n.focusPriority).toMatch(/Coucher vers/);
    expect(n.heroSubline).toBe('');
  });

  it('end of day ignores stale forward action line in input', () => {
    const ref = new Date('2026-07-07T22:30:00');
    const resolution = resolveDailyPhase(
      {
        dayContext: buildDailyPhaseDayContext(
          ref,
          [{ id: 'a1', type: 'BIKE', date: new Date('2026-07-07T12:00:00'), load: 9 } as never],
          [],
        ),
        athlete: {
          recommendationAvailable: true,
          adviceActionable: true,
          dailyStrainAvailable: true,
          newSessionSincePriorSnapshot: false,
          newInferenceSincePriorSnapshot: false,
          newObservationsSincePriorSnapshot: false,
          minutesSinceLastActivity: 600,
          minutesSinceSnapshotGenerated: 120,
          priorPhase: 'RECOVERY_WINDOW',
          sleepLoggedTonight: false,
        },
        localHour: 22,
      },
      ref,
    );
    const n = buildPhaseNarrative({
      resolution,
      verdict: 'TRAIN_HARD',
      adviceActionable: true,
      actionLine: 'Entraîne-toi — sur la base aérobie',
      sportLabel: 'Vélo',
      totalTssToday: 9,
      dailyStrainScore: 4,
      dailyStrainAvailable: true,
      evening: {
        effortLevel: 'light',
        totalDurationMin: 14,
        completedSessionCount: 1,
        tomorrowSession: null,
        sleep: {
          recommendedBedtimeMin: 22 * 60 + 15,
          recommendedDurationMin: 480,
          debt7Min: null,
          hasSleepHistory: false,
          bedtimeTargetMin: null,
        },
      },
    });
    expect(n.focusPriority).toMatch(/Coucher vers/);
    expect(n.heroSubline).toBe('');
  });

  it('end of day uses plain language for limiting factor', () => {
    const ref = new Date('2026-07-07T22:30:00');
    const resolution = resolveDailyPhase(
      {
        dayContext: buildDailyPhaseDayContext(
          ref,
          [{ id: 'a1', type: 'RUN', date: new Date('2026-07-07T08:00:00'), load: 28 } as never],
          [],
        ),
        athlete: {
          recommendationAvailable: true,
          adviceActionable: true,
          dailyStrainAvailable: true,
          newSessionSincePriorSnapshot: false,
          newInferenceSincePriorSnapshot: false,
          newObservationsSincePriorSnapshot: false,
          minutesSinceLastActivity: 600,
          minutesSinceSnapshotGenerated: 120,
          priorPhase: 'RECOVERY_WINDOW',
          sleepLoggedTonight: false,
        },
        localHour: 22,
      },
      ref,
    );
    const n = buildPhaseNarrative({
      resolution,
      verdict: 'TRAIN_EASY',
      adviceActionable: true,
      actionLine: null,
      sportLabel: 'Course',
      totalTssToday: 28,
      dailyStrainScore: 10,
      dailyStrainAvailable: true,
      limitingFactorMessage:
        "Déficit de récupération — facteur limitant : la charge d'entraînement",
      evening: {
        effortLevel: 'light',
        totalDurationMin: 14,
        completedSessionCount: 1,
        tomorrowSession: null,
        sleep: {
          recommendedBedtimeMin: 22 * 60 + 30,
          recommendedDurationMin: 480,
          debt7Min: 120,
          hasSleepHistory: true,
          bedtimeTargetMin: 22 * 60 + 30,
        },
      },
    });
    expect(n.heroHeadline).toBe('Journée engagée. Récupère bien, le corps en demande');
    expect(n.focusPriority).toMatch(/Coucher vers/);
    expect(n.focusPriority).toMatch(/récupérer/);
    expect(n.heroHeadline).not.toMatch(/protéger|Demain :|TSS/i);
  });

  it('never uses forward training question in post-training phases', () => {
    for (const phase of ['SESSION_COMPLETED', 'RECOVERY_WINDOW', 'END_OF_DAY'] as const) {
      const n = narrativeForPhase(phase);
      expect(() => assertPhaseNarrativeConsistency(phase, n.heroEyebrow)).not.toThrow();
      expect(n.heroEyebrow).not.toMatch(/entraîner fort/i);
    }
  });

  it('does not congratulate session before completion', () => {
    const ref = new Date('2026-07-07T09:00:00');
    const dayContext = buildDailyPhaseDayContext(
      ref,
      [],
      [{ id: 'p1', type: 'RUN', date: ref, startTime: '18:00', completed: false } as never],
    );
    const resolution = resolveDailyPhase(
      {
        dayContext,
        athlete: {
          recommendationAvailable: true,
          adviceActionable: true,
          dailyStrainAvailable: false,
          newSessionSincePriorSnapshot: false,
          newInferenceSincePriorSnapshot: false,
          newObservationsSincePriorSnapshot: false,
          minutesSinceLastActivity: null,
          minutesSinceSnapshotGenerated: 20,
          priorPhase: null,
          sleepLoggedTonight: false,
        },
        localHour: 9,
      },
      ref,
    );
    const n = buildPhaseNarrative({
      resolution,
      verdict: 'TRAIN_HARD',
      adviceActionable: true,
      actionLine: null,
      sportLabel: 'Course',
      totalTssToday: null,
      dailyStrainScore: null,
      dailyStrainAvailable: false,
    });
    expect(n.heroHeadline).not.toMatch(/enregistrée|fait|TSS/i);
  });
});

describe('pickAdaptationReminders', () => {
  it('returns reminders only for recovery and end of day', () => {
    expect(pickAdaptationReminders('RECOVERY_WINDOW').length).toBeGreaterThan(0);
    expect(pickAdaptationReminders('MORNING')).toHaveLength(0);
  });
});

describe('verdict status tags', () => {
  const ALL_VERDICTS = Object.keys(VERDICT_STATUS_TAG) as OverallVerdict[];

  function morningNarrative(verdict: OverallVerdict) {
    const ref = new Date('2026-07-07T10:00:00');
    const dayContext = buildDailyPhaseDayContext(ref, [], []);
    const resolution = resolveDailyPhase(
      {
        dayContext,
        athlete: {
          recommendationAvailable: true,
          adviceActionable: true,
          dailyStrainAvailable: false,
          newSessionSincePriorSnapshot: false,
          newInferenceSincePriorSnapshot: false,
          newObservationsSincePriorSnapshot: false,
          minutesSinceLastActivity: null,
          minutesSinceSnapshotGenerated: 60,
          priorPhase: null,
          sleepLoggedTonight: false,
        },
        localHour: 10,
      },
      ref,
    );
    return buildPhaseNarrative({
      resolution,
      verdict,
      adviceActionable: true,
      actionLine: null,
      sportLabel: null,
      totalTssToday: null,
      dailyStrainScore: null,
      dailyStrainAvailable: false,
    });
  }

  it('maps every verdict state to its own distinct existing tag', () => {
    const tags = ALL_VERDICTS.map((v) => VERDICT_STATUS_TAG[v]);
    expect(tags).toHaveLength(ALL_VERDICTS.length);
    expect(new Set(tags).size).toBe(ALL_VERDICTS.length);

    const morningTags = ALL_VERDICTS.map((v) => morningNarrative(v).postureLabel);
    expect(new Set(morningTags).size).toBe(ALL_VERDICTS.length);
  });

  it('CAUTION uses Prudence — never RECOVER’s Récup d’abord', () => {
    expect(VERDICT_STATUS_TAG.CAUTION).toBe('Prudence');
    expect(VERDICT_STATUS_TAG.RECOVER).toBe('Récup d’abord');
    expect(morningNarrative('RECOVER').postureLabel).toBe('Récup d’abord');
    expect(morningNarrative('CAUTION').postureLabel).toBe('Prudence');
    expect(morningNarrative('CAUTION').postureLabel).not.toMatch(/récup/i);
  });
});
