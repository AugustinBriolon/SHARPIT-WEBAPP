import { describe, expect, it } from 'vitest';
import {
  missedSessionAlert,
  missedSessionLabel,
  planShare,
  relativeDay,
  sessionDoneAlert,
  sessionName,
} from '@sharpit/server/lib/push/session-alerts';

const today = '2026-10-01'; // a Thursday

describe('session done alert', () => {
  it('says the session is done, its share of the plan, and when we meet next', () => {
    expect(
      sessionDoneAlert(
        [{ plannedMin: 50, doneSec: 46 * 60 }],
        { type: 'BIKE', intensity: 'ENDURANCE', day: '2026-10-02' },
        today,
      ),
    ).toEqual({
      title: 'Séance dans la boîte · 92 % du plan',
      body: 'On se retrouve demain pour ton vélo endurance.',
    });
  });

  it('counts a brick as its legs together', () => {
    const alert = sessionDoneAlert(
      [
        { plannedMin: 60, doneSec: 60 * 60 },
        { plannedMin: 20, doneSec: 16 * 60 },
      ],
      null,
      today,
    );
    expect(alert.title).toBe('2 séances dans la boîte · 95 % du plan');
    expect(alert.body).toBe('Rien d’autre de prévu pour l’instant : profite.');
  });

  it('has a word for a session well short of the plan or well beyond it', () => {
    const next = { type: 'RUN', intensity: 'THRESHOLD', day: today } as const;
    expect(sessionDoneAlert([{ plannedMin: 60, doneSec: 30 * 60 }], next, today).body).toBe(
      'Pas tout le plan, mais c’est fait — c’est ce qui compte. On se retrouve plus tard pour ta course seuil.',
    );
    expect(sessionDoneAlert([{ plannedMin: 60, doneSec: 90 * 60 }], null, today).body).toMatch(
      /^Plus que prévu : pense à bien récupérer\./,
    );
  });

  it('says where the week stands once it holds more than one session', () => {
    const done = [{ plannedMin: 50, doneSec: 50 * 60 }];
    expect(sessionDoneAlert(done, null, today, { done: 3, planned: 5 }).body).toBe(
      '3 sur 5 cette semaine. Rien d’autre de prévu pour l’instant : profite.',
    );
    expect(sessionDoneAlert(done, null, today, { done: 4, planned: 4 }).body).toMatch(
      /^Semaine bouclée : 4 sur 4\./,
    );
    expect(sessionDoneAlert(done, null, today, { done: 1, planned: 1 }).body).toBe(
      'Rien d’autre de prévu pour l’instant : profite.',
    );
  });

  it('leaves the share out when the plan had no duration', () => {
    expect(planShare([{ plannedMin: null, doneSec: 1800 }])).toBeNull();
    expect(sessionDoneAlert([{ plannedMin: null, doneSec: 1800 }], null, today).title).toBe(
      'Séance dans la boîte',
    );
  });

  it('names a session as said aloud', () => {
    expect(sessionName({ type: 'RUN', intensity: 'THRESHOLD' })).toBe('ta course seuil');
    expect(sessionName({ type: 'BIKE', intensity: 'VO2MAX' })).toBe('ton vélo VO2max');
    expect(sessionName({ type: 'SWIM', intensity: null })).toBe('ta natation');
    expect(sessionName({ type: 'STRENGTH', intensity: 'TEMPO' })).toBe('ta séance de muscu');
  });

  it('says when, as the athlete would', () => {
    expect(relativeDay(today, today)).toBe('aujourd’hui');
    expect(relativeDay('2026-10-02', today)).toBe('demain');
    expect(relativeDay('2026-10-04', today)).toBe('dimanche');
    expect(relativeDay('2026-10-12', today)).toBe('le 12 oct.');
  });
});

describe('missed session alert', () => {
  it('regrets the session and offers to rework the week', () => {
    const missed = [{ type: 'RUN', intensity: 'THRESHOLD', brickGroupId: null }] as const;
    expect(missedSessionAlert(missed)).toEqual({
      title: 'Dommage pour hier',
      body: 'Ta course seuil n’a pas eu lieu. On réorganise ta semaine ensemble ?',
    });
    expect(missedSessionLabel(missed)).toBe('Course seuil');
  });

  it('names a brick by its chain', () => {
    const brick = [
      { type: 'BIKE', intensity: 'ENDURANCE', brickGroupId: 'b1' },
      { type: 'RUN', intensity: 'TEMPO', brickGroupId: 'b1' },
    ] as const;
    expect(missedSessionAlert(brick).body).toBe(
      'Ton enchaînement vélo → course n’a pas eu lieu. On réorganise ta semaine ensemble ?',
    );
    expect(missedSessionLabel(brick)).toBe('Brick vélo → course');
  });

  it('counts separate sessions', () => {
    expect(
      missedSessionAlert([
        { type: 'SWIM', intensity: null, brickGroupId: null },
        { type: 'STRENGTH', intensity: null, brickGroupId: null },
      ]).body,
    ).toBe('Tes 2 séances n’ont pas eu lieu. On réorganise ta semaine ensemble ?');
  });
});
