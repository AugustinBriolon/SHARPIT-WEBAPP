import { describe, expect, it } from 'vitest';
import { LIMITER_SIGNAL_CODES } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import {
  ESSENTIAL_CLOSING_AFTER_TON_CORPS,
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
  formatLimiterChip,
  formatSupportChip,
  resolveInstruction,
  resolveVsYesterday,
  sentencesShareNoWord,
  serializeVerdictCopyGlossary,
  signalCountLabel,
  verdictCopyLogFields,
  yesterdayStateForSessionAthlete,
  type VerdictStateCode,
} from '@sharpit/server/lib/verdict/verdict-copy';
import { resolveSupportSignals } from '@sharpit/server/lib/verdict/resolve-support-signal';
import { resolveExtraLimiterFacts } from '@sharpit/server/lib/verdict/extra-limiter-facts';

const ALL_STATES: VerdictStateCode[] = [...VERDICT_STATE_CODES_ORDERED, 'INSUFFICIENT_DATA'];

const GENDERED = /\b(prêt|prête|frais|fraîche|fatigué|fatiguée)\b/i;
const PROMISE =
  /demain tu (seras|serai|vas|iras)|dans \d+ (jours?|heures?).{0,20}(récupér|fra[iî])/i;
const INFINITIVE_INSTRUCTION =
  /^(Privilégier|Réduire|Rester|Garder|Enchaîner|Réaliser|Synchroniser|Pousser)\b/;

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
    expect(LIMITER_LABEL.hrv_low).toEqual({
      essential: 'Corps pas encore récupéré',
      expert: 'VFC basse',
    });
    expect(LIMITER_LABEL.sleep_short).toEqual({
      essential: 'Nuit trop courte',
      expert: 'Sommeil court',
    });
    for (const code of SUPPORT_SIGNAL_CODES) {
      expect(SUPPORT_LABEL[code].essential.length).toBeGreaterThan(0);
      expect(SUPPORT_LABEL[code].expert.length).toBeGreaterThan(0);
    }
  });

  it('uses impératif tutoyé for every instruction (no infinitive lead)', () => {
    for (const state of ALL_STATES) {
      expect(VERDICT_INSTRUCTION[state]).not.toMatch(INFINITIVE_INSTRUCTION);
      expect(VERDICT_INSTRUCTION[state]).toMatch(
        /^(Privilégie|Baisse|Reste|Garde|Enchaîne|Fais|Synchronise|Pousse)\b/,
      );
    }
    expect(resolveInstruction('TRAIN_HARD', { trainHardOverload: true })).toMatch(/^Pousse\b/);
  });

  it('avoids gendered agreement and promised outcomes', () => {
    for (const state of ALL_STATES) {
      const copy = buildVerdictCopy(state);
      expect(copy.tag).not.toMatch(GENDERED);
      expect(copy.title).not.toMatch(GENDERED);
      expect(copy.instruction).not.toMatch(GENDERED);
      expect(copy.explanation.essential).not.toMatch(GENDERED);
      expect(copy.explanation.essential).not.toMatch(PROMISE);
      expect(copy.explanation.expert).not.toMatch(PROMISE);
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
        expect(copy.showHeadline).toBe(false);
        expect(copy.instruction).toBe(VERDICT_INSTRUCTION[state]);
        expect(copy.actionLine).toBe(copy.instruction);
        expect(copy.limiterSignals).toEqual([]);
        expect(copy.supportSignals).toEqual([]);
        expect(copy.limiterCountLabel).toBeNull();
        expect(copy.vsYesterday).toBeNull();
      });

      for (const limiter of LIMITER_SIGNAL_CODES) {
        it(`weaves limiter ${limiter} into both readings`, () => {
          const copy = buildVerdictCopy(state, { limiterSignals: [limiter] });
          expect(copy.limiterSignal).toBe(limiter);
          expect(copy.limiterSignals).toEqual([limiter]);
          expect(copy.limiterCountLabel).toBeNull();
          expect(copy.explanation.essential).not.toEqual(
            buildVerdictCopy(state).explanation.essential,
          );
          if (limiter === 'hrv_low') {
            expect(copy.explanation.essential).toMatch(/ton corps n’a pas encore récupéré/i);
            expect(copy.explanation.essential).not.toMatch(/\bVFC\b/);
            expect(copy.explanation.expert).toMatch(/ta VFC est basse/i);
          }
        });
      }
    });
  }

  it('Prudence + VFC basse + nuit courte — 2 freins, Comme hier', () => {
    const copy = buildVerdictCopy('CAUTION', {
      limiterSignals: ['hrv_low', 'sleep_short'],
      yesterdayStateCode: 'CAUTION',
    });
    expect(copy.tag).toBe('Prudence');
    expect(copy.showHeadline).toBe(false);
    expect(copy.instruction).toBe('Baisse l’intensité de la séance prévue.');
    expect(copy.vsYesterdayLabel).toBe('Comme hier');
    expect(copy.limiterSignals).toEqual(['hrv_low', 'sleep_short']);
    expect(copy.limiterSignal).toBe('hrv_low');
    expect(copy.limiterCountLabel).toBe('2 signaux');
    expect(copy.explanation.essential).toBe(
      'Ton corps n’a pas encore récupéré et ta nuit a été trop courte. Une séance facile aujourd’hui lui laisse le temps de se remettre.',
    );
    expect(copy.explanation.expert).toBe(
      'Ta VFC est basse et ton sommeil a été court. Une séance facile aujourd’hui aide ton corps à récupérer.',
    );
    const [essentialFact, essentialClosing] = copy.explanation.essential.split(/(?<=\.)\s+/);
    expect(essentialFact).toMatch(/^Ton corps\b/);
    expect(essentialClosing).toBe(
      'Une séance facile aujourd’hui lui laisse le temps de se remettre.',
    );
    expect(sentencesShareNoWord(essentialFact!, essentialClosing!)).toBe(true);
    expect(formatLimiterChip(copy.limiterSignals, 'essential')).toBe('Frein · 2 signaux');
    expect(formatLimiterChip(copy.limiterSignals, 'expert')).toBe(
      'Frein · VFC basse · Sommeil court',
    );
    expect(formatLimiterChip(['hrv_low'], 'essential')).toBe('Frein · Corps pas encore récupéré');
    expect(formatLimiterChip(['hrv_low'], 'expert')).toBe('Frein · VFC basse');
  });

  it('Essential closing after « Ton corps … » uses lui — Expert keeps aide ton corps', () => {
    for (const state of ALL_STATES) {
      const copy = buildVerdictCopy(state, { limiterSignals: ['hrv_low'] });
      expect(copy.explanation.essential.startsWith('Ton corps')).toBe(true);
      expect(copy.explanation.essential.endsWith(ESSENTIAL_CLOSING_AFTER_TON_CORPS)).toBe(true);
      const [fact, closing] = copy.explanation.essential.split(/(?<=\.)\s+/);
      expect(sentencesShareNoWord(fact!, closing!)).toBe(true);
      expect(copy.explanation.expert).not.toContain('lui laisse');
    }
    const cautionExpert = buildVerdictCopy('CAUTION', {
      limiterSignals: ['hrv_low', 'sleep_short'],
    });
    expect(cautionExpert.explanation.expert).toBe(
      'Ta VFC est basse et ton sommeil a été court. Une séance facile aujourd’hui aide ton corps à récupérer.',
    );
  });
});

describe('signalCountLabel / chips', () => {
  it('returns null below 2 and a French count from 2', () => {
    expect(signalCountLabel(0)).toBeNull();
    expect(signalCountLabel(1)).toBeNull();
    expect(signalCountLabel(2)).toBe('2 signaux');
    expect(signalCountLabel(3)).toBe('3 signaux');
  });

  it('formats support chips the same way', () => {
    expect(formatSupportChip(['hrv_ok'], 'essential')).toBe('Porté par · Corps bien récupéré');
    expect(formatSupportChip(['hrv_ok', 'sleep_adequate'], 'essential')).toBe(
      'Porté par · 2 signaux',
    );
    expect(formatSupportChip(['hrv_ok', 'sleep_adequate'], 'expert')).toBe(
      'Porté par · VFC dans la norme · Sommeil suffisant',
    );
  });
});

describe('resolveSupportSignals / extraLimiterFacts', () => {
  it('returns multiple supports when several facts hold', () => {
    expect(
      resolveSupportSignals({
        hints: {
          hrv: 60,
          hrvBaselineLow: 50,
          hrvBaselineHigh: 70,
          sleepMinutes: 480,
          sleepTargetMinutes: 480,
          sleepDeepMin: 120,
          sleepRemMin: 120,
        },
      }),
    ).toEqual(['hrv_ok', 'sleep_adequate', 'sleep_quality_ok']);
  });

  it('blocks supports that conflict with freins', () => {
    expect(
      resolveSupportSignals({
        hints: { hrv: 60, hrvBaselineLow: 50, hrvBaselineHigh: 70 },
        limiterSignals: ['hrv_low'],
      }),
    ).not.toContain('hrv_ok');
  });

  it('emits sleep_short as extra when frein is hrv_low', () => {
    expect(
      resolveExtraLimiterFacts({
        primary: 'hrv_low',
        hints: { sleepMinutes: 300, sleepTargetMinutes: 480 },
      }),
    ).toContain('sleep_short');
  });
});

describe('yesterday security — session athlete only', () => {
  it('never reads another athlete’s yesterday verdict', () => {
    const yesterdayByAthlete = new Map<string, VerdictStateCode>([
      ['athlete-session', 'CAUTION'],
      ['athlete-other', 'TRAIN_HARD'],
    ]);

    const sessionYesterday = yesterdayStateForSessionAthlete({
      sessionAthleteId: 'athlete-session',
      yesterdayByAthlete,
    });
    expect(sessionYesterday).toBe('CAUTION');

    const copy = buildVerdictCopy('CAUTION', { yesterdayStateCode: sessionYesterday });
    expect(copy.vsYesterday).toBe('same');
    expect(copy.vsYesterdayLabel).toBe(VS_YESTERDAY_LABEL.same);

    // If the lookup incorrectly used the other athlete, vsYesterday would flip.
    const leaked = yesterdayStateForSessionAthlete({
      sessionAthleteId: 'athlete-other',
      yesterdayByAthlete,
    });
    expect(leaked).toBe('TRAIN_HARD');
    expect(buildVerdictCopy('CAUTION', { yesterdayStateCode: leaked }).vsYesterday).toBe('changed');

    // Unknown athlete → null (never fall back to another row).
    expect(
      yesterdayStateForSessionAthlete({
        sessionAthleteId: 'athlete-unknown',
        yesterdayByAthlete,
      }),
    ).toBeNull();
  });

  it('documents repository contract: lookup key is session athleteId + yesterday day', () => {
    const calls: Array<{ athleteId: string; trainingDayId: string }> = [];
    const repo = {
      getLatestAthleteSnapshot(params: { athleteId: string; trainingDayId: string }) {
        calls.push(params);
        if (params.athleteId === 'A' && params.trainingDayId === '2026-10-14') {
          return { todaysDecision: 'CAUTION' as VerdictStateCode };
        }
        if (params.athleteId === 'B' && params.trainingDayId === '2026-10-14') {
          return { todaysDecision: 'TRAIN_HARD' as VerdictStateCode };
        }
        return null;
      },
    };

    const sessionAthleteId = 'A';
    const yesterdayId = '2026-10-14';
    const row = repo.getLatestAthleteSnapshot({
      athleteId: sessionAthleteId,
      trainingDayId: yesterdayId,
    });
    expect(calls).toEqual([{ athleteId: 'A', trainingDayId: '2026-10-14' }]);
    expect(calls.every((c) => c.athleteId === sessionAthleteId)).toBe(true);
    expect(row?.todaysDecision).toBe('CAUTION');
    expect(row?.todaysDecision).not.toBe('TRAIN_HARD');
  });
});

describe('privacy helpers', () => {
  it('log fields expose codes/bools only — no explanation prose', () => {
    const copy = buildVerdictCopy('CAUTION', { limiterSignals: ['hrv_low', 'sleep_short'] });
    const log = verdictCopyLogFields(copy);
    expect(JSON.stringify(log)).not.toMatch(/corps|nuit|baisse|récupér/i);
    expect(log.limiterSignalCount).toBe(2);
    expect(log.showHeadline).toBe(false);
  });

  it('coach displayMode lines ask for tutoiement and ban promises', () => {
    expect(formatDisplayModeCoachLine('essential')).toMatch(/Tutoie/i);
    expect(formatDisplayModeCoachLine('essential')).toMatch(/Ne promets jamais/i);
    expect(formatDisplayModeCoachLine('expert')).toMatch(/Ne promets jamais/i);
  });
});

describe('resolveVsYesterday', () => {
  it('returns null without yesterday', () => {
    expect(resolveVsYesterday('RECOVER', null)).toBeNull();
  });
});

describe('serializeVerdictCopyGlossary', () => {
  it('exports a versioned snapshot shape with tone + count labels', () => {
    const snap = serializeVerdictCopyGlossary();
    expect(snap.version).toBe(2);
    expect(snap.showHeadline).toBe(false);
    expect(snap.tone.address).toBe('tutoiement');
    expect(snap.limiterCountLabel.minCount).toBe(2);
    expect(snap.instructions.CAUTION).toBe('Baisse l’intensité de la séance prévue.');
  });
});

describe('EXPERT_ACRONYMS coverage', () => {
  it('keeps essential limiter chip labels free of expert acronyms', () => {
    for (const code of LIMITER_SIGNAL_CODES) {
      for (const acronym of EXPERT_ACRONYMS) {
        expect(LIMITER_LABEL[code].essential).not.toMatch(new RegExp(`\\b${acronym}\\b`));
      }
    }
  });
});
