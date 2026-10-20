import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));

vi.mock('@sharpit/server/lib/queries', () => ({
  getActivityForCoach: vi.fn(),
  getGoalById: vi.fn(),
  getPhysicalNoteById: vi.fn(),
  getPlannedSessionById: vi.fn(),
}));

vi.mock('@sharpit/server/lib/training/records/records', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sharpit/server/lib/training/records/records')>()),
  getPerformanceRecordPodium: vi.fn(),
  getPerformanceRecordsForActivity: vi.fn(),
}));

const OWNER = 'athlete-1';
const INTRUDER = 'athlete-2';
const TODAY = new Date(2026, 8, 10, 8, 0);

/** Mirrors the real queries: a row is only found under its owner's id. */
function ownedBy<T>(id: string, row: T) {
  return async (athleteId: string, requestedId: string) =>
    athleteId === OWNER && requestedId === id ? row : null;
}

async function blocks() {
  return await import('@sharpit/server/lib/coach/chat/discuss/coach-discuss-target-blocks');
}

async function queries() {
  return await import('@sharpit/server/lib/queries');
}

async function records() {
  return await import('@sharpit/server/lib/training/records/records');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('today and planning blocks', () => {
  it('points the coach at the day it already has', async () => {
    const { formatTodayDiscussBlock } = await blocks();

    expect(formatTodayDiscussBlock()).toContain("## Conversation ouverte depuis Aujourd'hui");
  });

  it('opens a nutrition conversation on the plate, naming a day other than today', async () => {
    const { formatNutritionDiscussBlock } = await blocks();

    expect(formatNutritionDiscussBlock('2026-10-01', new Date('2026-10-01T09:00:00'))).toContain(
      "sa nutrition (aujourd'hui)",
    );
    expect(formatNutritionDiscussBlock('2026-09-28', new Date('2026-10-01T09:00:00'))).toContain(
      'lundi 28 septembre',
    );
  });

  it('names the planning window and where it ends', async () => {
    const { formatPlanningDiscussBlock } = await blocks();

    const block = formatPlanningDiscussBlock(7, TODAY);

    expect(block).toContain('les 7 prochains jours');
    expect(block).toContain('17 septembre');
    expect(block).toContain('« Déjà planifié »');
  });
});

describe('planned session block', () => {
  const session = {
    id: 'cmsession01',
    type: 'RUN',
    date: new Date('2026-09-12T00:00:00.000Z'),
    title: 'Seuil 3×10',
    startTime: '07:30',
    durationMin: 55,
    intensity: 'THRESHOLD',
    load: 72.4,
    description: 'Échauffement 15 min, 3×10 min au seuil, récup 3 min.',
    completed: true,
    analysis: { complianceScore: 81.6 },
    activityId: 'cmactivity01',
  };

  it('names the session with its id, key numbers and outcome', async () => {
    const { getPlannedSessionById } = await queries();
    vi.mocked(getPlannedSessionById).mockImplementation(ownedBy(session.id, session) as never);
    const { loadPlannedSessionDiscussBlock } = await blocks();

    const block = await loadPlannedSessionDiscussBlock(OWNER, session.id);

    expect(block).toContain('## Séance prévue discutée');
    expect(block).toContain('Course ⟦Seuil 3×10⟧ · samedi 12 septembre 2026 · à 07:30 · 55 min');
    expect(block).toContain('Seuil · charge prévue 72');
    expect(block).toContain('id=cmsession01');
    expect(block).toContain('Contenu prévu : ⟦Échauffement 15 min');
    expect(block).toContain('Réalisée · conformité 82/100.');
  });

  it('yields no block for another athlete’s session', async () => {
    const { getPlannedSessionById } = await queries();
    vi.mocked(getPlannedSessionById).mockImplementation(ownedBy(session.id, session) as never);
    const { loadPlannedSessionDiscussBlock } = await blocks();

    expect(await loadPlannedSessionDiscussBlock(INTRUDER, session.id)).toBeNull();
    expect(getPlannedSessionById).toHaveBeenCalledWith(INTRUDER, session.id);
  });
});

describe('activity block', () => {
  const activity = {
    id: 'cmactivity01',
    type: 'RUN',
    date: new Date(2026, 8, 9, 18, 0),
    title: 'Sortie longue',
    duration: 5400,
    load: 88.2,
    rpe: 6,
    feeling: null,
    runMetrics: { distanceM: 18000, paceSecPerKm: 300, avgHr: 148 },
    bikeMetrics: null,
    swimMetrics: null,
    strengthSets: [],
  };

  it('reuses the recent-sessions line and lists records the activity holds', async () => {
    const { getActivityForCoach } = await queries();
    const { getPerformanceRecordsForActivity } = await records();
    vi.mocked(getActivityForCoach).mockImplementation(ownedBy(activity.id, activity) as never);
    vi.mocked(getPerformanceRecordsForActivity).mockResolvedValue([
      { category: 'run-distance', label: 'Plus longue sortie' },
    ]);
    const { loadActivityDiscussBlock } = await blocks();

    const block = await loadActivityDiscussBlock(OWNER, activity.id, TODAY);

    expect(block).toContain('## Séance réalisée discutée');
    expect(block).toContain('(hier) · Course ⟦Sortie longue⟧ (90 min)');
    expect(block).toContain('18.0 km · 5:00/km · 148 bpm');
    expect(block).toContain('Records personnels détenus : Plus longue sortie.');
  });

  it('yields no block for another athlete’s activity', async () => {
    const { getActivityForCoach } = await queries();
    const { getPerformanceRecordsForActivity } = await records();
    vi.mocked(getActivityForCoach).mockImplementation(ownedBy(activity.id, activity) as never);
    vi.mocked(getPerformanceRecordsForActivity).mockResolvedValue([]);
    const { loadActivityDiscussBlock } = await blocks();

    expect(await loadActivityDiscussBlock(INTRUDER, activity.id, TODAY)).toBeNull();
    expect(getActivityForCoach).toHaveBeenCalledWith(INTRUDER, activity.id);
  });
});

describe('goal block', () => {
  const race = {
    title: 'Half Ironman',
    kind: 'RACE',
    targetDate: new Date(2026, 9, 4),
    location: 'Vichy',
    achieved: false,
    notes: null,
    priority: 'A',
    raceFormat: '70.3',
    targetPerformance: 'Sub 5h',
    currentValue: null,
    targetValue: null,
    unit: null,
  };

  it('names a race with its date, countdown and target', async () => {
    const { getGoalById } = await queries();
    vi.mocked(getGoalById).mockImplementation(ownedBy('cmgoal01', race) as never);
    const { loadGoalDiscussBlock } = await blocks();

    const block = await loadGoalDiscussBlock(OWNER, 'cmgoal01', TODAY);

    expect(block).toContain('## Objectif discuté');
    expect(block).toContain(
      'Course : ⟦Half Ironman⟧ (⟦Vichy⟧) · dimanche 4 octobre 2026 · dans 24 jours · priorité A · 70.3 · objectif visé : ⟦Sub 5h⟧',
    );
  });

  it('reuses the metric-goal line for a metric goal', async () => {
    const { formatGoalDiscussBlock } = await blocks();

    const block = formatGoalDiscussBlock(
      {
        ...race,
        title: 'VMA',
        kind: 'METRIC',
        targetDate: null,
        currentValue: 17,
        targetValue: 18,
        unit: 'km/h',
        achieved: true,
      } as never,
      TODAY,
    );

    expect(block).toContain('Objectif métrique : ⟦VMA⟧ → cible 18km/h (actuel 17).');
    expect(block).toContain('Objectif déjà atteint.');
  });

  it('yields no block for another athlete’s goal', async () => {
    const { getGoalById } = await queries();
    vi.mocked(getGoalById).mockImplementation(ownedBy('cmgoal01', race) as never);
    const { loadGoalDiscussBlock } = await blocks();

    expect(await loadGoalDiscussBlock(INTRUDER, 'cmgoal01', TODAY)).toBeNull();
  });
});

describe('record block', () => {
  const podium = [
    {
      rank: 1,
      displayValue: '21,1 km',
      activityDate: new Date(2026, 4, 3, 9),
      activityTitle: 'Semi de Paris',
    },
    { rank: 2, displayValue: '18,0 km', activityDate: new Date(2026, 8, 9), activityTitle: null },
  ];

  it('lists the podium of a known record family', async () => {
    const { getPerformanceRecordPodium } = await records();
    vi.mocked(getPerformanceRecordPodium).mockImplementation((async (athleteId: string) =>
      athleteId === OWNER ? podium : []) as never);
    const { loadRecordDiscussBlock } = await blocks();

    const block = await loadRecordDiscussBlock(OWNER, 'run-distance');

    expect(block).toContain('Plus longue sortie · course :');
    expect(block).toContain('1. 21,1 km · ⟦Semi de Paris⟧ · 3 mai 2026');
    expect(block).toContain('2. 18,0 km · séance sans titre · 9 sept. 2026');
    expect(getPerformanceRecordPodium).toHaveBeenCalledWith(OWNER, 'run-distance');
  });

  it('yields no block when the athlete holds nothing in that family', async () => {
    const { getPerformanceRecordPodium } = await records();
    vi.mocked(getPerformanceRecordPodium).mockResolvedValue([]);
    const { loadRecordDiscussBlock } = await blocks();

    expect(await loadRecordDiscussBlock(INTRUDER, 'run-distance')).toBeNull();
  });

  it('never queries an unknown record key', async () => {
    const { getPerformanceRecordPodium } = await records();
    const { loadRecordDiscussBlock } = await blocks();

    expect(await loadRecordDiscussBlock(OWNER, 'run-best-5000')).toBeNull();
    expect(getPerformanceRecordPodium).not.toHaveBeenCalled();
  });
});

describe('physical condition block', () => {
  const note = {
    title: 'Tendinite rotulienne',
    category: 'PAIN',
    status: 'MONITORING',
    bodyPart: 'Genou',
    side: 'RIGHT',
    severity: 4,
    description: 'Gêne en descente.',
    startDate: new Date(2026, 7, 20),
    checkins: [{ severity: 3 }, { severity: 5 }],
  };

  it('names the constraint with zone, severity, status and trend', async () => {
    const { getPhysicalNoteById } = await queries();
    vi.mocked(getPhysicalNoteById).mockImplementation(ownedBy('cmnote01', note) as never);
    const { loadPhysicalConditionDiscussBlock } = await blocks();

    const block = await loadPhysicalConditionDiscussBlock(OWNER, 'cmnote01');

    expect(block).toContain('## Contrainte physique discutée');
    expect(block).toContain(
      'Douleur : ⟦Tendinite rotulienne⟧ · zone Genou (Droit) · sévérité 4/10 · statut Sous surveillance · tendance en amélioration · depuis le 20 août 2026',
    );
    expect(block).toContain("Description de l'athlète : ⟦Gêne en descente.⟧");
    expect(block).toContain('jamais un diagnostic médical');
  });

  it('yields no block for another athlete’s note', async () => {
    const { getPhysicalNoteById } = await queries();
    vi.mocked(getPhysicalNoteById).mockImplementation(ownedBy('cmnote01', note) as never);
    const { loadPhysicalConditionDiscussBlock } = await blocks();

    expect(await loadPhysicalConditionDiscussBlock(INTRUDER, 'cmnote01')).toBeNull();
  });
});
