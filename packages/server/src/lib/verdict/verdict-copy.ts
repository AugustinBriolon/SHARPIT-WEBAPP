/**
 * Shared morning-verdict glossary — single source for the Today card and the Coach.
 *
 * ADR-023: the server never picks essential vs expert. It returns both variants;
 * the client (and Coach prompt) choose from the athlete's displayMode.
 *
 * Tone: tutoiement, verbes conjugués, impératif tutoyé pour l’instruction.
 * Jamais de promesse de résultat (« demain tu seras… »). Aucun accord genré.
 * Explanation never goes to MORNING_VERDICT push or logs (codes/bools only).
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

/** Importance order for frein chips (primary stays first when present). */
export const LIMITER_IMPORTANCE_ORDER: readonly LimiterSignalCode[] = [
  'hrv_low',
  'rhr_high',
  'sleep_short',
  'sleep_poor',
  'subjective_low',
  'load_elevated',
];

export const SUPPORT_IMPORTANCE_ORDER: readonly SupportSignalCode[] = [...SUPPORT_SIGNAL_CODES];

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

/**
 * Headline kept filled for legacy clients — new clients hide it via `showHeadline: false`
 * so the card does not repeat the tag.
 */
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
 * Instruction — plain text, no Markdown/HTML, impératif tutoyé, gender-neutral.
 */
export const VERDICT_INSTRUCTION: Record<VerdictStateCode, string> = {
  RECOVER: 'Privilégie le repos ou une marche très légère.',
  CAUTION: 'Baisse l’intensité de la séance prévue.',
  TRAIN_EASY: 'Reste en endurance facile.',
  TRAIN_SMART: 'Garde la qualité, coupe le volume.',
  TRAIN_HARD: 'Enchaîne la séance prévue avec engagement.',
  RACE_READY: 'Fais la séance qualité prévue.',
  INSUFFICIENT_DATA: 'Synchronise ta nuit avant de décider.',
};

/** TRAIN_HARD when adaptation is positively adapting — fact-gated variant. */
export const VERDICT_INSTRUCTION_TRAIN_HARD_OVERLOAD =
  'Pousse la séance clé avec une progression mesurée.';

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

/** Count label for 2+ signals — null below 2. */
export function signalCountLabel(count: number): string | null {
  if (count < 2) {
    return null;
  }
  return `${count} signaux`;
}

// ─── Fact fragments for explanations (tutoiement, conjugated) ────────────────

const LIMITER_EXPLANATION_FRAGMENT: Record<LimiterSignalCode, DensityPair> = {
  hrv_low: {
    essential: 'ton corps n’a pas encore récupéré',
    expert: 'ta VFC est basse',
  },
  rhr_high: {
    essential: 'ton cœur bat plus vite au repos',
    expert: 'ta FC de repos est haute',
  },
  sleep_short: {
    essential: 'ta nuit a été trop courte',
    expert: 'ton sommeil a été court',
  },
  sleep_poor: {
    essential: 'ta nuit a été agitée',
    expert: 'ton sommeil a été agité',
  },
  subjective_low: {
    essential: 'ta fatigue ressentie est marquée',
    expert: 'ton ressenti est bas',
  },
  load_elevated: {
    essential: 'ta semaine d’entraînement a été lourde',
    expert: 'ta charge est élevée',
  },
};

const SUPPORT_EXPLANATION_FRAGMENT: Record<SupportSignalCode, DensityPair> = {
  hrv_ok: {
    essential: 'ton corps a bien récupéré',
    expert: 'ta VFC est dans la norme',
  },
  rhr_ok: {
    essential: 'ton cœur reste calme au repos',
    expert: 'ta FC de repos est normale',
  },
  sleep_adequate: {
    essential: 'ta nuit a été suffisante',
    expert: 'ton sommeil a été suffisant',
  },
  sleep_quality_ok: {
    essential: 'ta nuit a été réparatrice',
    expert: 'ton sommeil a été de qualité',
  },
  subjective_ok: {
    essential: 'ta forme ressentie est bonne',
    expert: 'ton ressenti est élevé',
  },
  load_managed: {
    essential: 'ta charge reste bien gérée',
    expert: 'ta charge est maîtrisée',
  },
};

/**
 * Orientation closing — conjugated, tutoiement, no promised outcome.
 * Same prose in essential/expert unless jargon would appear.
 */
const ORIENTATION_CLOSING: Record<VerdictStateCode, DensityPair> = {
  RECOVER: {
    essential: 'Un vrai repos aujourd’hui aide ton corps à récupérer.',
    expert: 'Un vrai repos aujourd’hui aide ton corps à récupérer.',
  },
  CAUTION: {
    essential: 'Une séance facile aujourd’hui aide ton corps à récupérer.',
    expert: 'Une séance facile aujourd’hui aide ton corps à récupérer.',
  },
  TRAIN_EASY: {
    essential: 'Une séance légère te convient aujourd’hui.',
    expert: 'Une séance légère te convient aujourd’hui.',
  },
  TRAIN_SMART: {
    essential: 'Tu peux viser la qualité plutôt que le volume aujourd’hui.',
    expert: 'Tu peux viser la qualité plutôt que le volume aujourd’hui.',
  },
  TRAIN_HARD: {
    essential: 'Tu peux enchaîner une séance exigeante aujourd’hui.',
    expert: 'Tu peux enchaîner une séance exigeante aujourd’hui.',
  },
  RACE_READY: {
    essential: 'Tu es dans une fenêtre de performance aujourd’hui.',
    expert: 'Tu es dans une fenêtre de performance aujourd’hui.',
  },
  INSUFFICIENT_DATA: {
    essential: 'Il te manque encore des signaux pour trancher.',
    expert: 'Il te manque encore des signaux pour trancher.',
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
  /** Ordered frein codes (importance). First becomes limiterSignal. */
  limiterSignals?: readonly LimiterSignalCode[];
  /** @deprecated Prefer limiterSignals — kept for call-site migration. */
  limiterSignal?: LimiterSignalCode | null;
  /** Extra limiter-like facts merged after primary. */
  extraLimiterFacts?: readonly LimiterSignalCode[];
  /** Ordered support codes. First becomes supportSignal. */
  supportSignals?: readonly SupportSignalCode[];
  /** @deprecated Prefer supportSignals. */
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
  /** New clients hide the headline so it does not repeat the tag. */
  showHeadline: false;
  instruction: string;
  /** Kept for TestFlight — mirrors instruction. */
  actionLine: string;
  explanation: DensityPair;
  limiterSignals: LimiterSignalCode[];
  limiterSignal: LimiterSignalCode | null;
  /** « 2 signaux » — null when fewer than 2 freins. */
  limiterCountLabel: string | null;
  supportSignals: SupportSignalCode[];
  supportSignal: SupportSignalCode | null;
  supportCountLabel: string | null;
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

function sortByImportance<T extends string>(
  codes: readonly T[],
  order: readonly T[],
  primaryFirst?: T | null,
): T[] {
  const set = new Set(codes);
  const out: T[] = [];
  if (primaryFirst && set.has(primaryFirst)) {
    out.push(primaryFirst);
    set.delete(primaryFirst);
  }
  for (const code of order) {
    if (set.has(code)) {
      out.push(code);
      set.delete(code);
    }
  }
  return out;
}

export function resolveLimiterSignals(facts: VerdictCopyFacts): LimiterSignalCode[] {
  if (facts.limiterSignals && facts.limiterSignals.length > 0) {
    return sortByImportance(
      facts.limiterSignals,
      LIMITER_IMPORTANCE_ORDER,
      facts.limiterSignals[0],
    );
  }
  const primary = facts.limiterSignal ?? null;
  const merged = [
    ...(primary ? [primary] : []),
    ...(facts.extraLimiterFacts ?? []).filter((code) => code !== primary),
  ];
  return sortByImportance(merged, LIMITER_IMPORTANCE_ORDER, primary);
}

export function resolveSupportSignalsList(facts: VerdictCopyFacts): SupportSignalCode[] {
  if (facts.supportSignals && facts.supportSignals.length > 0) {
    return sortByImportance(
      facts.supportSignals,
      SUPPORT_IMPORTANCE_ORDER,
      facts.supportSignals[0],
    );
  }
  if (facts.supportSignal) {
    return [facts.supportSignal];
  }
  return [];
}

function buildExplanationForMode(
  stateCode: VerdictStateCode,
  limiterSignals: readonly LimiterSignalCode[],
  supportSignals: readonly SupportSignalCode[],
  mode: keyof DensityPair,
): string {
  const limiterBits = limiterSignals.map((code) => LIMITER_EXPLANATION_FRAGMENT[code][mode]);
  const supportBits = supportSignals.map((code) => SUPPORT_EXPLANATION_FRAGMENT[code][mode]);
  const closing = ORIENTATION_CLOSING[stateCode][mode];

  if (limiterBits.length === 0 && supportBits.length === 0) {
    return closing;
  }

  const factSentence = joinFragments([...limiterBits, ...supportBits]);
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
 * Security helper: yesterday verdict is looked up **only** by session athlete id.
 * Never fall back to another athlete's row.
 */
export function yesterdayStateForSessionAthlete(input: {
  sessionAthleteId: string;
  /** Map athleteId → yesterday state code (fixture / test stand-in for the repository). */
  yesterdayByAthlete: ReadonlyMap<string, VerdictStateCode | null | undefined>;
}): VerdictStateCode | null {
  const value = input.yesterdayByAthlete.get(input.sessionAthleteId);
  return value ?? null;
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
  const limiterSignals = resolveLimiterSignals(facts);
  const supportSignals = resolveSupportSignalsList(facts);
  const limiterSignal = limiterSignals[0] ?? null;
  const supportSignal = supportSignals[0] ?? null;

  return {
    stateCode,
    tag: VERDICT_TAG[stateCode],
    title: VERDICT_TITLE[stateCode],
    showHeadline: false,
    instruction,
    actionLine: instruction,
    explanation: {
      essential: buildExplanationForMode(stateCode, limiterSignals, supportSignals, 'essential'),
      expert: buildExplanationForMode(stateCode, limiterSignals, supportSignals, 'expert'),
    },
    limiterSignals,
    limiterSignal,
    limiterCountLabel: signalCountLabel(limiterSignals.length),
    supportSignals,
    supportSignal,
    supportCountLabel: signalCountLabel(supportSignals.length),
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

/**
 * Frein chip text: single signal → density label; 2+ → « N signaux ».
 */
export function formatLimiterChip(
  codes: readonly LimiterSignalCode[],
  mode: keyof DensityPair,
): string | null {
  if (codes.length === 0) {
    return null;
  }
  const count = signalCountLabel(codes.length);
  if (count) {
    return `${LIMITER_CHIP_PREFIX} · ${count}`;
  }
  return limiterChipLabel(codes[0]!, mode);
}

export function formatSupportChip(
  codes: readonly SupportSignalCode[],
  mode: keyof DensityPair,
): string | null {
  if (codes.length === 0) {
    return null;
  }
  const count = signalCountLabel(codes.length);
  if (count) {
    return `${SUPPORT_CHIP_PREFIX} · ${count}`;
  }
  return supportChipLabel(codes[0]!, mode);
}

/** Coach prompt line: athlete reading density — written live into the context. */
export function formatDisplayModeCoachLine(mode: 'essential' | 'expert'): string {
  if (mode === 'essential') {
    return (
      `Densité de lecture de l’athlète : essentiel. ` +
      `N’utilise aucun acronyme technique (interdits : ${EXPERT_ACRONYMS.join(', ')}). ` +
      `Tutoie, conjugue les verbes, parle en langage clair ` +
      `(« ton corps n’a pas encore récupéré », « ta nuit a été trop courte »). ` +
      `Ne promets jamais de résultat (« demain tu seras… »).`
    );
  }
  return (
    `Densité de lecture de l’athlète : expert. ` +
    `Tutoie et conjugue. Les acronymes techniques (VFC, FC, TSS, ACWR, CTL/ATL, TSB…) ` +
    `sont autorisés quand ils aident. Ne promets jamais de résultat.`
  );
}

/** Privacy-safe log payload — codes and booleans only, never explanation text. */
export function verdictCopyLogFields(copy: BuiltVerdictCopy): {
  stateCode: VerdictStateCode;
  limiterSignal: LimiterSignalCode | null;
  limiterSignalCount: number;
  supportSignal: SupportSignalCode | null;
  supportSignalCount: number;
  vsYesterday: VsYesterdayCode | null;
  showHeadline: false;
  hasExplanation: boolean;
  hasInstruction: boolean;
} {
  return {
    stateCode: copy.stateCode,
    limiterSignal: copy.limiterSignal,
    limiterSignalCount: copy.limiterSignals.length,
    supportSignal: copy.supportSignal,
    supportSignalCount: copy.supportSignals.length,
    vsYesterday: copy.vsYesterday,
    showHeadline: false,
    hasExplanation: Boolean(copy.explanation.essential || copy.explanation.expert),
    hasInstruction: Boolean(copy.instruction),
  };
}

/** Serializable glossary snapshot for iOS / cross-platform copy. */
export function serializeVerdictCopyGlossary() {
  return {
    version: 2,
    stateCodesOrdered: [...VERDICT_STATE_CODES_ORDERED, 'INSUFFICIENT_DATA' as const],
    tags: { ...VERDICT_TAG },
    titles: { ...VERDICT_TITLE },
    showHeadline: false as const,
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
    limiterCountLabel: {
      template: '{n} signaux',
      minCount: 2,
    },
    supportCountLabel: {
      template: '{n} signaux',
      minCount: 2,
    },
    chipPrefixes: {
      limiter: LIMITER_CHIP_PREFIX,
      support: SUPPORT_CHIP_PREFIX,
    },
    expertAcronyms: [...EXPERT_ACRONYMS],
    tone: {
      address: 'tutoiement',
      instructionMood: 'imperatif',
      noPromisedOutcome: true,
      noGenderedAgreement: true,
    },
  };
}

export type VerdictCopyGlossarySnapshot = ReturnType<typeof serializeVerdictCopyGlossary>;
