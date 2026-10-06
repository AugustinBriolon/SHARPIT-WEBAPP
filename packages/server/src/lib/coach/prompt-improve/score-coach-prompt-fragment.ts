/**
 * Deterministic quality score for a coach prompt fragment.
 * Offline self-improve only — no LLM, no I/O.
 */

export type CoachPromptQualityFlag =
  | 'missing_day_load_vocab'
  | 'missing_confidence_refuse'
  | 'missing_medical_boundary'
  | 'missing_dash_rule'
  | 'conflates_day_and_status'
  | 'too_long';

export type CoachPromptQualityResult = {
  readonly score: number;
  readonly flags: readonly CoachPromptQualityFlag[];
};

const DEDUCTIONS: Record<Exclude<CoachPromptQualityFlag, 'too_long'>, number> = {
  missing_day_load_vocab: 25,
  missing_confidence_refuse: 20,
  missing_medical_boundary: 20,
  missing_dash_rule: 10,
  conflates_day_and_status: 30,
};

const MAX_CHARS = 4_000;
const TOO_LONG_DEDUCTION = 15;

function collectFlags(text: string): CoachPromptQualityFlag[] {
  const flags: CoachPromptQualityFlag[] = [];
  const lower = text.toLowerCase();

  if (!/charge du jour/.test(lower)) {
    flags.push('missing_day_load_vocab');
  }
  if (
    !/confiance/.test(lower) ||
    !/(insuffisant|faible|non actionnable|refuse|prudent)/.test(lower)
  ) {
    flags.push('missing_confidence_refuse');
  }
  if (!/(diagnostic médical|ne (pose|diagnostique)|médecin)/.test(lower)) {
    flags.push('missing_medical_boundary');
  }
  if (!/(tiret cadratin|ponctuation)/.test(lower)) {
    flags.push('missing_dash_rule');
  }
  if (
    /surentraînement/.test(lower) &&
    !/charge du jour/.test(lower) &&
    !/n['']est pas un statut/.test(lower)
  ) {
    flags.push('conflates_day_and_status');
  }
  if (text.length > MAX_CHARS) {
    flags.push('too_long');
  }
  return flags;
}

export function scoreCoachPromptFragment(text: string): CoachPromptQualityResult {
  const flags = collectFlags(text);
  let score = 100;
  for (const flag of flags) {
    if (flag === 'too_long') {
      score -= TOO_LONG_DEDUCTION;
      continue;
    }
    score -= DEDUCTIONS[flag];
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    flags,
  };
}
