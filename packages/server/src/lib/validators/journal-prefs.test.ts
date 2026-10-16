import { describe, expect, it } from 'vitest';
import { defaultJournalPrefs } from '@sharpit/app/lib/journal/journal-prefs';
import { journalPrefsPutBodySchema, journalPrefsWriteErrorCode } from './journal-prefs';

describe('journalPrefsPutBodySchema', () => {
  it('accepts a valid prefs payload', () => {
    const prefs = defaultJournalPrefs();
    const parsed = journalPrefsPutBodySchema.safeParse({ prefs });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown top-level key', () => {
    const prefs = defaultJournalPrefs();
    const parsed = journalPrefsPutBodySchema.safeParse({
      prefs,
      athleteId: 'athlete-lea-demo',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(journalPrefsWriteErrorCode(parsed.error)).toBe('JOURNAL_PREFS_UNKNOWN_KEY');
    }
  });

  it('rejects an unknown enabled trackable key', () => {
    const prefs = defaultJournalPrefs();
    const parsed = journalPrefsPutBodySchema.safeParse({
      prefs: {
        ...prefs,
        enabled: { ...prefs.enabled, not_a_real_trackable: true },
      },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(journalPrefsWriteErrorCode(parsed.error)).toBe('JOURNAL_PREFS_UNKNOWN_KEY');
    }
  });

  it('rejects invalid types', () => {
    const prefs = defaultJournalPrefs();
    const parsed = journalPrefsPutBodySchema.safeParse({
      prefs: {
        ...prefs,
        thresholds: { ...prefs.thresholds, steps: 'dix-mille' },
      },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(journalPrefsWriteErrorCode(parsed.error)).toBe('JOURNAL_PREFS_INVALID_TYPE');
    }
  });
});
