import { describe, expect, it } from 'vitest';
import { practicedSportsRule } from './practiced-sports';
import { baseContext, baseProposal } from '../test-fixtures';

describe('practicedSportsRule', () => {
  it('rejects ADD of a sport the athlete does not practice (run-only)', () => {
    const findings = practicedSportsRule(
      baseContext({ practicedSports: ['run'] }),
      baseProposal({ type: 'BIKE' }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('SPORT_NOT_PRACTICED');
    expect(findings[0]?.severity).toBe('REJECTED');
  });

  it('allows ADD of triathlon-expanded sports', () => {
    const findings = practicedSportsRule(
      baseContext({ practicedSports: ['triathlon'] }),
      baseProposal({ type: 'SWIM' }),
    );
    expect(findings).toEqual([]);
  });

  it('allows STRENGTH ADD when complementary strength is practiced', () => {
    const findings = practicedSportsRule(
      baseContext({ practicedSports: ['run', 'strength'] }),
      baseProposal({ type: 'STRENGTH' }),
    );
    expect(findings).toEqual([]);
  });

  it('allows preventive STRENGTH ADD when only core endurance is practiced', () => {
    const findings = practicedSportsRule(
      baseContext({ practicedSports: ['run', 'bike', 'swim', 'triathlon'] }),
      baseProposal({ type: 'STRENGTH' }),
    );
    expect(findings).toEqual([]);
  });

  it('allows MODIFY of an existing non-practiced session without changing type', () => {
    const findings = practicedSportsRule(
      baseContext({
        practicedSports: ['run'],
        existingSessions: [
          {
            id: 'ps-bike',
            date: new Date('2026-07-17'),
            type: 'BIKE',
            intensity: 'ENDURANCE',
            completed: false,
            load: 40,
          },
        ],
      }),
      baseProposal({
        action: 'MODIFY',
        sessionId: 'ps-bike',
        type: 'BIKE',
        durationMin: 45,
      }),
    );
    expect(findings).toEqual([]);
  });

  it('rejects MODIFY that switches type to a non-practiced sport', () => {
    const findings = practicedSportsRule(
      baseContext({
        practicedSports: ['run'],
        existingSessions: [
          {
            id: 'ps-run',
            date: new Date('2026-07-17'),
            type: 'RUN',
            intensity: 'ENDURANCE',
            completed: false,
            load: 40,
          },
        ],
      }),
      baseProposal({
        action: 'MODIFY',
        sessionId: 'ps-run',
        type: 'BIKE',
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('SPORT_NOT_PRACTICED');
  });

  it('skips when practicedSports is empty', () => {
    const findings = practicedSportsRule(
      baseContext({ practicedSports: [] }),
      baseProposal({ type: 'BIKE' }),
    );
    expect(findings).toEqual([]);
  });
});
