import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/server/lib/journal/wellness-checkin', () => ({
  resolveAthleteTrainingDayTimeZone: vi.fn().mockResolvedValue('Europe/Paris'),
}));

import { resolveAthleteTrainingDayTimeZone } from '@sharpit/server/lib/journal/wellness-checkin';
import { resolveAllowedTrainingDayId } from './training-day-window';
import { addTrainingDays, trainingDayIdForNow } from '@sharpit/core/training/training-day';

/** Demo athlete Léa — never a production id in tests. */
const LEA = 'athlete-lea-demo';

describe('resolveAllowedTrainingDayId', () => {
  const now = new Date('2026-10-15T10:00:00+02:00');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAthleteTrainingDayTimeZone).mockResolvedValue('Europe/Paris');
  });

  it('accepts today in the athlete timezone', async () => {
    const today = trainingDayIdForNow({ timezone: 'Europe/Paris' }, now);
    const result = await resolveAllowedTrainingDayId(LEA, today, now);
    expect(result).toEqual({ ok: true, trainingDayId: today });
  });

  it('accepts yesterday in the athlete timezone', async () => {
    const today = trainingDayIdForNow({ timezone: 'Europe/Paris' }, now);
    const yesterday = addTrainingDays(today, -1);
    const result = await resolveAllowedTrainingDayId(LEA, yesterday, now);
    expect(result).toEqual({ ok: true, trainingDayId: yesterday });
  });

  it('defaults to today when candidate is omitted', async () => {
    const today = trainingDayIdForNow({ timezone: 'Europe/Paris' }, now);
    const result = await resolveAllowedTrainingDayId(LEA, null, now);
    expect(result).toEqual({ ok: true, trainingDayId: today });
  });

  it('rejects the day before yesterday', async () => {
    const today = trainingDayIdForNow({ timezone: 'Europe/Paris' }, now);
    const beforeYesterday = addTrainingDays(today, -2);
    const result = await resolveAllowedTrainingDayId(LEA, beforeYesterday, now);
    expect(result).toEqual({ ok: false, code: 'TRAINING_DAY_OUT_OF_RANGE' });
  });

  it('rejects a future day', async () => {
    const today = trainingDayIdForNow({ timezone: 'Europe/Paris' }, now);
    const tomorrow = addTrainingDays(today, 1);
    const result = await resolveAllowedTrainingDayId(LEA, tomorrow, now);
    expect(result).toEqual({ ok: false, code: 'TRAINING_DAY_OUT_OF_RANGE' });
  });

  it('rejects a malformed day id', async () => {
    const result = await resolveAllowedTrainingDayId(LEA, '15/10/2026', now);
    expect(result).toEqual({ ok: false, code: 'INVALID_TRAINING_DAY_FORMAT' });
  });

  it('uses the session athlete timezone, not a client athlete id', async () => {
    vi.mocked(resolveAthleteTrainingDayTimeZone).mockResolvedValue('America/New_York');
    const todayNy = trainingDayIdForNow({ timezone: 'America/New_York' }, now);
    const result = await resolveAllowedTrainingDayId(LEA, todayNy, now);
    expect(resolveAthleteTrainingDayTimeZone).toHaveBeenCalledWith(LEA);
    expect(result).toEqual({ ok: true, trainingDayId: todayNy });
  });
});
