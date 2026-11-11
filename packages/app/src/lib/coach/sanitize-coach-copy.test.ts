import { describe, expect, it } from 'vitest';
import {
  COACH_COPY_DASH_RULE,
  COACH_COPY_STYLE_RULE,
  sanitizeCoachCopy,
  sanitizeCoachCopyFields,
  stripAiDashes,
} from '@sharpit/app/lib/coach/sanitize-coach-copy';

describe('sanitizeCoachCopy', () => {
  it('removes em dash clause joiners (FR coach voice)', () => {
    expect(sanitizeCoachCopy('Journée active — récupère bien')).toBe(
      'Journée active. Récupère bien',
    );
  });

  it('removes en dash clause joiners', () => {
    expect(sanitizeCoachCopy('Sommeil court – priorise la récup')).toBe(
      'Sommeil court. Priorise la récup',
    );
  });

  it('removes spaced ASCII hyphen clause separators', () => {
    expect(sanitizeCoachCopy('Charge élevée - allège la séance')).toBe(
      'Charge élevée. Allège la séance',
    );
  });

  it('preserves compound hyphens in French words', () => {
    expect(sanitizeCoachCopy('Ta séance de course-à-pied reste pertinente.')).toBe(
      'Ta séance de course-à-pied reste pertinente.',
    );
  });

  it('preserves numeric ranges (including en/em dash ranges)', () => {
    expect(sanitizeCoachCopy('Vise 2-3 séances qualité cette semaine.')).toBe(
      'Vise 2-3 séances qualité cette semaine.',
    );
    expect(sanitizeCoachCopy('Créneau 06:00–21:00 si besoin.')).toBe(
      'Créneau 06:00-21:00 si besoin.',
    );
    expect(sanitizeCoachCopy('Fenêtre 10—12 min de travail.')).toBe(
      'Fenêtre 10-12 min de travail.',
    );
  });

  it('does not rewrite markdown list markers', () => {
    const md = 'Points clés :\n- sommeil court\n- charge élevée';
    expect(sanitizeCoachCopy(md)).toBe(md);
  });

  it('collapses awkward double spaces after replacement', () => {
    expect(sanitizeCoachCopy('OK  —  continue')).toBe('OK. Continue');
  });

  it('does not capitalize after existing periods (abbrev. safe)', () => {
    expect(sanitizeCoachCopy('Vise 40 min. de footing facile.')).toBe(
      'Vise 40 min. de footing facile.',
    );
  });

  it('is a no-op for clean copy', () => {
    expect(sanitizeCoachCopy('Bonne séance. Récupère bien ce soir.')).toBe(
      'Bonne séance. Récupère bien ce soir.',
    );
  });

  it('handles empty input', () => {
    expect(sanitizeCoachCopy('')).toBe('');
  });

  it('exposes stripAiDashes as an alias', () => {
    expect(stripAiDashes('A — B')).toBe(sanitizeCoachCopy('A — B'));
  });

  it('documents the dash rule for prompts', () => {
    expect(COACH_COPY_DASH_RULE).toContain('tiret cadratin');
    expect(COACH_COPY_DASH_RULE).toContain('phrase - phrase');
  });

  it('bundles dash + humanizer rules for athlete-facing prompts', () => {
    expect(COACH_COPY_STYLE_RULE).toContain('tiret cadratin');
    expect(COACH_COPY_STYLE_RULE).toContain('STYLE HUMAIN');
    expect(COACH_COPY_STYLE_RULE).toContain("ce n'est pas X");
  });
});

describe('sanitizeCoachCopyFields', () => {
  it('sanitizes listed string and string[] fields', () => {
    const input = {
      headline: 'Sortie longue — bien gérée',
      remarks: ['Durée conforme - bonne exécution', 'ok'],
      score: 90,
    };
    expect(sanitizeCoachCopyFields(input, ['headline', 'remarks'] as const)).toEqual({
      headline: 'Sortie longue. Bien gérée',
      remarks: ['Durée conforme. Bonne exécution', 'ok'],
      score: 90,
    });
  });
});
