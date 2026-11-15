import { describe, expect, it } from 'vitest';
import {
  planDuplicateSessionRemoval,
  type SessionObservationRef,
} from './duplicate-session-observations';

const obs = (id: string, source: string, externalId: string): SessionObservationRef => ({
  id,
  source,
  externalId,
});

const garminRun = { id: 'act_1', garminId: 'g1', stravaId: null };

describe('planDuplicateSessionRemoval', () => {
  it('leaves an outing with a single observation alone', () => {
    const plan = planDuplicateSessionRemoval(
      [garminRun, { id: 'act_2', garminId: null, stravaId: null }],
      [obs('o1', 'GARMIN', 'g1'), obs('o2', 'MANUAL', 'manual:activity:act_2')],
    );
    expect(plan).toEqual({ remove: [], relink: [] });
  });

  it('removes the manual session beside a Garmin one and moves the reported effort', () => {
    const manual = obs('o2', 'MANUAL', 'manual:activity:act_1');
    const plan = planDuplicateSessionRemoval([garminRun], [obs('o1', 'GARMIN', 'g1'), manual]);

    expect(plan.remove).toEqual([manual]);
    expect(plan.relink).toEqual([{ from: 'manual:activity:act_1', to: 'g1' }]);
  });

  it('keeps Garmin and removes both Strava and manual sessions of one outing', () => {
    const plan = planDuplicateSessionRemoval(
      [{ id: 'act_1', garminId: 'g1', stravaId: 's1' }],
      [
        obs('o1', 'GARMIN', 'g1'),
        obs('o2', 'STRAVA', 's1'),
        obs('o3', 'MANUAL', 'manual:activity:act_1'),
      ],
    );

    expect(plan.remove.map((o) => o.id).sort()).toEqual(['o2', 'o3']);
    expect(plan.relink).toEqual([{ from: 'manual:activity:act_1', to: 'g1' }]);
  });

  it('keeps the Strava session of a Strava-only outing', () => {
    const manual = obs('o2', 'MANUAL', 'manual:activity:act_1');
    const plan = planDuplicateSessionRemoval(
      [{ id: 'act_1', garminId: null, stravaId: 's1' }],
      [obs('o1', 'STRAVA', 's1'), manual],
    );

    expect(plan.remove).toEqual([manual]);
    expect(plan.relink).toEqual([{ from: 'manual:activity:act_1', to: 's1' }]);
  });

  it('never leaves a provider activity without a session', () => {
    const plan = planDuplicateSessionRemoval(
      [garminRun],
      [obs('o2', 'MANUAL', 'manual:activity:act_1')],
    );
    expect(plan).toEqual({ remove: [], relink: [] });
  });
});
