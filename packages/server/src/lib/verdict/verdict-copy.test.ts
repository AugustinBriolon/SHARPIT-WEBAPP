import { describe, expect, it } from 'vitest';
import { LIMITER_SIGNAL_CODES } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import {
  EXPERT_ACRONYMS,
  LIMITER_LABEL,
  SUPPORT_LABEL,
  SUPPORT_SIGNAL_CODES,
  VERDICT_INSTRUCTION,
  VERDICT_STATE_CODES_ORDERED,
  VERDICT_TAG,
  VERDICT_TITLE,
  VS_YESTERDAY_LABEL,
  buildVerdictCopy,
  formatDisplayModeCoachLine,
  limiterChipLabel,
  resolveInstruction,
  resolveVsYesterday,
  serializeVerdictCopyGlossary,
  supportChipLabel,
  verdictCopyLogFields,
  type VerdictStateCode,
} from '@sharpit/server/lib/verdict/verdict-copy';
import { resolveSupportSignal } from '@sharpit/server/lib/verdict/resolve-support-signal';
import { resolveExtraLimiterFacts } from '@sharpit/server/lib/verdict/extra-limiter-facts';

const ALL_STATES: VerdictStateCode[] = [...VERDICT_STATE_CODES_ORDERED, 'INSUFFICIENT_DATA'];

const GENDERED = /\b(prêt|prête|frais|fraîche|fatigué|fatiguée|alléger|tu es)\b/i;

describe('verdict-copy glossary', () => {
  it('orders tags soft → strong and keeps En attente apart', () => {
    expect(VERDICT_STATE_CODES_ORDERED.map((c) => VERDICT_TAG[c])).toEqual([
      'Repos',
      'Prudence',
      'Léger',
      'Qualité',
      'Intense',
      'Pic',
    ]);
    expect(VERDICT_TAG.INSUFFICIENT_DATA).toBe('En attente');
  });

  it('defines essential/expert pairs for every limiter and support', () => {
    for (const code of LIMITER_SIGNAL_CODES) {
      expect(LIMITER_LABEL[code].essential.length).toBeGreaterThan(0);
      expect(LIMITER_LABEL[code].expert.length).toBeGreaterThan(0);
      expect(LIMITER_LABEL[code].essential).not.toBe(LIMITER_LABEL[code].expert);
    }
    expect(LIMITER_LABEL.hrv_low).toEqual({
      essential: 'Corps pas encore récupéré',
      expert: 'VFC basse',
    });
    expect(LIMITER_LABEL.rhr_high).toEqual({
      essential: 'Cœur plus rapide au repos',
      expert: 'FC repos haute',
    });
    expect(LIMITER_LABEL.sleep_short).toEqual({
      essential: 'Nuit trop courte',
      expert: 'Sommeil court',
    });
    expect(LIMITER_LABEL.sleep_poor).toEqual({
      essential: 'Nuit agitée',
      expert: 'Sommeil agité',
    });
    expect(LIMITER_LABEL.subjective_low).toEqual({
      essential: 'Fatigue ressentie',
      expert: 'Ressenti bas',
    });
    expect(LIMITER_LABEL.load_elevated).toEqual({
      essential: 'Grosse semaine d’entraînement',
      expert: 'Charge élevée',
    });

    for (const code of SUPPORT_SIGNAL_CODES) {
      expect(SUPPORT_LABEL[code].essential.length).toBeGreaterThan(0);
      expect(SUPPORT_LABEL[code].expert.length).toBeGreaterThan(0);
    }
  });

  it('keeps essential limiter labels free of expert acronyms', () => {
    for (const code of LIMITER_SIGNAL_CODES) {
      const label = LIMITER_LABEL[code].essential;
      for (const acronym of EXPERT_ACRONYMS) {
        expect(label).not.toMatch(new RegExp(`\\b${acronym}\\b`));
      }
    }
  });

  it('avoids gendered agreement in tags, titles, instructions', () => {
    for (const state of ALL_STATES) {
      expect(VERDICT_TAG[state]).not.toMatch(GENDERED);
      expect(VERDICT_TITLE[state]).not.toMatch(GENDERED);
      expect(VERDICT_INSTRUCTION[state]).not.toMatch(GENDERED);
    }
  });
});

describe('buildVerdictCopy — every state', () => {
  for (const state of ALL_STATES) {
    describe(state, () => {
      it('builds tag / title / instruction / dual explanation without data', () => {
        const copy = buildVerdictCopy(state);
        expect(copy.tag).toBe(VERDICT_TAG[state]);
        expect(copy.title).toBe(VERDICT_TITLE[state]);
        expect(copy.instruction).toBe(VERDICT_INSTRUCTION[state]);
        expect(copy.actionLine).toBe(copy.instruction);
        expect(copy.explanation.essential.length).toBeGreaterThan(0);
        expect(copy.explanation.expert.length).toBeGreaterThan(0);
        expect(copy.limiterSignal).toBeNull();
        expect(copy.supportSignal).toBeNull();
        expect(copy.vsYesterday).toBeNull();
        expect(copy.explanation.essential).not.toMatch(GENDERED);
        expect(copy.explanation.expert.split('.').length).toBeLessThanOrEqual(3);
      });

      for (const limiter of LIMITER_SIGNAL_CODES) {
        it(`weaves limiter ${limiter} into both readings`, () => {
          const copy = buildVerdictCopy(state, { limiterSignal: limiter });
          expect(copy.limiterSignal).toBe(limiter);
          // Fact fragment is present in both readings (not inventing empty prose).
          expect(copy.explanation.essential.length).toBeGreaterThan(
            buildVerdictCopy(state).explanation.essential.length - 5,
          );
          expect(copy.explanation.essential).not.toEqual(
            buildVerdictCopy(state).explanation.essential,
          );
          if (limiter === 'hrv_low') {
            expect(copy.explanation.essential).not.toMatch(/\bVFC\b/);
            expect(copy.explanation.expert).toMatch(/VFC/i);
          }
          if (limiter === 'sleep_short') {
            expect(copy.explanation.essential).toMatch(/nuit/i);
            expect(copy.explanation.expert).toMatch(/sommeil/i);
          }
        });
      }

      for (const support of SUPPORT_SIGNAL_CODES) {
        it(`weaves support ${support} when present`, () => {
          const copy = buildVerdictCopy(state, { supportSignal: support });
          expect(copy.supportSignal).toBe(support);
          expect(copy.explanation.essential.length).toBeGreaterThan(10);
        });
      }

      it('marks Comme hier when yesterday matches', () => {
        const copy = buildVerdictCopy(state, { yesterdayStateCode: state });
        expect(copy.vsYesterday).toBe('same');
        expect(copy.vsYesterdayLabel).toBe(VS_YESTERDAY_LABEL.same);
      });

      it('marks Changé depuis hier when yesterday differs', () => {
        const other: VerdictStateCode = state === 'RECOVER' ? 'TRAIN_HARD' : 'RECOVER';
        const copy = buildVerdictCopy(state, { yesterdayStateCode: other });
        expect(copy.vsYesterday).toBe('changed');
        expect(copy.vsYesterdayLabel).toBe(VS_YESTERDAY_LABEL.changed);
      });
    });
  }

  it('Prudence + VFC basse + nuit courte — concrete card fixture', () => {
    const copy = buildVerdictCopy('CAUTION', {
      limiterSignal: 'hrv_low',
      extraLimiterFacts: ['sleep_short'],
      yesterdayStateCode: 'CAUTION',
    });
    expect(copy.tag).toBe('Prudence');
    expect(copy.title).toBe('Signaux à ménager');
    expect(copy.instruction).toBe('Réduire l’intensité prévue.');
    expect(copy.vsYesterdayLabel).toBe('Comme hier');
    expect(copy.explanation.essential).toMatch(/corps n’a pas encore récupéré/i);
    expect(copy.explanation.essential).toMatch(/nuit a été trop courte/i);
    expect(copy.explanation.essential).not.toMatch(/\bVFC\b|\bFC\b/);
    expect(copy.explanation.expert).toMatch(/VFC/i);
    expect(copy.explanation.expert).toMatch(/sommeil a été court/i);
    expect(limiterChipLabel('hrv_low', 'essential')).toBe('Frein · Corps pas encore récupéré');
    expect(limiterChipLabel('hrv_low', 'expert')).toBe('Frein · VFC basse');
  });

  it('TRAIN_HARD overload instruction when adaptation fact is set', () => {
    expect(resolveInstruction('TRAIN_HARD', { trainHardOverload: true })).toMatch(/séance clé/i);
    expect(resolveInstruction('TRAIN_HARD', { trainHardOverload: false })).toMatch(/engagement/i);
  });
});

describe('resolveSupportSignal / extraLimiterFacts — fact gated', () => {
  it('returns null without hints', () => {
    expect(resolveSupportSignal({})).toBeNull();
    expect(resolveExtraLimiterFacts({ primary: null })).toEqual([]);
  });

  it('emits hrv_ok only when HRV is in band', () => {
    expect(
      resolveSupportSignal({
        hints: { hrv: 60, hrvBaselineLow: 50, hrvBaselineHigh: 70 },
      }),
    ).toBe('hrv_ok');
    expect(
      resolveSupportSignal({
        hints: { hrv: 40, hrvBaselineLow: 50, hrvBaselineHigh: 70 },
        limiterSignal: 'hrv_low',
      }),
    ).toBeNull();
  });

  it('emits sleep_short as extra when frein is hrv_low', () => {
    expect(
      resolveExtraLimiterFacts({
        primary: 'hrv_low',
        hints: { sleepMinutes: 300, sleepTargetMinutes: 480 },
      }),
    ).toContain('sleep_short');
  });

  it('does not invent sleep_short without sleep minutes', () => {
    expect(
      resolveExtraLimiterFacts({
        primary: 'hrv_low',
        hints: {},
      }),
    ).not.toContain('sleep_short');
  });
});

describe('privacy helpers', () => {
  it('log fields expose codes/bools only — no explanation prose', () => {
    const copy = buildVerdictCopy('CAUTION', { limiterSignal: 'hrv_low' });
    const log = verdictCopyLogFields(copy);
    expect(JSON.stringify(log)).not.toMatch(/récupéré|prudence|réduire/i);
    expect(log.stateCode).toBe('CAUTION');
    expect(log.limiterSignal).toBe('hrv_low');
    expect(log.hasExplanation).toBe(true);
  });

  it('coach displayMode lines differ for essential vs expert', () => {
    expect(formatDisplayModeCoachLine('essential')).toMatch(/aucun acronyme/i);
    expect(formatDisplayModeCoachLine('expert')).toMatch(/autorisés/i);
  });
});

describe('resolveVsYesterday', () => {
  it('returns null without yesterday', () => {
    expect(resolveVsYesterday('RECOVER', null)).toBeNull();
    expect(resolveVsYesterday('RECOVER', undefined)).toBeNull();
  });
});

describe('chip helpers', () => {
  it('builds Frein and Porté par chips for both densities', () => {
    expect(supportChipLabel('sleep_adequate', 'essential')).toBe('Porté par · Nuit suffisante');
    expect(supportChipLabel('sleep_adequate', 'expert')).toBe('Porté par · Sommeil suffisant');
  });
});

describe('serializeVerdictCopyGlossary', () => {
  it('exports a versioned snapshot shape', () => {
    const snap = serializeVerdictCopyGlossary();
    expect(snap.version).toBe(1);
    expect(snap.tags.RECOVER).toBe('Repos');
    expect(snap.limiterSignals.hrv_low.essential).toBe('Corps pas encore récupéré');
    expect(snap.supportSignals.hrv_ok.expert).toBe('VFC dans la norme');
  });
});
