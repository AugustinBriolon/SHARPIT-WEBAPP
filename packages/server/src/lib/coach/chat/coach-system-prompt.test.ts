import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadLearningMemoryBlock = vi.fn().mockResolvedValue('');

vi.mock('@sharpit/server/lib/coach/context/coach-context', () => ({
  buildCoachContext: vi.fn().mockResolvedValue({ practicedSports: [] }),
  formatCoachContext: () => 'contexte',
}));
vi.mock('@sharpit/server/lib/coach/plan/calendar-availability', () => ({
  buildBusySummary: vi.fn().mockResolvedValue(''),
}));
vi.mock('@sharpit/server/lib/coach/memory/load-learning-memory-block', () => ({
  loadLearningMemoryBlock,
}));

const { buildCoachSystemPrompt } =
  await import('@sharpit/server/lib/coach/chat/coach-system-prompt');
const { coachRequestScope } = await import('@sharpit/server/lib/coach/chat/coach-request-scope');

describe('coach system prompt · moving sessions', () => {
  beforeEach(() => {
    loadLearningMemoryBlock.mockResolvedValue('');
  });

  it('tells the coach to move sessions and bricks with updatePlannedSession, never delete and recreate', async () => {
    const { system } = await buildCoachSystemPrompt(
      'athlete-1',
      async () => null,
      coachRequestScope('planning'),
    );

    expect(system).toContain(
      'DÉPLACER / INVERSER des séances = un updatePlannedSession par séance',
    );
    expect(system).toContain('JAMAIS supprimer puis recréer');
    expect(system).toContain('un seul appel sur une jambe déplace tout le brick');
    expect(system).toContain('Un brick déjà planifié ne se recrée pas');
  });
});

describe('coach system prompt · day load vs training status', () => {
  beforeEach(() => {
    loadLearningMemoryBlock.mockResolvedValue('');
  });

  it('keeps day load and training status as distinct coach vocabulary', async () => {
    const { system } = await buildCoachSystemPrompt(
      'athlete-1',
      async () => null,
      coachRequestScope('general'),
    );

    expect(system).toContain('charge du jour = coût physiologique');
    expect(system).toContain('Statut d’entraînement = horizon plus long');
    expect(system).toContain('n’est pas un statut de surentraînement');
  });
});

describe('coach system prompt · learning memory', () => {
  beforeEach(() => {
    loadLearningMemoryBlock.mockReset();
  });

  it('injects the Decision Memory learning block when evidence exists', async () => {
    loadLearningMemoryBlock.mockResolvedValue(`

## Apprentissages Decision Memory
- Les séances de Course Seuil ont été plus dures que prévu sur les 5 dernières évaluations.`);
    const { system } = await buildCoachSystemPrompt(
      'athlete-1',
      async () => null,
      coachRequestScope('general'),
    );
    expect(system).toContain('## Apprentissages Decision Memory');
    expect(system).toContain('plus dures que prévu');
    expect(loadLearningMemoryBlock).toHaveBeenCalledWith('athlete-1');
  });

  it('omits the learning section when the loader returns empty', async () => {
    loadLearningMemoryBlock.mockResolvedValue('');
    const { system } = await buildCoachSystemPrompt(
      'athlete-1',
      async () => null,
      coachRequestScope('general'),
    );
    expect(system).not.toContain('Apprentissages Decision Memory');
  });
});
