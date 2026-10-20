import { normalizeCoachText } from '@sharpit/server/lib/coach/chat/coach-request-scope';

/**
 * A question that tries to take the coach off its instructions (ADR-099). Only the blatant
 * forms are caught here, so the athlete's quota is not spent on them; the system prompt's
 * scope rule is the actual defence against every other wording.
 */
const PROMPT_OVERRIDE_PATTERNS: readonly RegExp[] = [
  // « oublie tes consignes », not « j'ai oublié tes consignes » (the athlete forgot them).
  /(?<!ai )\boublie (tout|tes|ton|toutes tes|tout ton)\b.{0,40}\b(instruction|consigne|contexte|prompt|regle|role)/,
  /(?<!j')\bignore (tes|ton|toutes|tout|les instructions|les consignes)\b.{0,40}\b(instruction|consigne|prompt|regle)/,
  /\b(ignore|forget|disregard) (all|your|any|the|previous|prior)\b.{0,40}\b(instructions?|prompt|rules)\b/,
  /\b(prompt systeme|system prompt|tes instructions systeme|ton prompt)\b/,
  // A new persona: « tu es maintenant un pirate », not « tu es maintenant prudent ».
  /\b(tu es desormais|tu es maintenant|you are now|a partir de maintenant tu es) (un|une|mon|ma|a|an)\b/,
  /\b(jailbreak|mode developpeur|developer mode|dan mode)\b/,
];

export function isPromptOverride(question: string): boolean {
  const text = normalizeCoachText(question);
  return PROMPT_OVERRIDE_PATTERNS.some((pattern) => pattern.test(text));
}

/** What the coach answers instead, without a model call. */
export const COACH_OFF_SCOPE_REPLY =
  'Je reste ton coach SharpIt : entraînement, récupération, nutrition et santé. Pose-moi une question là-dessus et je m’appuie sur tes données.';
