import { describe, expect, it } from 'vitest';
import {
  nextSessionLabel,
  planShare,
  relativeDay,
  sessionDoneAlert,
} from '@sharpit/server/lib/push/session-done-alert';

const today = '2026-10-01'; // a Thursday

describe('session done alert', () => {
  it('says the session counted, its share of the plan, and what comes next', () => {
    expect(
      sessionDoneAlert(
        [{ plannedMin: 50, doneSec: 46 * 60 }],
        { type: 'BIKE', intensity: 'ENDURANCE', day: '2026-10-02' },
        today,
      ),
    ).toEqual({
      title: 'Séance comptée · 92 % du plan',
      body: 'Prochaine : Vélo endurance demain',
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
    expect(alert.title).toBe('2 séances comptées · 95 % du plan');
    expect(alert.body).toBe('Plus rien de prévu dans ton plan pour l’instant.');
  });

  it('leaves the share out when the plan had no duration', () => {
    expect(planShare([{ plannedMin: null, doneSec: 1800 }])).toBeNull();
    expect(sessionDoneAlert([{ plannedMin: null, doneSec: 1800 }], null, today).title).toBe(
      'Séance comptée',
    );
  });

  it('names the next session by its sport and intensity', () => {
    expect(nextSessionLabel({ type: 'RUN', intensity: 'THRESHOLD' })).toBe('Course seuil');
    expect(nextSessionLabel({ type: 'RUN', intensity: 'VO2MAX' })).toBe('Course VO2max');
    expect(nextSessionLabel({ type: 'SWIM', intensity: null })).toBe('Natation');
  });

  it('says when, as the athlete would', () => {
    expect(relativeDay(today, today)).toBe('aujourd’hui');
    expect(relativeDay('2026-10-02', today)).toBe('demain');
    expect(relativeDay('2026-10-04', today)).toBe('dimanche');
    expect(relativeDay('2026-10-12', today)).toBe('le 12 oct.');
  });
});
