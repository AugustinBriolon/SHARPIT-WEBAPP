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

import { VERDICT_TAG, type OverallVerdict } from '@sharpit/app/lib/today/dashboard/today-mapping';
import type { LimiterSignalCode } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import {
  LIMITER_LABEL_BY_DENSITY,
  LIMITER_SIGNAL_CODES,
} from '@sharpit/app/lib/today/dashboard/limiter-signal';

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

// ─── Tags (athlete-facing, density-invariant) — owned by @sharpit/app ─────────

export { VERDICT_TAG };

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

/** Additive label next to vsYesterdayLabel — e.g. « Hier : Prudence ». */
export const VS_YESTERDAY_VERDICT_LABEL_TEMPLATE = 'Hier : {tag}' as const;

export function formatVsYesterdayVerdictLabel(
  yesterday: VerdictStateCode | null | undefined,
): string | null {
  if (!yesterday) {
    return null;
  }
  return `Hier : ${VERDICT_TAG[yesterday]}`;
}

/** Max freins / supports cited inside the explanation sentence (extras stay structured). */
export const EXPLANATION_MAX_LIMITERS = 2;
export const EXPLANATION_MAX_SUPPORTS = 1;

/** Max frein chips before « +N » overflow. */
export const LIMITER_CHIPS_VISIBLE_MAX = 2;

export function formatSignalOverflowLabel(
  total: number,
  visibleMax: number = LIMITER_CHIPS_VISIBLE_MAX,
): string | null {
  if (total <= visibleMax) {
    return null;
  }
  return `+${total - visibleMax}`;
}

// ─── Limiter chip pairs (Essentiel / Expert) — owned by @sharpit/app ──────────

export const LIMITER_LABEL: Record<LimiterSignalCode, DensityPair> = LIMITER_LABEL_BY_DENSITY;

/**
 * Dimension cause labels (description.params.limiter) — same glossary as frein chips.
 * Essentiel stays plain; Expert may use technical terms.
 */
export const LIMITER_DIMENSION_LABEL: Record<
  'autonomic' | 'sleep' | 'subjective' | 'loadContext',
  DensityPair
> = {
  autonomic: {
    essential: 'Récupération du corps',
    expert: 'VFC · FC repos',
  },
  sleep: {
    essential: 'Sommeil',
    expert: 'Sommeil',
  },
  subjective: {
    essential: 'Ressenti',
    expert: 'Ressenti',
  },
  loadContext: {
    essential: "Charge d'entraînement",
    expert: "Charge d'entraînement",
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

/**
 * Recovery systems shared by frein / support codes.
 * A system cannot be both brake and support in the same reading.
 */
export type RecoverySignalSystem = 'autonomic' | 'sleep' | 'subjective' | 'load';

export const LIMITER_SIGNAL_SYSTEM: Record<LimiterSignalCode, RecoverySignalSystem> = {
  hrv_low: 'autonomic',
  rhr_high: 'autonomic',
  sleep_short: 'sleep',
  sleep_poor: 'sleep',
  subjective_low: 'subjective',
  load_elevated: 'load',
};

export const SUPPORT_SIGNAL_SYSTEM: Record<SupportSignalCode, RecoverySignalSystem> = {
  hrv_ok: 'autonomic',
  rhr_ok: 'autonomic',
  sleep_adequate: 'sleep',
  sleep_quality_ok: 'sleep',
  subjective_ok: 'subjective',
  load_managed: 'load',
};

/** Drop supports whose system already has a frein. */
export function filterSupportsAgainstLimiters(
  supports: readonly SupportSignalCode[],
  limiters: readonly LimiterSignalCode[],
): SupportSignalCode[] {
  if (limiters.length === 0 || supports.length === 0) {
    return [...supports];
  }
  const blocked = new Set(limiters.map((code) => LIMITER_SIGNAL_SYSTEM[code]));
  return supports.filter((code) => !blocked.has(SUPPORT_SIGNAL_SYSTEM[code]));
}

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
 * Essentiel CAUTION closing (also forced after a « Ton corps … » fact sentence).
 * Names « ton corps » explicitly so the referent stays clear when the fact does not.
 * Expert keeps its own closing (« aide ton corps ») — never reuse this string there.
 */
export const ESSENTIAL_CLOSING_AFTER_TON_CORPS =
  'Une séance facile aujourd’hui laisse à ton corps le temps de se remettre.';

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
    essential: ESSENTIAL_CLOSING_AFTER_TON_CORPS,
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

/**
 * Short / alternate closings when the default shares a content stem with the fact
 * (e.g. « récupéré » → avoid « récupérer »). Glossary phrases only.
 */
const ORIENTATION_CLOSING_ALTERNATES: Partial<Record<VerdictStateCode, DensityPair>> = {
  RECOVER: {
    essential: 'Un vrai repos aujourd’hui.',
    expert: 'Un vrai repos aujourd’hui.',
  },
  CAUTION: {
    essential: ESSENTIAL_CLOSING_AFTER_TON_CORPS,
    expert: 'Une séance facile aujourd’hui.',
  },
};

/** REPOS short closing — preferred when the fact already names recovery. */
export const RECOVER_SHORT_CLOSING = 'Un vrai repos aujourd’hui.';

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
  /**
   * Glossary labels for the first {@link LIMITER_CHIPS_VISIBLE_MAX} freins
   * (UI shows these chips; extras via {@link limiterOverflowLabel}).
   */
  limiterChipLabels: { essential: string[]; expert: string[] };
  /** « +N » when more freins than {@link LIMITER_CHIPS_VISIBLE_MAX} — null otherwise. */
  limiterOverflowLabel: string | null;
  supportSignals: SupportSignalCode[];
  supportSignal: SupportSignalCode | null;
  supportCountLabel: string | null;
  vsYesterday: VsYesterdayCode | null;
  /** Legacy comparative label — do not remove (installed iOS). */
  vsYesterdayLabel: string | null;
  /** Additive. Yesterday's verdict tag, e.g. « Hier : Prudence ». */
  vsYesterdayVerdictLabel: string | null;
};

function capitalizeFr(sentence: string): string {
  if (!sentence) {
    return sentence;
  }
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Join glossary fragments with « et » only — never comma-chain.
 * Callers must pass at most {@link EXPLANATION_MAX_LIMITERS} brake fragments.
 */
function joinWithEt(fragments: readonly string[]): string {
  if (fragments.length === 0) {
    return '';
  }
  if (fragments.length === 1) {
    return fragments[0]!;
  }
  return `${fragments[0]} et ${fragments.slice(1).join(' et ')}`;
}

/**
 * Fact sentence from glossary fragments only.
 * - Brake only / support only: joined with « et ».
 * - Brake + support: support first, then «, mais », then brake last.
 */
function joinExplanationFacts(
  limiterBits: readonly string[],
  supportBits: readonly string[],
): string {
  if (supportBits.length > 0 && limiterBits.length > 0) {
    return `${capitalizeFr(joinWithEt(supportBits))}, mais ${joinWithEt(limiterBits)}.`;
  }
  const bits = limiterBits.length > 0 ? limiterBits : supportBits;
  if (bits.length === 0) {
    return '';
  }
  if (bits.length === 1) {
    return capitalizeFr(bits[0]!);
  }
  return `${capitalizeFr(joinWithEt(bits))}.`;
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

export function resolveSupportSignalsList(
  facts: VerdictCopyFacts,
  limiterSignals: readonly LimiterSignalCode[] = [],
): SupportSignalCode[] {
  let supports: SupportSignalCode[] = [];
  if (facts.supportSignals && facts.supportSignals.length > 0) {
    supports = sortByImportance(
      facts.supportSignals,
      SUPPORT_IMPORTANCE_ORDER,
      facts.supportSignals[0],
    );
  } else if (facts.supportSignal) {
    supports = [facts.supportSignal];
  }
  // Generator rule: a system cannot be both frein and support.
  return filterSupportsAgainstLimiters(supports, limiterSignals);
}

function wordsOf(sentence: string): Set<string> {
  return new Set(
    sentence
      .toLocaleLowerCase('fr-FR')
      .replace(/[’']/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

/** Function / glue words ignored by stem dedupe (pronouns, articles, light verbs). */
const CONTENT_STEM_STOPWORDS = new Set([
  'a',
  'à',
  'ai',
  'aide',
  'au',
  'aujourd',
  'aux',
  'ce',
  'ces',
  'cette',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'est',
  'et',
  'été',
  'ete',
  'hui',
  'la',
  'le',
  'les',
  'lui',
  'mais',
  'ne',
  'pas',
  'pour',
  'par',
  'sa',
  'se',
  'ses',
  'son',
  'sur',
  'ta',
  'te',
  'ton',
  'tu',
  'un',
  'une',
  'y',
]);

/** Fold accents and collapse récupér* stems so « récupéré » clashes with « récupérer ». */
function contentStem(word: string): string {
  const folded = word.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
  if (folded.startsWith('recuper')) {
    return 'recuper';
  }
  return folded;
}

function contentStemsOf(sentence: string): Set<string> {
  const out = new Set<string>();
  for (const word of wordsOf(sentence)) {
    const stem = contentStem(word);
    if (!CONTENT_STEM_STOPWORDS.has(stem)) {
      out.add(stem);
    }
  }
  return out;
}

/** True when two French sentences share no content word (accents folded by locale). */
export function sentencesShareNoWord(a: string, b: string): boolean {
  const left = wordsOf(a);
  for (const word of wordsOf(b)) {
    if (left.has(word)) {
      return false;
    }
  }
  return true;
}

/** True when two sentences share a content stem (récupéré ↔ récupérer). */
export function sentencesShareContentStem(a: string, b: string): boolean {
  const left = contentStemsOf(a);
  for (const stem of contentStemsOf(b)) {
    if (left.has(stem)) {
      return true;
    }
  }
  return false;
}

/**
 * Pick the first closing that does not echo a content stem already in the fact.
 * Alternates are glossary phrases only — never free text.
 */
export function dedupeClosingAgainstFact(
  fact: string | null | undefined,
  closing: string,
  alternate: string | null | undefined,
): string {
  if (!fact || !sentencesShareContentStem(fact, closing)) {
    return closing;
  }
  if (alternate && !sentencesShareContentStem(fact, alternate)) {
    return alternate;
  }
  return alternate ?? closing;
}

function resolveOrientationClosing(
  stateCode: VerdictStateCode,
  mode: keyof DensityPair,
  factSentence: string | null,
): string {
  let closing = ORIENTATION_CLOSING[stateCode][mode];
  if (mode === 'essential') {
    // RECOVER keeps its own rest closing (then deduped) — do not force « séance facile ».
    if (stateCode !== 'RECOVER') {
      const startsWithTonCorps = Boolean(factSentence?.match(/^Ton corps\b/i));
      if (startsWithTonCorps || stateCode === 'CAUTION') {
        closing = ESSENTIAL_CLOSING_AFTER_TON_CORPS;
      }
    }
  }
  const alternate = ORIENTATION_CLOSING_ALTERNATES[stateCode]?.[mode] ?? null;
  return dedupeClosingAgainstFact(factSentence, closing, alternate);
}

function buildExplanationForMode(
  stateCode: VerdictStateCode,
  limiterSignals: readonly LimiterSignalCode[],
  supportSignals: readonly SupportSignalCode[],
  mode: keyof DensityPair,
): string {
  const citedLimiters = limiterSignals.slice(0, EXPLANATION_MAX_LIMITERS);
  const citedSupports = supportSignals.slice(0, EXPLANATION_MAX_SUPPORTS);
  const limiterBits = citedLimiters.map((code) => LIMITER_EXPLANATION_FRAGMENT[code][mode]);
  const supportBits = citedSupports.map((code) => SUPPORT_EXPLANATION_FRAGMENT[code][mode]);

  if (limiterBits.length === 0 && supportBits.length === 0) {
    return resolveOrientationClosing(stateCode, mode, null);
  }

  const factSentence = joinExplanationFacts(limiterBits, supportBits);
  const fact = factSentence.endsWith('.') ? factSentence : `${factSentence}.`;
  const closing = resolveOrientationClosing(stateCode, mode, fact);
  return `${fact} ${closing}`;
}

function buildLimiterChipLabels(codes: readonly LimiterSignalCode[]): {
  essential: string[];
  expert: string[];
} {
  const visible = codes.slice(0, LIMITER_CHIPS_VISIBLE_MAX);
  return {
    essential: visible.map((code) => LIMITER_LABEL[code].essential),
    expert: visible.map((code) => LIMITER_LABEL[code].expert),
  };
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
  const supportSignals = resolveSupportSignalsList(facts, limiterSignals);
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
    limiterChipLabels: buildLimiterChipLabels(limiterSignals),
    limiterOverflowLabel: formatSignalOverflowLabel(limiterSignals.length),
    supportSignals,
    supportSignal,
    supportCountLabel: signalCountLabel(supportSignals.length),
    vsYesterday,
    vsYesterdayLabel: vsYesterday ? VS_YESTERDAY_LABEL[vsYesterday] : null,
    vsYesterdayVerdictLabel: formatVsYesterdayVerdictLabel(facts.yesterdayStateCode),
  };
}

export function limiterChipLabel(code: LimiterSignalCode, mode: keyof DensityPair): string {
  return `${LIMITER_CHIP_PREFIX} · ${LIMITER_LABEL[code][mode]}`;
}

export function supportChipLabel(code: SupportSignalCode, mode: keyof DensityPair): string {
  return `${SUPPORT_CHIP_PREFIX} · ${SUPPORT_LABEL[code][mode]}`;
}

/**
 * Frein chip text (ADR-023):
 * - Essentiel: single label, or « N signaux » from 2 freins up
 * - Expert: lists each expert label (joined with « · »)
 */
export function formatLimiterChip(
  codes: readonly LimiterSignalCode[],
  mode: keyof DensityPair,
): string | null {
  if (codes.length === 0) {
    return null;
  }
  if (mode === 'essential') {
    const count = signalCountLabel(codes.length);
    if (count) {
      return `${LIMITER_CHIP_PREFIX} · ${count}`;
    }
    return limiterChipLabel(codes[0]!, 'essential');
  }
  if (codes.length === 1) {
    return limiterChipLabel(codes[0]!, 'expert');
  }
  return `${LIMITER_CHIP_PREFIX} · ${codes.map((code) => LIMITER_LABEL[code].expert).join(' · ')}`;
}

/**
 * Body of the Frein chip without the « Frein · » prefix — for fact rows whose
 * label is already « Frein ». Essentiel semantics (single label / N signaux).
 */
export function formatLimiterChipBody(
  codes: readonly LimiterSignalCode[],
  countLabel?: string | null,
): string | null {
  if (codes.length === 0) {
    return null;
  }
  if (codes.length >= 2) {
    return countLabel ?? signalCountLabel(codes.length);
  }
  return LIMITER_LABEL[codes[0]!].essential;
}

export function formatSupportChip(
  codes: readonly SupportSignalCode[],
  mode: keyof DensityPair,
): string | null {
  if (codes.length === 0) {
    return null;
  }
  if (mode === 'essential') {
    const count = signalCountLabel(codes.length);
    if (count) {
      return `${SUPPORT_CHIP_PREFIX} · ${count}`;
    }
    return supportChipLabel(codes[0]!, 'essential');
  }
  if (codes.length === 1) {
    return supportChipLabel(codes[0]!, 'expert');
  }
  return `${SUPPORT_CHIP_PREFIX} · ${codes.map((code) => SUPPORT_LABEL[code].expert).join(' · ')}`;
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
    version: 3,
    stateCodesOrdered: [...VERDICT_STATE_CODES_ORDERED, 'INSUFFICIENT_DATA' as const],
    tags: { ...VERDICT_TAG },
    titles: { ...VERDICT_TITLE },
    showHeadline: false as const,
    instructions: {
      ...VERDICT_INSTRUCTION,
      TRAIN_HARD_OVERLOAD: VERDICT_INSTRUCTION_TRAIN_HARD_OVERLOAD,
    },
    vsYesterday: { ...VS_YESTERDAY_LABEL },
    vsYesterdayVerdictLabel: {
      template: VS_YESTERDAY_VERDICT_LABEL_TEMPLATE,
    },
    limiterSignals: Object.fromEntries(
      LIMITER_SIGNAL_CODES.map((code) => [code, { ...LIMITER_LABEL[code] }]),
    ),
    limiterDimensions: { ...LIMITER_DIMENSION_LABEL },
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
    limiterOverflowLabel: {
      template: '+{n}',
      visibleMax: LIMITER_CHIPS_VISIBLE_MAX,
    },
    explanationCiteLimits: {
      maxLimiters: EXPLANATION_MAX_LIMITERS,
      maxSupports: EXPLANATION_MAX_SUPPORTS,
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
