import { describe, expect, it } from 'vitest';
import {
  carnetHref,
  countdownLabel,
  dayIdOf,
  dayOf,
  resolveDayParam,
  weekLabel,
  weekStartsEndingAt,
} from './carnet-time';

describe('resolveDayParam', () => {
  it('keeps a valid past day', () => {
    expect(resolveDayParam('2026-10-01', '2026-10-05')).toBe('2026-10-01');
  });

  it('falls back to today for a future, malformed or missing day', () => {
    expect(resolveDayParam('2026-10-09', '2026-10-05')).toBe('2026-10-05');
    expect(resolveDayParam('hier', '2026-10-05')).toBe('2026-10-05');
    expect(resolveDayParam(undefined, '2026-10-05')).toBe('2026-10-05');
  });
});

describe('weekStartsEndingAt', () => {
  it('returns the Mondays ending with the week of the day, oldest first', () => {
    const weeks = weekStartsEndingAt(dayOf('2026-10-07'), 3).map(dayIdOf);
    expect(weeks).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
  });
});

describe('weekLabel', () => {
  it('names the month once inside a month and twice across two', () => {
    expect(weekLabel(dayOf('2026-10-05'))).toBe('5 – 11 oct.');
    expect(weekLabel(dayOf('2026-09-28'))).toBe('28 sept. – 4 oct.');
  });
});

describe('countdownLabel', () => {
  const today = dayOf('2026-10-05');

  it('words the gap to a day', () => {
    expect(countdownLabel(dayOf('2026-10-05'), today)).toBe("aujourd'hui");
    expect(countdownLabel(dayOf('2026-10-06'), today)).toBe('demain');
    expect(countdownLabel(dayOf('2026-10-17'), today)).toBe('dans 12 jours');
    expect(countdownLabel(dayOf('2027-03-01'), today)).toBe('dans 21 semaines');
    expect(countdownLabel(dayOf('2026-10-02'), today)).toBe('il y a 3 jours');
  });
});

describe('carnetHref', () => {
  it('sends a recorded session to its page in the carnet', () => {
    expect(carnetHref('/activite/abc123')).toBe('/seances/abc123');
  });

  it('maps a reading page and drops anything that acts', () => {
    expect(carnetHref('/plan/charge?date=2026-10-05')).toBe('/saison');
    expect(carnetHref('/activite/nouvelle')).toBeNull();
    expect(carnetHref('/settings/integrations')).toBeNull();
    expect(carnetHref(null)).toBeNull();
  });
});
