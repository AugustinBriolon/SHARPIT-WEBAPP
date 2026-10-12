import { describe, expect, it } from 'vitest';
import { formatDurableMemoryBlock } from './format-durable-memory-block';
import type { CoachMemoryEntry } from '@sharpit/app/lib/coach-memory/core/types';

function entry(
  partial: Partial<CoachMemoryEntry> & Pick<CoachMemoryEntry, 'type' | 'label'>,
): CoachMemoryEntry {
  return {
    id: partial.id ?? 'm1',
    type: partial.type,
    source: partial.source ?? 'USER',
    label: partial.label,
    locationLabel: null,
    locationLat: null,
    locationLng: null,
    startDate: partial.startDate ?? '2026-10-01',
    endDate: partial.endDate ?? '2099-12-31',
    note: partial.note ?? null,
    trainingConstraint: 'FULL',
    allowedDisciplines: [],
    isActive: partial.isActive ?? true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('formatDurableMemoryBlock', () => {
  it('returns empty when no durable active entries', () => {
    expect(
      formatDurableMemoryBlock([
        entry({ type: 'TRAVEL', label: 'Londres', isActive: true }),
        entry({ type: 'NOTE', label: 'Old', isActive: false }),
      ]),
    ).toBe('');
  });

  it('lists injury, preference and note with FR labels', () => {
    const block = formatDurableMemoryBlock([
      entry({
        type: 'INJURY',
        label: 'Genou droit',
        note: 'Éviter les descentes',
        startDate: '2026-10-01',
        endDate: '2026-10-20',
      }),
      entry({ type: 'PREFERENCE', label: 'Pas de séances après 20 h' }),
      entry({ type: 'NOTE', label: 'Préfère la piste le mardi' }),
    ]);

    expect(block).toContain('## Mémoire durable');
    expect(block).toContain('Blessure / gène');
    expect(block).toContain('Genou droit');
    expect(block).toContain('Préférence');
    expect(block).toContain('Pas de séances après 20 h');
    expect(block).toContain('Note');
  });
});
