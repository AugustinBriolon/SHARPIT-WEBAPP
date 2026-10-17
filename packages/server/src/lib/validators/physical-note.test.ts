import { describe, expect, it } from 'vitest';
import {
  createCheckinSchema,
  createPhysicalNoteSchema,
  PHYSICAL_NOTE_LIMITS,
  updatePhysicalNoteSchema,
} from '@sharpit/server/lib/validators/physical-note';

const text = (length: number) => 'x'.repeat(length);

describe('physical note text limits', () => {
  it('accepts every field at its limit', () => {
    const parsed = createPhysicalNoteSchema.safeParse({
      category: 'PAIN',
      title: text(PHYSICAL_NOTE_LIMITS.title),
      bodyPart: text(PHYSICAL_NOTE_LIMITS.bodyPart),
      description: text(PHYSICAL_NOTE_LIMITS.description),
    });
    expect(parsed.success).toBe(true);
  });

  it.each(['title', 'bodyPart', 'description'] as const)('refuses a %s past its limit', (field) => {
    const note = {
      category: 'PAIN',
      title: 'Genou',
      [field]: text(PHYSICAL_NOTE_LIMITS[field] + 1),
    };
    expect(createPhysicalNoteSchema.safeParse(note).success).toBe(false);
    expect(updatePhysicalNoteSchema.safeParse({ [field]: note[field] }).success).toBe(false);
  });

  it('refuses a check-in comment past its limit', () => {
    const comment = text(PHYSICAL_NOTE_LIMITS.checkinComment + 1);
    expect(createCheckinSchema.safeParse({ comment }).success).toBe(false);
  });
});
