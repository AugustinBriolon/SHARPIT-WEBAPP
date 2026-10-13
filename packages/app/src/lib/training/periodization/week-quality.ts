/**
 * Derive athlete-facing week quality from macro focus / phase text.
 * Complements PlanPhase — see knowledge/periodization-qualities.md and ADR-083.
 */

export type WeekQualityCode =
  | 'AEROBIC_BASE'
  | 'THRESHOLD'
  | 'VO2'
  | 'RACE_PACE'
  | 'STRENGTH_HILLS'
  | 'MAINTENANCE'
  | 'DELOAD'
  | 'TAPER'
  | 'RACE'
  | 'RETURN';

export const WEEK_QUALITY_LABELS_FR: Record<WeekQualityCode, string> = {
  AEROBIC_BASE: 'Volume aérobie',
  THRESHOLD: 'Seuil',
  VO2: 'VMA / VO2',
  RACE_PACE: 'Allure spécifique',
  STRENGTH_HILLS: 'Force / côtes',
  MAINTENANCE: 'Maintien',
  DELOAD: 'Semaine facile',
  TAPER: 'Affûtage',
  RACE: 'Course',
  RETURN: 'Reprise',
};

type QualityRule = { code: WeekQualityCode; pattern: RegExp };

const RULES: QualityRule[] = [
  {
    code: 'RETURN',
    pattern: /reprise|retour\s+blessure|return\s+to\s+sport|progressive\s+return/i,
  },
  { code: 'DELOAD', pattern: /deload|récup|recup|facile|easy\s+week|alléger|alleger/i },
  { code: 'TAPER', pattern: /affût|affut|taper|fra[iî]cheur/i },
  // RACE_PACE before RACE: « Spécificité course » must not collapse to race week.
  {
    code: 'RACE_PACE',
    pattern: /allure\s+(course|sp[eé]cifique)|sp[eé]cificit[eé]|simulation|race\s*pace/i,
  },
  { code: 'RACE', pattern: /race\s*day|compétition|competition|\bjour\s+de\s+course\b/i },
  { code: 'STRENGTH_HILLS', pattern: /force|c[oô]te|hill|ppg|pré-?fatigue|pre-?fatigue|renfo/i },
  { code: 'VO2', pattern: /\bvma\b|vo2|intervalles?\s+courts|r[eé]p[eé]titions?\s+courtes/i },
  { code: 'THRESHOLD', pattern: /seuil|tempo|lt2|sweet\s*spot|threshold/i },
  { code: 'MAINTENANCE', pattern: /maintien|maintenance|volume\s+stable/i },
  { code: 'AEROBIC_BASE', pattern: /a[eé]robie|fondamentale|zone\s*2|\bz2\b|endurance|volume/i },
];

const PHASE_DEFAULT: Record<string, WeekQualityCode> = {
  BASE: 'AEROBIC_BASE',
  BUILD: 'THRESHOLD',
  PEAK: 'RACE_PACE',
  TAPER: 'TAPER',
  RACE: 'RACE',
};

export function deriveWeekQuality(input: {
  focus?: string | null;
  planPhase?: string | null;
  isDeload?: boolean;
}): WeekQualityCode {
  if (input.isDeload) {
    return 'DELOAD';
  }
  const haystack = [input.focus, input.planPhase].filter(Boolean).join(' ');
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) {
      return rule.code;
    }
  }
  const phase = (input.planPhase ?? '').toUpperCase();
  return PHASE_DEFAULT[phase] ?? 'AEROBIC_BASE';
}

export function weekQualityLabelFr(code: WeekQualityCode): string {
  return WEEK_QUALITY_LABELS_FR[code];
}
