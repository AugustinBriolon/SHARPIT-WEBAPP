import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './prisma-errors';

describe('isUniqueViolation', () => {
  it('recognises P2002 from any copy of the Prisma error class', () => {
    class OtherCopyOfPrismaError extends Error {
      code = 'P2002';
    }
    expect(isUniqueViolation(new OtherCopyOfPrismaError('Unique constraint failed'))).toBe(true);
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
