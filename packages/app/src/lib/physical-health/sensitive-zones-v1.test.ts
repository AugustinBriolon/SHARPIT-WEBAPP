import { describe, expect, it } from 'vitest';
import { projectSensitiveZones, zoneTimeline, type ZoneNote } from './sensitive-zones-v1';

const NOW = new Date('2026-10-05T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const checkin = (
  id: string,
  day: number,
  fields: { severity?: number | null; status?: string | null; functionalImpact?: string | null },
) => ({
  id,
  date: daysAgo(day),
  createdAt: daysAgo(day),
  severity: fields.severity ?? null,
  comment: null,
  functionalImpact: fields.functionalImpact ?? null,
  status: fields.status ?? null,
});

const note = (overrides: Partial<ZoneNote>): ZoneNote => ({
  id: 'n1',
  category: 'PAIN',
  status: 'ACTIVE',
  title: 'Tendon du biceps fémoral',
  bodyPart: 'Genou',
  side: 'NA',
  severity: 0,
  functionalImpact: null,
  description: null,
  affectsTraining: true,
  startDate: daysAgo(120),
  resolvedAt: null,
  checkins: [],
  ...overrides,
});

const RUN = { id: 's1', date: daysAgo(-2), type: 'RUN', title: 'Footing', completed: false };

describe('projectSensitiveZones', () => {
  it('proposes closing a silent pain and stops flagging the runs it no longer constrains', () => {
    const silent = note({
      checkins: [checkin('c1', 2, { severity: 0 }), checkin('c2', 20, { severity: 0 })],
    });
    const [zone] = projectSensitiveZones({ notes: [silent], sessions: [RUN], now: NOW }).zones;
    expect(zone).toMatchObject({
      strategy: 'progressive',
      strategyLabel: 'Reprise progressive',
      resolutionSuggested: true,
      upcomingSessionsLoading: 0,
      bodyPartRecognized: true,
      sideLabel: null,
    });
  });

  it('counts the upcoming sessions loading a zone still protected', () => {
    const hurting = note({ severity: 6, functionalImpact: 'LIMITING' });
    const [zone] = projectSensitiveZones({ notes: [hurting], sessions: [RUN], now: NOW }).zones;
    expect(zone).toMatchObject({
      strategy: 'protect',
      upcomingSessionsLoading: 1,
      functionalImpactLabel: 'Limite l’entraînement',
    });
  });

  it('lists open zones by strategy, resolved ones last, and offers the body parts', () => {
    const result = projectSensitiveZones({
      notes: [
        note({ id: 'resolved', status: 'RESOLVED', resolvedAt: daysAgo(100) }),
        note({ id: 'posture', category: 'POSTURE', bodyPart: 'Épaule', severity: 5 }),
        note({ id: 'pain', severity: 4 }),
      ],
      sessions: [],
      now: NOW,
    });
    expect(result.zones.map((zone) => zone.id)).toEqual(['pain', 'posture', 'resolved']);
    expect(result.bodyParts).toContain('Genou');
  });

  it('flags a free-text region the plan check cannot see', () => {
    const [zone] = projectSensitiveZones({
      notes: [note({ bodyPart: 'Plexus' })],
      sessions: [],
      now: NOW,
    }).zones;
    expect(zone?.bodyPartRecognized).toBe(false);
  });
});

describe('zoneTimeline', () => {
  it('reads readings and status changes newest first, a reopening as a relapse', () => {
    const timeline = zoneTimeline([
      checkin('a', 30, { severity: 4, functionalImpact: 'MODERATE' }),
      checkin('b', 20, { status: 'RESOLVED' }),
      checkin('c', 5, { status: 'ACTIVE' }),
      checkin('d', 4, { severity: 3 }),
    ]);
    expect(timeline.map((entry) => [entry.id, entry.kind, entry.label])).toEqual([
      ['d', 'reading', 'Douleur 3/10'],
      ['c', 'status', 'Rechute'],
      ['b', 'status', 'Résolue'],
      ['a', 'reading', 'Douleur 4/10'],
    ]);
  });
});
