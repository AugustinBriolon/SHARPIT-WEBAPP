import { describe, expect, it } from 'vitest';
import { projectV1Today, type V1TodaySource } from './today';

// A brick line is identified by its group, so `id` and `plannedSessionId` differ. A client
// that addressed the prescription by `id` would name the group instead of the session.

function source(lines: V1TodaySource['actionRow']['daySummaryLines']): V1TodaySource {
  return {
    hasContent: true,
    emptyState: null,
    hero: {
      eyebrow: '',
      headline: '',
      subline: '',
      posture: 'steady',
      postureLabel: '',
      focusPriority: null,
      actionLine: null,
      twinTrustStrip: {
        confidencePctRounded: null,
        limitingCauseText: null,
        confidenceLabel: null,
        packTier: null,
        visibleGaps: [],
      },
      signalPreviews: [],
    },
    header: { weather: null },
    actionRow: { daySummaryLines: lines },
  } as unknown as V1TodaySource;
}

const input = { trainingDayId: '2026-09-20', webOrigin: 'https://example.test' };

describe('projectV1Today sessions', () => {
  it('carries the prescription id of a planned line', () => {
    const [session] = projectV1Today(
      source([{ id: 'line-1', kind: 'planned', primary: 'Seuil', plannedSessionId: 'ps-1' }]),
      input,
    ).sessions;

    expect(session.plannedSessionId).toBe('ps-1');
  });

  it('keeps the line id distinct from the prescription id', () => {
    const [session] = projectV1Today(
      source([
        { id: 'brick-group', kind: 'planned', primary: 'Brick', plannedSessionId: 'ps-leg-1' },
      ]),
      input,
    ).sessions;

    expect(session.id).toBe('brick-group');
    expect(session.plannedSessionId).toBe('ps-leg-1');
  });

  it('reports null rather than falling back to the line id', () => {
    const [session] = projectV1Today(
      source([{ id: 'act-1', kind: 'done', primary: 'Sortie longue' }]),
      input,
    ).sessions;

    expect(session.plannedSessionId).toBeNull();
  });

  it('carries the Decision Memory purpose as rationale', () => {
    const [session] = projectV1Today(
      source([
        {
          id: 'line-1',
          kind: 'planned',
          primary: 'Seuil',
          plannedSessionId: 'ps-1',
          purpose: 'Construire la base aérobie.',
        },
      ]),
      input,
    ).sessions;

    expect(session.rationale).toBe('Construire la base aérobie.');
  });

  it("carries a brick line's legs in order, and none on a plain line", () => {
    const [brick, plain] = projectV1Today(
      source([
        {
          id: 'brick-group',
          kind: 'planned',
          primary: 'Brick · Vélo → Course',
          plannedSessionId: 'ps-bike',
          brickLegs: [
            { id: 'ps-bike', type: 'BIKE', title: 'Vélo', durationMin: 60 },
            { id: 'ps-run', type: 'RUN', title: 'Course', durationMin: 20 },
          ],
        },
        { id: 'ps-2', kind: 'planned', primary: 'Seuil', plannedSessionId: 'ps-2' },
      ]),
      input,
    ).sessions;

    expect(brick.brickLegs?.map((leg) => leg.id)).toEqual(['ps-bike', 'ps-run']);
    expect(plain.brickLegs).toBeNull();
    expect(brick.brickGroupId).toBe('brick-group');
    expect(plain.brickGroupId).toBeNull();
  });
});
