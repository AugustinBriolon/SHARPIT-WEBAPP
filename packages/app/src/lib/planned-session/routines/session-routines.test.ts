import { describe, expect, it } from 'vitest';
import {
  coachSessionRoutinesSchema,
  resolveSessionRoutines,
  summarizeWarmupAdherence,
} from './session-routines';

const names = (moves: { name: string }[]) => moves.map((m) => m.name);

describe('resolveSessionRoutines', () => {
  it('gives each endurance sport its warm-up and stretches, none to strength', () => {
    const run = resolveSessionRoutines({ type: 'RUN' });
    expect(run?.warmup.source).toBe('library');
    expect(names(run!.warmup.moves)).toContain('Rotations de chevilles');
    expect(names(run!.cooldown.moves)).toContain('Fente basse, étirement du psoas');
    expect(run!.cooldown.minutes).toBe(run!.cooldown.moves.length);
    expect(names(resolveSessionRoutines({ type: 'SWIM' })!.warmup.moves)).toContain(
      'Cercles de bras avant et arrière',
    );
    expect(resolveSessionRoutines({ type: 'STRENGTH' })).toBeNull();
  });

  it.each([
    ['RECOVERY', 2, 0],
    ['ENDURANCE', 4, 3],
    ['TEMPO', 6, 3],
    ['THRESHOLD', 8, 3],
    ['VO2MAX', 8, 3],
    ['RACE', 8, 3],
  ] as const)('doses a %s run: %i warm-up moves, %i stretches', (intensity, warmup, cooldown) => {
    const run = resolveSessionRoutines({ type: 'RUN', intensity })!;
    expect(run.warmup.moves).toHaveLength(warmup);
    expect(run.cooldown.moves).toHaveLength(cooldown);
  });

  it('adds drills before tempo and activation before threshold', () => {
    const tempo = names(resolveSessionRoutines({ type: 'RUN', intensity: 'TEMPO' })!.warmup.moves);
    expect(tempo).toContain('Montées de genoux');
    expect(tempo).not.toContain('Pont fessier');
    const threshold = resolveSessionRoutines({ type: 'BIKE', intensity: 'THRESHOLD' })!;
    expect(names(threshold.warmup.moves)).toContain('Pont fessier');
  });

  it('marks the stretches optional and the warm-up not', () => {
    const run = resolveSessionRoutines({ type: 'RUN' })!;
    expect(run.warmup.optional).toBe(false);
    expect(run.cooldown.optional).toBe(true);
  });

  it('holds stretches after a recovery session only for a declared zone', () => {
    const run = resolveSessionRoutines({
      type: 'RUN',
      intensity: 'RECOVERY',
      zones: [{ bodyRegion: 'Mollet' }],
    })!;
    expect(names(run.cooldown.moves)).toEqual([
      'Étirement du soléaire, genou fléchi contre un mur',
    ]);
  });

  it('asks every move aimed at an injured zone to stay pain-free', () => {
    const run = resolveSessionRoutines({
      type: 'RUN',
      zones: [{ bodyRegion: 'Mollet', category: 'INJURY' }],
    })!;
    const soleus = run.cooldown.moves.find((m) => m.name.startsWith('Étirement du soléaire'));
    expect(soleus?.cue).toMatch(/Sans douleur/);
  });

  it('carries what the athlete said they did with each half', () => {
    const run = resolveSessionRoutines({ type: 'RUN', warmupStatus: 'DONE' })!;
    expect(run.warmup.status).toBe('DONE');
    expect(run.cooldown.status).toBeNull();
  });

  it("adds moves for the athlete's declared zones, once each", () => {
    const bike = resolveSessionRoutines({
      type: 'BIKE',
      zones: [{ bodyRegion: 'Sciatique' }, { bodyRegion: 'Lombaires' }],
    })!;
    expect(names(bike.cooldown.moves)).toContain('Glissements du nerf sciatique, allongé');
    // The bike warm-up already holds cat-cow: the zone's copy is not repeated.
    expect(names(bike.warmup.moves).filter((n) => n === 'Chat-vache')).toHaveLength(1);
  });

  it("keeps the coach's routine for the half it wrote, the library for the other", () => {
    const coachWarmup = [
      { name: 'Gammes A', dose: '2 × 20 m', cue: null },
      { name: 'Skipping', dose: '2 × 20 m' },
      { name: 'Accélérations', dose: '3 × 80 m', cue: 'Relâché' },
    ];
    const run = resolveSessionRoutines({
      type: 'RUN',
      routines: { warmup: coachWarmup, cooldown: null },
    })!;
    expect(run.warmup.source).toBe('coach');
    expect(names(run.warmup.moves)).toEqual(['Gammes A', 'Skipping', 'Accélérations']);
    expect(run.warmup.moves[1]?.cue).toBeNull();
    expect(run.cooldown.source).toBe('library');
  });

  it('ignores a malformed stored routine', () => {
    const run = resolveSessionRoutines({ type: 'RUN', routines: { warmup: [{ dose: 1 }] } })!;
    expect(run.warmup.source).toBe('library');
  });

  it('accepts the coach shape it is asked for', () => {
    expect(coachSessionRoutinesSchema.safeParse({ warmup: null, cooldown: null }).success).toBe(
      true,
    );
  });
});

describe('summarizeWarmupAdherence', () => {
  it('tallies the completed endurance sessions by what the athlete said', () => {
    expect(
      summarizeWarmupAdherence([
        { type: 'RUN', completed: true, warmupStatus: 'DONE' },
        { type: 'BIKE', completed: true, warmupStatus: 'SKIPPED' },
        { type: 'SWIM', completed: true, warmupStatus: null },
        { type: 'RUN', completed: false, warmupStatus: null },
        { type: 'STRENGTH', completed: true, warmupStatus: null },
      ]),
    ).toEqual({ DONE: 1, SHORTENED: 0, SKIPPED: 1, unsaid: 1 });
  });

  it('says nothing without a completed endurance session', () => {
    expect(
      summarizeWarmupAdherence([{ type: 'STRENGTH', completed: true, warmupStatus: null }]),
    ).toBeNull();
  });
});
