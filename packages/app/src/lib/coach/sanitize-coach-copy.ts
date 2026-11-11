/**
 * Strip AI-slop dash separators from coach / model-generated French copy.
 *
 * Product rule: athlete-facing model text must not use em dashes (—), en dashes
 * as clause joiners, or mid-sentence " - " separators. Prefer periods or commas.
 */

/** Inject into system prompts that produce athlete-facing French prose. */
export const COACH_COPY_DASH_RULE = `PONCTUATION (impératif pour tout texte lu par l'athlète) :
- N'utilise JAMAIS le tiret cadratin (—) ni le demi-cadratin (–) pour joindre des propositions.
- Évite le motif « phrase - phrase » (espaces + tiret court isolé entre deux clauses).
- Préfère un point (« . ») ou une virgule (« , »), ou deux phrases courtes séparées.
- Les traits d'union dans les mots composés (ex. course-à-pied) et les plages numériques (ex. 2-3, 06:00-21:00) restent autorisés.`;

/** Anti-AI staging / rhythm / inflation — inject with the dash rule on athlete-facing prompts. */
export const COACH_COPY_HUMANIZER_RULE = `STYLE HUMAIN (impératif pour tout texte lu par l'athlète) :
- Pas de contraste creux (« ce n'est pas X, c'est Y », « pas seulement… mais… ») sauf pour corriger une croyance réelle de l'athlète.
- Pas de closer dramatique qui répète le point (« c'est ce qui compte », « retiens ça », « voilà l'essentiel »).
- Pas de triade forcée (trois items parallèles) si deux faits suffisent.
- Phrases courtes et concrètes : chiffre ou action avant l'emphase. Évite les mots creux (crucial, pivotal, landscape, delve, robust au sens figuré, highlight comme verbe creux).
- Tutoiement direct. Une idée par phrase. Coupe tout mot qui n'ajoute pas d'info.`;

/** Dash punctuation + humanizer anti-tells for prompts that write athlete-facing prose. */
export const COACH_COPY_STYLE_RULE = `${COACH_COPY_DASH_RULE}

${COACH_COPY_HUMANIZER_RULE}`;

/**
 * Replace em/en dash clause joiners and spaced " - " separators with ". ".
 * Preserves compound hyphens and digit ranges.
 */
export function sanitizeCoachCopy(input: string): string {
  if (!input) {
    return input;
  }

  let text = input;

  // Digit ranges that used an em/en dash → keep a plain hyphen range.
  text = text.replace(/(\d)[^\S\n]*[—–][^\S\n]*(\d)/g, '$1-$2');

  // Em / en dash as clause joiner (horizontal whitespace only — keep markdown lines).
  text = text.replace(/[^\S\n]*[—–][^\S\n]*(\p{Ll})?/gu, (_match, letter: string | undefined) =>
    letter ? `. ${letter.toUpperCase()}` : '. ',
  );

  // Spaced ASCII hyphen between word-like tokens (not markdown list markers).
  text = text.replace(
    /([\p{L}\p{N}»"'”)\]])[^\S\n]+-[^\S\n]+([\p{L}\p{N}«"'“(\u005B])/gu,
    (_match, left: string, right: string) =>
      `${left}. ${/\p{Ll}/u.test(right) ? right.toUpperCase() : right}`,
  );

  // Collapse awkward doubles after replacement.
  text = text.replace(/\.[^\S\n]*\./g, '.');
  text = text.replace(/\.[^\S\n]+([,;:!?])/g, '$1');
  text = text.replace(/([,;:])[^\S\n]*\./g, '$1');

  // Horizontal whitespace only — keep markdown newlines / list structure.
  text = text.replace(/[^\S\n]{2,}/g, ' ');

  return text;
}

/** Alias kept for call sites that prefer the strip-oriented name. */
export const stripAiDashes = sanitizeCoachCopy;

/** Sanitize every string field on a shallow object (structured LLM outputs). */
export function sanitizeCoachCopyFields<T extends Record<string, unknown>>(
  value: T,
  keys: readonly (keyof T)[],
): T {
  const next = { ...value };
  for (const key of keys) {
    const field = next[key];
    if (typeof field === 'string') {
      next[key] = sanitizeCoachCopy(field) as T[keyof T];
    } else if (Array.isArray(field) && field.every((item) => typeof item === 'string')) {
      next[key] = field.map((item) => sanitizeCoachCopy(item as string)) as T[keyof T];
    }
  }
  return next;
}
