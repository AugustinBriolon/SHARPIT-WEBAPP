/**
 * Shared morning-verdict glossary — single source for the Today card and the Coach.
 *
 * ADR-023: the server never picks essential vs expert. It returns both variants;
 * the client (and Coach prompt) choose from the athlete's displayMode.
 *
 * Rules (AUDIT_VERDICT_COPY_MATIN R1–R8, refined):
 * - Stable state codes; tags soft→strong: Repos → Prudence → Léger → Qualité → Intense → Pic
 * - « En attente » is separate (INSUFFICIENT_DATA)
 * - No gendered agreement; no invented facts; no jargon in essential
 * - Explanation never goes to MORNING_VERDICT push or logs (codes/bools only)
 */

import type { OverallVerdict } from '@sharpit/app/lib/today/dashboard/today-mapping';
import type { LimiterSignalCode } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import { LIMITER_SIGNAL_CODES } from '@sharpit/app/lib/today/dashboard/limiter-signal';

// ─── Stable codes ────────────────────────────────────────────────────────────

/** Softest → strongest orientation (excluding pending). */
export const VERDICT_STATE_CODES_ORDERED = [
  'RECOVER',
  'CAUTION',
  'TRAIN_EASY',
  'TRAIN_SMART',
  'TRAIN_HARD',
  'RACE_READY',
] as const satisfies readonly Exclude<OverallVerdict, 'INSUFFICIENT_DATA'>[];

export type VerdictStateCode = OverallVerdict;

export const SUPPORT_SIGNAL_CODES = [
  'hrv_ok',
  'rhr_ok',
  'sleep_adequate',
  'sleep_quality_ok',
  'subjective_ok',
  'load_managed',
] as const;

export type SupportSignalCode = (typeof SUPPORT_SIGNAL_CODES)[number];

export type DensityPair = {
  essential: string;
  expert: string;
};

export type VsYesterdayCode = 'same' | 'changed';

// ─── Tags (athlete-facing, density-invariant) ────────────────────────────────

export const VERDICT_TAG: Record<VerdictStateCode, string> = {
  RECOVER: 'Repos',
  CAUTION: 'Prudence',
  TRAIN_EASY: 'Léger',
  TRAIN_SMART: 'Qualité',
  TRAIN_HARD: 'Intense',
  RACE_READY: 'Pic',
  INSUFFICIENT_DATA: 'En attente',
};

/** Short title under the tag — not the instruction, not the explanation. */
export const VERDICT_TITLE: Record<VerdictStateCode, string> = {
  RECOVER: 'Priorité au repos',
  CAUTION: 'Signaux à ménager',
  TRAIN_EASY: 'Journée légère',
  TRAIN_SMART: 'Journée qualité',
  TRAIN_HARD: 'Journée propice à l’effort',
  RACE_READY: 'Fenêtre de performance',
  INSUFFICIENT_DATA: 'Pas encore de verdict fiable',
};

/**
 * Short instruction — plain text, no Markdown/HTML, gender-neutral.
 * Infinitive form avoids gendered agreement.
 */
export const VERDICT_INSTRUCTION: Record<VerdictStateCode, string> = {
  RECOVER: 'Privilégier le repos ou une marche très légère.',
  CAUTION: 'Réduire l’intensité prévue.',
  TRAIN_EASY: 'Rester en endurance facile.',
  TRAIN_SMART: 'Garder la qualité, couper le volume.',
  TRAIN_HARD: 'Enchaîner la séance prévue avec engagement.',
  RACE_READY: 'Réaliser la séance qualité prévue.',
  INSUFFICIENT_DATA: 'Synchroniser la nuit avant de décider.',
};

/** TRAIN_HARD when adaptation is positively adapting — fact-gated variant. */
export const VERDICT_INSTRUCTION_TRAIN_HARD_OVERLOAD =
  'Pousser la séance clé avec une progression mesurée.';

export const VS_YESTERDAY_LABEL: Record<VsYesterdayCode, string> = {
  same: 'Comme hier',
  changed: 'Changé depuis hier',
};

// ─── Limiter chip pairs (Essentiel / Expert) ─────────────────────────────────

export const LIMITER_LABEL: Record<LimiterSignalCode, DensityPair> = {
  hrv_low: {
    essential: 'Corps pas encore récupéré',
    expert: 'VFC basse',
  },
  rhr_high: {
    essential: 'Cœur plus rapide au repos',
    expert: 'FC repos haute',
  },
  sleep_short: {
    essential: 'Nuit trop courte',
    expert: 'Sommeil court',
  },
  sleep_poor: {
    essential: 'Nuit agitée',
    expert: 'Sommeil agité',
  },
  subjective_low: {
    essential: 'Fatigue ressentie',
    expert: 'Ressenti bas',
  },
  load_elevated: {
    essential: 'Grosse semaine d’entraînement',
    expert: 'Charge élevée',
  },
};

// ─── Support (« Porté par ») chip pairs ──────────────────────────────────────

export const SUPPORT_LABEL: Record<SupportSignalCode, DensityPair> = {
  hrv_ok: {
    essential: 'Corps bien récupéré',
    expert: 'VFC dans la norme',
  },
  rhr_ok: {
    essential: 'Cœur calme au repos',
    expert: 'FC repos normale',
  },
  sleep_adequate: {
    essential: 'Nuit suffisante',
    expert: 'Sommeil suffisant',
  },
  sleep_quality_ok: {
    essential: 'Nuit réparatrice',
    expert: 'Sommeil de qualité',
  },
  subjective_ok: {
    essential: 'Bonne forme ressentie',
    expert: 'Ressenti élevé',
  },
  load_managed: {
    essential: 'Charge bien gérée',
    expert: 'Charge maîtrisée',
  },
};

export const LIMITER_CHIP_PREFIX = 'Frein';
export const SUPPORT_CHIP_PREFIX = 'Porté par';

// ─── Fact fragments for explanations (only when the fact is present) ─────────

const LIMITER_EXPLANATION_FRAGMENT: Record<LimiterSignalCode, DensityPair> = {
  hrv_low: {
    essential: 'le corps n’a pas encore récupéré',
    expert: 'la VFC est basse',
  },
  rhr_high: {
    essential: 'le cœur bat plus vite au repos',
    expert: 'la FC de repos est haute',
  },
  sleep_short: {
    essential: 'la nuit a été trop courte',
    expert: 'le sommeil a été court',
  },
  sleep_poor: {
    essential: 'la nuit a été agitée',
    expert: 'le sommeil a été agité',
  },
  subjective_low: {
    essential: 'la fatigue ressentie est marquée',
    expert: 'le ressenti est bas',
  },
  load_elevated: {
    essential: 'la semaine d’entraînement a été lourde',
    expert: 'la charge est élevée',
  },
};

const SUPPORT_EXPLANATION_FRAGMENT: Record<SupportSignalCode, DensityPair> = {
  hrv_ok: {
    essential: 'le corps a bien récupéré',
    expert: 'la VFC est dans la norme',
  },
  rhr_ok: {
    essential: 'le cœur reste calme au repos',
    expert: 'la FC de repos est normale',
  },
  sleep_adequate: {
    essential: 'la nuit a été suffisante',
    expert: 'le sommeil a été suffisant',
  },
  sleep_quality_ok: {
    essential: 'la nuit a été réparatrice',
    expert: 'le sommeil a été de qualité',
  },
  subjective_ok: {
    essential: 'la forme ressentie est bonne',
    expert: 'le ressenti est élevé',
  },
  load_managed: {
    essential: 'la charge reste bien gérée',
    expert: 'la charge est maîtrisée',
  },
};

const ORIENTATION_CLOSING: Record<VerdictStateCode, DensityPair> = {
  RECOVER: {
    essential: 'Le repos est la priorité aujourd’hui.',
    expert: 'Le repos est la priorité aujourd’hui.',
  },
  CAUTION: {
    essential: 'Les signaux appellent à la prudence.',
    expert: 'Les signaux appellent à la prudence.',
  },
  TRAIN_EASY: {
    essential: 'Une séance légère reste adaptée.',
    expert: 'Une séance légère reste adaptée.',
  },
  TRAIN_SMART: {
    essential: 'Mieux vaut viser la qualité que le volume.',
    expert: 'Mieux vaut viser la qualité que le volume.',
  },
  TRAIN_HARD: {
    essential: 'Le corps peut encaisser une séance exigeante.',
    expert: 'Le corps peut encaisser une séance exigeante.',
  },
  RACE_READY: {
    essential: 'La forme est alignée pour performer.',
    expert: 'La forme est alignée pour une séance de pic.',
  },
  INSUFFICIENT_DATA: {
    essential: 'Il manque encore des signaux pour trancher.',
    expert: 'Il manque encore des signaux pour trancher.',
  },
};

/** Expert-mode acronyms the Coach must avoid in essential reading. */
export const EXPERT_ACRONYMS = [
  'VFC',
  'HRV',
  'FC',
  'TSS',
  'ACWR',
  'CTL',
  'ATL',
  'TSB',
  'IF',
  'NP',
  'VI',
  'RPE',
  'FTP',
  'LTHR',
  'CSS',
] as const;

// ─── Builders ────────────────────────────────────────────────────────────────

export type VerdictCopyFacts = {
  /** Primary frein — only when calculated. */
  limiterSignal?: LimiterSignalCode | null;
  /** Extra limiter-like facts to weave in (e.g. short night when frein is HRV). */
  extraLimiterFacts?: readonly LimiterSignalCode[];
  /** Positive support chip — only when calculated. */
  supportSignal?: SupportSignalCode | null;
  /** TRAIN_HARD overload path when adaptation is positively adapting. */
  trainHardOverload?: boolean;
  /** Yesterday's state for the same session athlete — never another athlete. */
  yesterdayStateCode?: VerdictStateCode | null;
};

export type BuiltVerdictCopy = {
  stateCode: VerdictStateCode;
  tag: string;
  title: string;
  instruction: string;
  /** Kept for TestFlight — mirrors instruction. */
  actionLine: string;
  explanation: DensityPair;
  limiterSignal: LimiterSignalCode | null;
  supportSignal: SupportSignalCode | null;
  vsYesterday: VsYesterdayCode | null;
  vsYesterdayLabel: string | null;
};

function capitalizeFr(sentence: string): string {
  if (!sentence) {
    return sentence;
  }
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function joinFragments(fragments: string[]): string {
  if (fragments.length === 0) {
    return '';
  }
  if (fragments.length === 1) {
    return capitalizeFr(fragments[0]!);
  }
  if (fragments.length === 2) {
    return `${capitalizeFr(fragments[0]!)} et ${fragments[1]}.`;
  }
  const head = fragments.slice(0, -1).join(', ');
  const last = fragments[fragments.length - 1]!;
  return `${capitalizeFr(head)} et ${last}.`;
}

function densityFragments(
  codes: readonly LimiterSignalCode[],
  table: Record<LimiterSignalCode, DensityPair>,
  mode: keyof DensityPair,
): string[] {
  return codes.map((code) => table[code][mode]);
}

function uniqueLimiterFacts(
  primary: LimiterSignalCode | null | undefined,
  extra: readonly LimiterSignalCode[] | undefined,
): LimiterSignalCode[] {
  const out: LimiterSignalCode[] = [];
  const seen = new Set<LimiterSignalCode>();
  for (const code of [primary, ...(extra ?? [])]) {
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    out.push(code);
  }
  return out;
}

function buildExplanationForMode(
  stateCode: VerdictStateCode,
  facts: VerdictCopyFacts,
  mode: keyof DensityPair,
): string {
  const limiterCodes = uniqueLimiterFacts(facts.limiterSignal, facts.extraLimiterFacts);
  const limiterBits = densityFragments(limiterCodes, LIMITER_EXPLANATION_FRAGMENT, mode);
  const supportBits = facts.supportSignal
    ? [SUPPORT_EXPLANATION_FRAGMENT[facts.supportSignal][mode]]
    : [];

  const closing = ORIENTATION_CLOSING[stateCode][mode];

  if (limiterBits.length === 0 && supportBits.length === 0) {
    return closing;
  }

  const factSentence = joinFragments([...limiterBits, ...supportBits]);
  // Cap at two sentences: facts + orientation.
  return `${factSentence.endsWith('.') ? factSentence : `${factSentence}.`} ${closing}`;
}

export function resolveInstruction(
  stateCode: VerdictStateCode,
  facts: Pick<VerdictCopyFacts, 'trainHardOverload'> = {},
): string {
  if (stateCode === 'TRAIN_HARD' && facts.trainHardOverload) {
    return VERDICT_INSTRUCTION_TRAIN_HARD_OVERLOAD;
  }
  return VERDICT_INSTRUCTION[stateCode];
}

export function resolveVsYesterday(
  today: VerdictStateCode,
  yesterday: VerdictStateCode | null | undefined,
): VsYesterdayCode | null {
  if (!yesterday) {
    return null;
  }
  return today === yesterday ? 'same' : 'changed';
}

/**
 * Builds the full additive verdict copy from a stable state code and calculated facts.
 * Never invents a frein / support / yesterday delta without a fact.
 */
export function buildVerdictCopy(
  stateCode: VerdictStateCode,
  facts: VerdictCopyFacts = {},
): BuiltVerdictCopy {
  const instruction = resolveInstruction(stateCode, facts);
  const vsYesterday = resolveVsYesterday(stateCode, facts.yesterdayStateCode);
  const limiterSignal = facts.limiterSignal ?? null;
  const supportSignal = facts.supportSignal ?? null;

  return {
    stateCode,
    tag: VERDICT_TAG[stateCode],
    title: VERDICT_TITLE[stateCode],
    instruction,
    actionLine: instruction,
    explanation: {
      essential: buildExplanationForMode(stateCode, facts, 'essential'),
      expert: buildExplanationForMode(stateCode, facts, 'expert'),
    },
    limiterSignal,
    supportSignal,
    vsYesterday,
    vsYesterdayLabel: vsYesterday ? VS_YESTERDAY_LABEL[vsYesterday] : null,
  };
}

export function limiterChipLabel(code: LimiterSignalCode, mode: keyof DensityPair): string {
  return `${LIMITER_CHIP_PREFIX} · ${LIMITER_LABEL[code][mode]}`;
}

export function supportChipLabel(code: SupportSignalCode, mode: keyof DensityPair): string {
  return `${SUPPORT_CHIP_PREFIX} · ${SUPPORT_LABEL[code][mode]}`;
}

/** Coach prompt line: athlete reading density — written live into the context. */
export function formatDisplayModeCoachLine(mode: 'essential' | 'expert'): string {
  if (mode === 'essential') {
    return (
      `Densité de lecture de l’athlète : essentiel. ` +
      `N’utilise aucun acronyme technique (interdits : ${EXPERT_ACRONYMS.join(', ')}). ` +
      `Parle en langage clair (« corps pas encore récupéré », « nuit trop courte », « charge »).`
    );
  }
  return (
    `Densité de lecture de l’athlète : expert. ` +
    `Les acronymes techniques (VFC, FC, TSS, ACWR, CTL/ATL, TSB…) sont autorisés quand ils aident.`
  );
}

/** Privacy-safe log payload — codes and booleans only, never explanation text. */
export function verdictCopyLogFields(copy: BuiltVerdictCopy): {
  stateCode: VerdictStateCode;
  limiterSignal: LimiterSignalCode | null;
  supportSignal: SupportSignalCode | null;
  vsYesterday: VsYesterdayCode | null;
  hasExplanation: boolean;
  hasInstruction: boolean;
} {
  return {
    stateCode: copy.stateCode,
    limiterSignal: copy.limiterSignal,
    supportSignal: copy.supportSignal,
    vsYesterday: copy.vsYesterday,
    hasExplanation: Boolean(copy.explanation.essential || copy.explanation.expert),
    hasInstruction: Boolean(copy.instruction),
  };
}

/** Serializable glossary snapshot for iOS / cross-platform copy. */
export function serializeVerdictCopyGlossary() {
  return {
    version: 1,
    stateCodesOrdered: [...VERDICT_STATE_CODES_ORDERED, 'INSUFFICIENT_DATA' as const],
    tags: { ...VERDICT_TAG },
    titles: { ...VERDICT_TITLE },
    instructions: {
      ...VERDICT_INSTRUCTION,
      TRAIN_HARD_OVERLOAD: VERDICT_INSTRUCTION_TRAIN_HARD_OVERLOAD,
    },
    vsYesterday: { ...VS_YESTERDAY_LABEL },
    limiterSignals: Object.fromEntries(
      LIMITER_SIGNAL_CODES.map((code) => [code, { ...LIMITER_LABEL[code] }]),
    ),
    supportSignals: Object.fromEntries(
      SUPPORT_SIGNAL_CODES.map((code) => [code, { ...SUPPORT_LABEL[code] }]),
    ),
    chipPrefixes: {
      limiter: LIMITER_CHIP_PREFIX,
      support: SUPPORT_CHIP_PREFIX,
    },
    expertAcronyms: [...EXPERT_ACRONYMS],
  };
}

export type VerdictCopyGlossarySnapshot = ReturnType<typeof serializeVerdictCopyGlossary>;
