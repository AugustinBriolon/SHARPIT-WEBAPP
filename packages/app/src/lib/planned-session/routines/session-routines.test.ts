import { describe, expect, it } from 'vitest';
import { coachSessionRoutinesSchema, resolveSessionRoutines } from './session-routines';

const names = (moves: { name: string }[]) => moves.map((m) => m.name);

describe('resolveSessionRoutines', () => {
  it('gives each endurance sport its warm-up and stretches, none to strength', () => {
    const run = resolveSessionRoutines({ type: 'RUN' });
    expect(run?.warmup.source).toBe('library');
    expect(names(run!.warmup.moves)).toContain('Montées de genoux');
    expect(names(run!.cooldown.moves)).toContain('Pigeon au sol');
    expect(run!.cooldown.minutes).toBe(run!.cooldown.moves.length);
    expect(names(resolveSessionRoutines({ type: 'SWIM' })!.warmup.moves)).toContain(
      'Cercles de bras avant et arrière',
    );
    expect(resolveSessionRoutines({ type: 'STRENGTH' })).toBeNull();
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
    expect(coachSessionRoutinesSchema.safeParse({ warmup: null, cooldown: null }).success).toBe(true);
  });
});
