import { describe, expect, it, vi } from 'vitest';
import type { TodayViewModel } from '@sharpit/app/presentation/today-view-model';

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));

const { attachStrengthPrescriptions } = await import('./today');

type Line = TodayViewModel['actionRow']['daySummaryLines'][number];

function viewModel(lines: Partial<Line>[]): TodayViewModel {
  return { actionRow: { daySummaryLines: lines } } as unknown as TodayViewModel;
}

describe('attachStrengthPrescriptions', () => {
  const exercises = { exercises: [{ name: 'Squat', sets: 4, reps: 8 }] };

  it('gives a planned line the exercises of its session', () => {
    const vm = attachStrengthPrescriptions(
      viewModel([{ id: 'line-1', kind: 'planned', plannedSessionId: 'ps-1' }]),
      [{ id: 'ps-1', strengthPrescription: exercises }],
    );

    expect(vm.actionRow.daySummaryLines[0].strengthPrescription).toEqual(exercises);
  });

  it('leaves done lines and lines without a session empty', () => {
    const vm = attachStrengthPrescriptions(
      viewModel([
        { id: 'act-1', kind: 'done', plannedSessionId: 'ps-1' },
        { id: 'line-2', kind: 'planned', plannedSessionId: null },
        { id: 'line-3', kind: 'planned', plannedSessionId: 'ps-gone' },
      ]),
      [{ id: 'ps-1', strengthPrescription: exercises }],
    );

    expect(vm.actionRow.daySummaryLines.map((line) => line.strengthPrescription)).toEqual([
      null,
      null,
      null,
    ]);
  });
});
