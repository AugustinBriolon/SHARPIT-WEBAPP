import { describe, expect, it } from 'vitest';
import {
  goalPriorityFields,
  planStepRaces,
  planTargetRace,
  PRIORITY_CONSEQUENCES,
  PRIORITY_ROLES,
  raceEffortSeconds,
  seasonConflicts,
  suggestPriority,
  toPrioritizedRaces,
} from './goal-priority';

function goal(
  id: string,
  date: string,
  formatKey: string | null,
  priority: 'A' | 'B' | 'C' | null,
) {
  return {
    id,
    title: id,
    kind: 'RACE',
    achieved: false,
    targetDate: new Date(date),
    priority,
    discipline: formatKey ? (formatKey.startsWith('TRI') ? 'TRIATHLON' : 'RUN') : null,
    formatKey,
  };
}

const IRONMAN = goal('ironman', '2027-10-10', 'TRI_XXL', 'A');
const TRI_L = goal('tri-l', '2027-04-18', 'TRI_L', null);
const TEN_K = goal('10k', '2027-03-01', 'RUN_10K', null);

describe('roles', () => {
  it('names each priority and its consequence', () => {
    expect(PRIORITY_ROLES).toEqual({
      A: 'Objectif principal',
      B: 'Course étape',
      C: "Course d'entraînement",
    });
    expect(PRIORITY_CONSEQUENCES.B).toMatch(/Mini-affûtage/);
  });
});

describe('raceEffortSeconds', () => {
  it('ranks a full distance above a half', () => {
    expect(raceEffortSeconds(IRONMAN)!).toBeGreaterThan(raceEffortSeconds(TRI_L)!);
  });

  it('is null for an unstructured race', () => {
    expect(raceEffortSeconds(goal('x', '2027-01-01', null, null))).toBeNull();
  });
});

describe('suggestPriority', () => {
  const races = toPrioritizedRaces([IRONMAN, TRI_L, TEN_K]);
  const byId = (id: string) => races.find((r) => r.id === id)!;

  it('makes a shorter race in the A season a step (B)', () => {
    expect(suggestPriority(byId('tri-l'), races)).toBe('B');
  });

  it('makes a far shorter race a tune-up (C)', () => {
    expect(suggestPriority(byId('10k'), races)).toBe('C');
  });

  it('makes the longest race the A when the season has none', () => {
    const noA = toPrioritizedRaces([{ ...IRONMAN, priority: null }, TRI_L]);
    expect(
      suggestPriority(
        noA.find((r) => r.id === 'ironman')!,
        noA,
      ),
    ).toBe('A');
    expect(
      suggestPriority(
        noA.find((r) => r.id === 'tri-l')!,
        noA,
      ),
    ).toBe('B');
  });

  it('makes a lone race the A', () => {
    const [only] = toPrioritizedRaces([TRI_L]);
    expect(suggestPriority(only, [only])).toBe('A');
  });
});

describe('seasonConflicts', () => {
  it('pairs two A races under six months apart', () => {
    const races = toPrioritizedRaces([IRONMAN, { ...TRI_L, priority: 'A' }]);
    expect(seasonConflicts(races).map(([a, b]) => [a.id, b.id])).toEqual([['tri-l', 'ironman']]);
  });

  it('leaves A races six months or more apart alone', () => {
    const races = toPrioritizedRaces([
      IRONMAN,
      { ...TRI_L, priority: 'A', targetDate: new Date('2027-04-01') },
    ]);
    expect(seasonConflicts(races)).toEqual([]);
  });
});

describe('goalPriorityFields', () => {
  it('exposes the role, consequence and conflict of a goal', () => {
    const triA = { ...TRI_L, priority: 'A' as const };
    expect(goalPriorityFields(triA, [IRONMAN, triA])).toEqual({
      priorityRole: 'Objectif principal',
      priorityConsequence: PRIORITY_CONSEQUENCES.A,
      seasonConflict: { otherGoalId: 'ironman', otherTitle: 'ironman' },
      suggestedPriority: null,
    });
  });

  it('suggests a priority only when none is set', () => {
    const fields = goalPriorityFields(TRI_L, [IRONMAN, TRI_L]);
    expect(fields.priorityRole).toBeNull();
    expect(fields.suggestedPriority).toBe('B');
  });
});

describe('plan target and step races', () => {
  const races = toPrioritizedRaces([IRONMAN, { ...TRI_L, priority: 'B' }, TEN_K]);
  const byId = (id: string) => races.find((r) => r.id === id)!;

  it('builds a plan asked for a B race toward its A race', () => {
    expect(planTargetRace(byId('tri-l'), races).id).toBe('ironman');
    expect(planTargetRace(byId('ironman'), races).id).toBe('ironman');
  });

  it('keeps a B race as target when no A follows it', () => {
    const alone = toPrioritizedRaces([{ ...TRI_L, priority: 'B' }]);
    expect(planTargetRace(alone[0], alone).id).toBe('tri-l');
  });

  it('lists B and C races before the target as step races', () => {
    const steps = planStepRaces(byId('ironman'), races, new Date('2027-01-01'));
    expect(steps.map((s) => [s.title, s.priority])).toEqual([
      ['tri-l', 'B'],
      ['10k', 'C'],
    ]);
    expect(planStepRaces(byId('ironman'), races, new Date('2027-03-15'))).toHaveLength(1);
  });
});
