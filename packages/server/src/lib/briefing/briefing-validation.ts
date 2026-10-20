import type { BriefingDayContext } from '@sharpit/server/lib/briefing/briefing-context';
import { isSet } from '@sharpit/shared/value';
import type { CoachContext } from '@sharpit/server/lib/coach/context/coach-context';

const SPORT_PATTERNS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'BIKE', patterns: [/\bvélo\b/i, /\bvelo\b/i, /\bcycl/i] },
  { key: 'SWIM', patterns: [/\bnatation\b/i, /\bpiscine\b/i, /\bnager\b/i] },
  { key: 'RUN', patterns: [/\bcourse\b/i, /\bcourir\b/i, /\brunning\b/i] },
  { key: 'STRENGTH', patterns: [/\brenfo\b/i, /\bmusculation\b/i] },
];

function sportsInLines(lines: string[]): Set<string> {
  const found = new Set<string>();
  const blob = lines.join('\n').toLowerCase();
  for (const { key, patterns } of SPORT_PATTERNS) {
    if (patterns.some((p) => p.test(blob))) {
      found.add(key);
    }
  }
  return found;
}

function sportsMentionedInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const { key, patterns } of SPORT_PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      found.add(key);
    }
  }
  return found;
}

function extractAllowedRaceTitles(ctx: CoachContext): string[] {
  return ctx.races.map((r) => r.title.toLowerCase()).filter(Boolean);
}

function mentionsUnknownRace(text: string, allowed: string[]): boolean {
  if (allowed.length === 0) {
    return false;
  }
  const lower = text.toLowerCase();
  const raceMention = /\b(course|marathon|ironman|semi|10\s?km|objectif|race)\b/i.test(lower);
  if (!raceMention) {
    return false;
  }
  return !allowed.some((title) => title.length > 3 && lower.includes(title));
}

function validateMentionedSports(
  trimmed: string,
  allowedSports: Set<string>,
): { valid: true } | { valid: false; reason: string } {
  for (const sport of sportsMentionedInText(trimmed)) {
    if (!allowedSports.has(sport)) {
      return { valid: false, reason: `séance inventée (${sport})` };
    }
  }
  return { valid: true };
}

function validateTodayAttribution(input: {
  trimmed: string;
  mentionedSports: Set<string>;
  todaySports: Set<string>;
  yesterdaySports: Set<string>;
  plannedSports: Set<string>;
}): { valid: true } | { valid: false; reason: string } {
  const { trimmed, mentionedSports, todaySports, yesterdaySports, plannedSports } = input;
  const attributesToday =
    /\baujourd'?hui\b/i.test(trimmed) ||
    /\bce (matin|midi|soir)\b/i.test(trimmed) ||
    /\bce jour\b/i.test(trimmed);

  if (!attributesToday) {
    return { valid: true };
  }

  for (const sport of mentionedSports) {
    if (yesterdaySports.has(sport) && !todaySports.has(sport) && !plannedSports.has(sport)) {
      return {
        valid: false,
        reason: `séance d'hier présentée comme aujourd'hui (${sport})`,
      };
    }
  }
  return { valid: true };
}

function validateReadinessCitation(
  trimmed: string,
  readiness: number | null,
): { valid: true } | { valid: false; reason: string } {
  if (readiness === undefined || readiness === null) {
    return { valid: true };
  }
  const cited = trimmed.match(/\b(\d{2,3})\s*\/\s*100\b/g);
  if (!cited) {
    return { valid: true };
  }
  const values = cited.map((m) => Number.parseInt(m, 10));
  const plausible = values.some((v) => Math.abs(v - readiness) <= 8);
  if (!plausible && values.some((v) => v >= 40 && v <= 100)) {
    return { valid: false, reason: 'readiness citée incompatible avec les données' };
  }
  return { valid: true };
}

function validateDoneTodayClaim(input: {
  trimmed: string;
  mentionedSports: Set<string>;
  plannedSports: Set<string>;
  todaySports: Set<string>;
  sessionsDoneTodayCount: number;
}): { valid: true } | { valid: false; reason: string } {
  const { trimmed, mentionedSports, plannedSports, todaySports, sessionsDoneTodayCount } = input;
  if (sessionsDoneTodayCount > 0) {
    return { valid: true };
  }
  if (!/\b(déjà|terminé|réalisé|fait)\b/i.test(trimmed)) {
    return { valid: true };
  }
  const impliesDoneToday = [...mentionedSports].some((s) => !plannedSports.has(s));
  if (impliesDoneToday && todaySports.size === 0) {
    return { valid: false, reason: 'séance réalisée inventée pour aujourd’hui' };
  }
  return { valid: true };
}

/**
 * Strict post-generation validation — briefing must not invent facts.
 */
export function validateBriefingContent(
  content: string,
  dayCtx: BriefingDayContext,
  coachCtx: CoachContext,
): { valid: true } | { valid: false; reason: string } {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length < 40) {
    return { valid: false, reason: 'contenu trop court' };
  }

  const todaySports = sportsInLines(dayCtx.sessionsDoneToday);
  const yesterdaySports = sportsInLines(dayCtx.sessionsYesterday);
  const plannedSports = sportsInLines(dayCtx.sessionsStillPlannedToday);
  const allowedSports = new Set([...todaySports, ...yesterdaySports, ...plannedSports]);
  const mentionedSports = sportsMentionedInText(trimmed);

  const sportCheck = validateMentionedSports(trimmed, allowedSports);
  if (!sportCheck.valid) {
    return sportCheck;
  }

  const todayCheck = validateTodayAttribution({
    trimmed,
    mentionedSports,
    todaySports,
    yesterdaySports,
    plannedSports,
  });
  if (!todayCheck.valid) {
    return todayCheck;
  }

  const doneCheck = validateDoneTodayClaim({
    trimmed,
    mentionedSports,
    plannedSports,
    todaySports,
    sessionsDoneTodayCount: dayCtx.sessionsDoneToday.length,
  });
  if (!doneCheck.valid) {
    return doneCheck;
  }

  const allowedRaces = extractAllowedRaceTitles(coachCtx);
  if (mentionsUnknownRace(trimmed, allowedRaces) && allowedRaces.length > 0) {
    return { valid: false, reason: 'course ou objectif non présent dans le contexte' };
  }

  return validateReadinessCitation(trimmed, coachCtx.health.readinessToday);
}

function buildReadinessLine(readiness: number | null, tsb: number | null): string {
  if (isSet(readiness)) {
    return `Ta readiness est à ${readiness}/100${isSet(tsb) ? `, avec une fraîcheur (TSB) à ${tsb > 0 ? '+' : ''}${tsb}` : ''}.`;
  }
  if (isSet(tsb)) {
    return `Ta fraîcheur (TSB) est à ${tsb > 0 ? '+' : ''}${tsb} aujourd'hui.`;
  }
  return "SHARPIT n'a pas encore assez de signaux pour un bilan personnalisé complet aujourd'hui.";
}

function buildSessionLine(dayCtx: BriefingDayContext): string {
  if (dayCtx.sessionsDoneToday.length > 0) {
    return `Séance${dayCtx.sessionsDoneToday.length > 1 ? 's' : ''} déjà réalisée${dayCtx.sessionsDoneToday.length > 1 ? 's' : ''} aujourd'hui — consulte le détail dans ton journal.`;
  }
  if (dayCtx.sessionsStillPlannedToday.length > 0) {
    return 'Une séance est prévue aujourd’hui — adapte l’intensité à ta forme du moment.';
  }
  return 'Aucune séance planifiée pour le reste de la journée.';
}

export function buildDeterministicBriefingFallback(
  dayCtx: BriefingDayContext,
  coachCtx: CoachContext,
): string {
  const lines: string[] = [
    buildReadinessLine(coachCtx.health.readinessToday, coachCtx.fitness?.tsb ?? null),
    buildSessionLine(dayCtx),
  ];

  if (coachCtx.physical.length > 0) {
    const [note] = coachCtx.physical;
    lines.push(
      `Point de vigilance : ${note.title}${isSet(note.severity) ? ` (sévérité ${note.severity}/10)` : ''}. Respecte cette contrainte.`,
    );
  }

  lines.push(
    'Ce message est généré à partir de tes données mesurées, sans interprétation supplémentaire.',
  );

  return lines.join('\n\n');
}
