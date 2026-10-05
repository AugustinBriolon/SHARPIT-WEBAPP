import { ActivityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { projectV1Today, type V1TodaySource } from './today';

const origin = 'https://app.example';

function source(
  over: Partial<V1TodaySource> & { hero?: Partial<V1TodaySource['hero']> } = {},
): V1TodaySource {
  const { hero: heroOver, ...rest } = over;
  return {
    hasContent: true,
    emptyState: null,
    hero: {
      eyebrow: 'Ce matin',
      headline: 'Séance prévue',
      subline: 'Tenir',
      posture: 'steady',
      postureLabel: 'FEU VERT',
      focusPriority: 'Entraîne-toi — légèrement',
      actionLine: null,
      twinTrustStrip: {
        confidencePctRounded: 72,
        limitingCauseText: 'Sommeil',
        confidenceLabel: 'ESTIMATION PARTIELLE',
      },
      reliability: {
        packTier: 'PARTIAL',
        visibleGaps: ['Baseline HRV partielle (moins de 14 j)'],
      },
      signalPreviews: [
        { key: 'sleep', scoreDisplay: '78', subtitle: 'Correct' },
        { key: 'recovery', scoreDisplay: '61', subtitle: null },
        { key: 'effort', scoreDisplay: '—', subtitle: null },
        { key: 'adaptation', scoreDisplay: '55', subtitle: null },
      ],
      ...heroOver,
    },
    header: { weather: { city: 'Lyon', tempC: 12, condition: 'Nuageux' } },
    actionRow: {
      daySummaryLines: [
        {
          id: 's1',
          kind: 'planned',
          primary: 'Seuil 40 min',
          secondary: 'Course',
          activityType: ActivityType.RUN,
          metrics: [{ label: 'Durée', value: '40', unit: 'min' }],
        },
      ],
    },
    ...rest,
  };
}

describe('projectV1Today', () => {
  it('projects a full hero without href or Tailwind classes', () => {
    const json = projectV1Today(source(), { trainingDayId: '2026-09-15', webOrigin: origin });
    expect(json.apiVersion).toBe(1);
    expect(json.trainingDayId).toBe('2026-09-15');
    expect(json.empty).toBeNull();
    expect(json.verdict).toEqual({
      eyebrow: 'Ce matin',
      headline: 'Séance prévue',
      subline: 'Tenir',
      posture: 'steady',
      confidencePct: 72,
      limitingCause: 'Sommeil',
      statusLabel: 'FEU VERT',
      actionLine: 'Entraîne-toi — légèrement',
      confidenceLabel: 'ESTIMATION PARTIELLE',
      packTier: 'PARTIAL',
      estimationGaps: ['Baseline HRV partielle (moins de 14 j)'],
    });
    expect(json.weather).toEqual({ city: 'Lyon', tempC: 12, condition: 'Nuageux' });
    expect(json.sessions).toEqual([
      {
        id: 's1',
        kind: 'planned',
        title: 'Seuil 40 min',
        subtitle: 'Course',
        metrics: [{ label: 'Durée', value: '40', unit: 'min' }],
        sport: 'Course',
        priority: true,
        plannedSessionId: null,
        isKey: false,
        brickLegs: null,
        brickTransitionsSec: null,
        brickGroupId: null,
      },
    ]);
    expect(json.signals.map((s) => s.key)).toEqual(['sleep', 'recovery']);
    expect(JSON.stringify(json)).not.toMatch(/href|bgClass|rounded-/);
  });

  it('offers the Garmin handoff when the day is empty and Garmin is not connected', () => {
    const json = projectV1Today(
      source({
        hasContent: false,
        emptyState: {
          title: 'Données insuffisantes',
          description: 'SharpIt attend tes premières données.',
          action: { label: 'Ouvrir', href: '/moi' },
        },
      }),
      { trainingDayId: '2026-09-15', webOrigin: `${origin}/`, garminConnected: false },
    );
    expect(json.empty).toEqual({
      title: 'Pas encore de données',
      message:
        'Connecte Garmin pour que ton Twin lise ton sommeil, ta récupération et tes séances.',
      code: 'NO_CONTENT',
      webURL: 'https://app.example/connect/garmin',
      actionLabel: 'Connecter Garmin',
    });
    expect(json.verdict.headline).toBe('Pas encore de données');
  });

  it('keeps the Twin’s own message and drops the action once Garmin is connected', () => {
    const json = projectV1Today(
      source({
        hasContent: false,
        emptyState: { title: 'Données insuffisantes', description: 'SharpIt attend tes données.' },
      }),
      { trainingDayId: '2026-09-15', webOrigin: origin, garminConnected: true },
    );
    expect(json.empty).toEqual({
      title: 'Données insuffisantes',
      message: 'SharpIt attend tes données.',
      code: 'NO_CONTENT',
      webURL: 'https://app.example/connect/garmin',
      actionLabel: null,
    });
  });

  it('drops weather and sessions when absent', () => {
    const json = projectV1Today(
      source({ header: { weather: null }, actionRow: { daySummaryLines: [] } }),
      { trainingDayId: '2026-09-15', webOrigin: origin },
    );
    expect(json.weather).toBeNull();
    expect(json.sessions).toEqual([]);
  });
});

describe('projectV1Today · a brick under way', () => {
  it('sends each leg’s activity and notes, and the transitions, to the native client', () => {
    const [session] = projectV1Today(
      {
        ...source(),
        actionRow: {
          daySummaryLines: [
            {
              id: 'brick-1',
              kind: 'done',
              primary: 'Brick · Vélo → Course',
              secondary: '1h50 · 136 TSS · Transition 2 min 04',
              activityType: 'TRIATHLON',
              plannedSessionId: 'leg-bike',
              brickLegs: [
                {
                  id: 'leg-bike',
                  type: 'BIKE',
                  title: 'Vélo',
                  durationMin: 85,
                  completed: true,
                  activityId: 'act-bike',
                  actual: { durationSec: 4_815, load: 95, rpe: 6, feeling: 'Bonnes jambes' },
                },
                { id: 'leg-run', type: 'RUN', title: 'Course', durationMin: 30 },
              ],
              brickTransitionsSec: [null],
            },
          ],
        },
      },
      { trainingDayId: '2026-09-30', webOrigin: 'https://web.sharpit.app' },
    ).sessions;

    expect(session!.brickLegs).toEqual([
      {
        id: 'leg-bike',
        type: 'BIKE',
        title: 'Vélo',
        durationMin: 85,
        completed: true,
        activityId: 'act-bike',
        actual: { durationSec: 4_815, load: 95, rpe: 6, feeling: 'Bonnes jambes' },
      },
      {
        id: 'leg-run',
        type: 'RUN',
        title: 'Course',
        durationMin: 30,
        completed: false,
        activityId: null,
        actual: null,
      },
    ]);
    expect(session!.brickTransitionsSec).toEqual([null]);
    // Installed apps open a done line as an activity: the first done leg's, never the group.
    expect(session!.id).toBe('act-bike');
    // The group still addresses the brick as a whole — its evaluation, its analysis.
    expect(session!.brickGroupId).toBe('brick-1');
  });
});

describe('projectV1Today · the morning proposal', () => {
  const recalibration = {
    decisionId: 'd1',
    sessionId: 's1',
    sessionType: 'RUN',
    direction: 'DOWN' as const,
    changeSummary: 'Seuil 40 min → Endurance 35 min',
    why: 'Nuit courte et VFC sous ta plage',
    status: 'PRESENTED' as const,
    fromIntensity: 'THRESHOLD',
    toIntensity: 'ENDURANCE',
    fromDurationMin: 40,
    toDurationMin: 35,
    fromLoad: 60,
    toLoad: 35,
    fromDescription: '3×10 min au seuil',
    toDescription: 'Footing facile',
  };

  function withRecalibration(status: typeof recalibration.status | 'ACCEPTED') {
    const base = source();
    return source({
      actionRow: { ...base.actionRow, morningRecalibration: { ...recalibration, status } },
    });
  }

  it('sends the proposal while it waits for an answer, intensities in words', () => {
    const json = projectV1Today(withRecalibration('PRESENTED'), {
      trainingDayId: '2026-10-02',
      webOrigin: origin,
    });

    expect(json.morningProposal).toMatchObject({
      decisionId: 'd1',
      sessionId: 's1',
      direction: 'DOWN',
      from: { durationMin: 40, description: '3×10 min au seuil' },
      to: { durationMin: 35, description: 'Footing facile' },
    });
    expect(json.morningProposal?.checkInDone).toBe(true);
    expect(json.morningProposal?.from.intensityLabel).toBeTruthy();
    expect(json.morningProposal?.from.intensityLabel).not.toBe('THRESHOLD');
  });

  it('says when the check-in is still to do, so the card can invite to it', () => {
    const json = projectV1Today(withRecalibration('PRESENTED'), {
      trainingDayId: '2026-10-02',
      webOrigin: origin,
      morningCheckInDone: false,
    });
    expect(json.morningProposal?.checkInDone).toBe(false);
  });

  it('sends nothing once the athlete answered, or without a proposal', () => {
    const answered = projectV1Today(withRecalibration('ACCEPTED'), {
      trainingDayId: '2026-10-02',
      webOrigin: origin,
    });
    const none = projectV1Today(source(), { trainingDayId: '2026-10-02', webOrigin: origin });

    expect(answered.morningProposal).toBeNull();
    expect(none.morningProposal).toBeNull();
  });
});
