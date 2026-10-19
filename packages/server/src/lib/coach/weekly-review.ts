import { currentLocale, inAnswerLanguage } from '@sharpit/server/lib/locale/locale-context';
import { generateText } from 'ai';
import { isSet } from '@sharpit/shared/value';
import { formatSeances } from '@sharpit/shared/french-plural';
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfWeek,
  subDays,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { COACH_MODEL, coachAsyncGatewayOptions, isCoachConfigured } from '@sharpit/server/lib/ai';
import {
  buildCoachContext,
  formatCoachContext,
} from '@sharpit/server/lib/coach/context/coach-context';
import {
  COACH_COPY_DASH_RULE,
  sanitizeCoachCopy,
} from '@sharpit/app/lib/coach/sanitize-coach-copy';
import { recordAiUsage } from '@sharpit/server/lib/ai/usage';
import { prisma } from '@sharpit/db/client';
import {
  getActivities,
  getAthleteProfile,
  getHealthEntries,
  getPlannedSessions,
} from '@sharpit/server/lib/queries';
import {
  analyzeSleep,
  formatClock,
  formatDuration,
  type SleepEntryInput,
} from '@sharpit/app/lib/sleep/sleep';
import { loadDailyTrainingStressEntries } from '@sharpit/server/lib/training/pmc/pmc-server';
import {
  isExpertMode,
  toDisplayMode,
  type DisplayMode,
} from '@sharpit/app/lib/preferences/display-mode';

const TYPE_FR: Record<string, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
  STRENGTH: 'Renfo',
};

/**
 * Density-aware like every other reading in the app (ADR-023): 'essential'
 * keeps the same underlying figures but never prints the technical acronyms
 * (TSS, TSB, ACWR, CTL/ATL) — only 'expert' athletes asked to see that
 * vocabulary. The facts fed to the model still carry the raw numbers either
 * way; this only constrains what makes it into the written narrative.
 */
function buildWeeklySystem(mode: DisplayMode): string {
  const formLine = isExpertMode(mode)
    ? '2-3 phrases : volume réalisé vs prévu, respect du plan, et état de forme global (charge, TSB). Cite des chiffres clés, acronymes inclus (TSS, TSB, ACWR).'
    : '2-3 phrases : volume réalisé vs prévu, respect du plan, et état de forme global (charge, fraîcheur) en langage clair. Jamais d\'acronymes techniques (interdits : TSS, TSB, ACWR, CTL, ATL). Dis "ta fraîcheur reste bonne" ou "ta charge a bien progressé", jamais "TSB +12" ou "ACWR 1.37".';

  return `Tu es le coach d'endurance personnel de l'athlète. Tu rédiges sa RÉTROSPECTIVE HEBDOMADAIRE (weekly wrap) : un bilan de la semaine écoulée, factuel et actionnable, basé uniquement sur ses données réelles fournies plus bas.

Structure imposée (markdown concis, pas de titre de niveau 1) :
## Bilan d'entraînement
${formLine}

## Sommeil & récupération
2-3 phrases sur la qualité du sommeil de la semaine (durée, score, phases profond/REM, régularité des horaires) et son impact sur la récupération (HRV, FC repos, readiness). Sois précis avec les chiffres du sommeil.

## Ce qui a bien marché
Liste à puces de 1 à 3 points, chacun en 12 mots au plus, un fait daté ou chiffré par puce (une séance clé réussie, la régularité, un bon sommeil). Rien d'autre qu'une liste.

## Écarts à surveiller
Liste à puces de 1 à 3 points, chacun en 12 mots au plus : écarts au plan, fatigue, sommeil court, charge trop haute. Rien d'autre qu'une liste.

## Focus semaine prochaine
Une seule phrase nommant la **qualité** de semaine à viser (ex. volume aérobie, seuil, VMA, allure spécifique, deload, reprise) et pourquoi, cohérente avec la forme et l'objectif.

## Une action
Une seule puce : l'action concrète n°1 à faire dès lundi (15 mots au plus). Pas d'autres puces.

Règles : reste concis (12-20 lignes au total). Les listes sont lues d'un coup d'œil : faits courts, sans phrase d'introduction. Appuie-toi sur les chiffres réels, ne les invente pas. Dans "Bilan d'entraînement" et "Sommeil & récupération", mets en **gras** (markdown) les 2-3 chiffres ou notions les plus importants de chaque section — pas plus. Respecte IMPÉRATIVEMENT les douleurs/blessures. Tutoie l'athlète, en français. Sois bienveillant mais honnête.

${COACH_COPY_DASH_RULE}`;
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Lundi de la semaine contenant `d` (ou de la semaine précédente). */
export function weekStartFor(d: Date): Date {
  return startOfWeek(startOfDay(d), { weekStartsOn: 1 });
}

function avg(values: (number | null | undefined)[]): number | null {
  const ok = values.filter((v): v is number => isSet(v));
  return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
}

function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/**
 * Série de 7 points (lundi→dimanche) pour un sparkline dans le bilan hebdo —
 * `null` un jour sans donnée, pas 0 (0 mentirait sur "aucune charge ce jour-là"
 * vs "pas mesuré"). Défaut : somme des valeurs du jour (charge) ; passer une
 * `reduce` pour une moyenne (score de sommeil, un seul relevé/jour la plupart
 * du temps mais on ne suppose pas).
 */
function buildDailySeries<T>(
  weekStart: Date,
  rows: T[],
  options: {
    getDate: (row: T) => Date | string;
    getValue: (row: T) => number | null | undefined;
    reduce?: (values: number[]) => number;
  },
): (number | null)[] {
  const { getDate, getValue, reduce = sum } = options;
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const row of rows) {
    const offset = differenceInCalendarDays(new Date(getDate(row)), weekStart);
    if (offset < 0 || offset > 6) {
      continue;
    }
    const value = getValue(row);
    if (isSet(value)) {
      buckets[offset].push(value);
    }
  }
  return buckets.map((values) => (values.length ? reduce(values) : null));
}

export type { WeeklyStats } from '@sharpit/app/lib/coach/weekly-stats';
import type { WeeklyStats } from '@sharpit/app/lib/coach/weekly-stats';

/** Construit les statistiques de la semaine [weekStart, weekStart+6]. */
async function buildWeeklyStats(athleteId: string, weekStart: Date): Promise<WeeklyStats> {
  const weekEnd = addDays(weekStart, 6);
  const prevStart = subDays(weekStart, 7);

  const [activities, planned, health, trainingStress] = await Promise.all([
    getActivities(athleteId, { limit: 200 }),
    getPlannedSessions(athleteId, { from: weekStart, to: weekEnd }),
    getHealthEntries(athleteId, 21),
    // Same Core-derived TSS as the ACWR gauge and fitness chart (pmc-server.ts) —
    // raw Activity.load is a bare provider passthrough (Garmin TSS only for
    // power-based bike sessions, Strava suffer_score only with HR data) and is
    // null for most run/hike/swim activities, which silently summed to 0 here.
    loadDailyTrainingStressEntries(athleteId, { refDate: addDays(weekEnd, 1) }),
  ]);

  const inWeek = activities.filter((a) => {
    const d = new Date(a.date);
    return d >= weekStart && d <= addDays(weekEnd, 1);
  });

  const loadInWeek = trainingStress.filter(
    (t) => t.date >= weekStart && t.date <= addDays(weekEnd, 1),
  );
  const loadInPrev = trainingStress.filter((t) => t.date >= prevStart && t.date < weekStart);

  const byTypeMap = new Map<string, { count: number; durationMin: number }>();
  for (const a of inWeek) {
    const key = TYPE_FR[a.type] ?? a.type;
    const cur = byTypeMap.get(key) ?? { count: 0, durationMin: 0 };
    cur.count += 1;
    cur.durationMin += a.duration ? Math.round(a.duration / 60) : 0;
    byTypeMap.set(key, cur);
  }

  const compliance = planned
    .filter((p) => p.completed && p.analysis)
    .map((p) => (p.analysis as { complianceScore?: number }).complianceScore)
    .filter((v): v is number => isSet(v));

  const weekHealth = health.filter((h) => {
    const d = new Date(h.date);
    return d >= weekStart && d <= addDays(weekEnd, 1);
  });

  const sleepView = analyzeSleep(weekHealth as unknown as SleepEntryInput[]);

  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    sessionsDone: inWeek.length,
    sessionsPlanned: planned.length,
    sessionsCompleted: planned.filter((p) => p.completed).length,
    totalLoad: Math.round(sum(loadInWeek.map((t) => t.load))),
    totalDurationMin: Math.round(sum(inWeek.map((a) => a.duration)) / 60),
    prevTotalLoad: Math.round(sum(loadInPrev.map((t) => t.load))),
    dailyLoad: buildDailySeries(weekStart, loadInWeek, {
      getDate: (t) => t.date,
      getValue: (t) => t.load,
    }),
    dailySleepScore: buildDailySeries(weekStart, weekHealth, {
      getDate: (h) => h.date,
      getValue: (h) => h.sleepScore,
      reduce: (values) => avg(values)!,
    }),
    byType: [...byTypeMap.entries()].map(([type, v]) => ({ type, ...v })),
    avgComplianceScore: compliance.length ? Math.round(avg(compliance)!) : null,
    sleep: {
      avgDurationMin: sleepView.avg.durationMin,
      avgScore: sleepView.avg.score,
      avgDeepPct: sleepView.avg.deepPct,
      avgRemPct: sleepView.avg.remPct,
      regularityMin: sleepView.regularityMin,
      recommendedBedtimeMin: sleepView.recommendedBedtimeMin,
    },
    recovery: {
      avgReadiness: avg(weekHealth.map((h) => h.recoveryScore)),
      avgHrv: avg(weekHealth.map((h) => h.hrv)),
      avgRestingHr: avg(weekHealth.map((h) => h.restingHr)),
    },
  };
}

function formatWeeklyVolumeLine(stats: WeeklyStats): string {
  const loadDelta =
    stats.prevTotalLoad > 0
      ? Math.round(((stats.totalLoad - stats.prevTotalLoad) / stats.prevTotalLoad) * 100)
      : null;
  return `Volume : ${formatSeances(stats.sessionsDone)}, ${formatDuration(stats.totalDurationMin)}, charge ${stats.totalLoad}${
    isSet(loadDelta)
      ? ` (${loadDelta > 0 ? '+' : ''}${loadDelta}% vs semaine précédente ${stats.prevTotalLoad})`
      : ''
  }.`;
}

function formatWeeklySleepLine(sleep: WeeklyStats['sleep']): string {
  const sleepBits = [
    isSet(sleep.avgDurationMin) ? `durée moy ${formatDuration(sleep.avgDurationMin)}` : null,
    isSet(sleep.avgScore) ? `score moy ${sleep.avgScore}/100` : null,
    isSet(sleep.avgDeepPct) ? `profond ${sleep.avgDeepPct}%` : null,
    isSet(sleep.avgRemPct) ? `REM ${sleep.avgRemPct}%` : null,
    isSet(sleep.regularityMin) ? `régularité ±${sleep.regularityMin} min` : null,
    isSet(sleep.recommendedBedtimeMin)
      ? `coucher conseillé ${formatClock(sleep.recommendedBedtimeMin)}`
      : null,
  ].filter(Boolean);
  return `Sommeil : ${sleepBits.length ? sleepBits.join(' · ') : 'données limitées'}.`;
}

function formatWeeklyRecoveryLine(recovery: WeeklyStats['recovery']): string | null {
  const recBits = [
    isSet(recovery.avgReadiness) ? `readiness moy ${Math.round(recovery.avgReadiness)}/100` : null,
    isSet(recovery.avgHrv) ? `HRV moy ${Math.round(recovery.avgHrv)} ms` : null,
    isSet(recovery.avgRestingHr) ? `FC repos moy ${Math.round(recovery.avgRestingHr)} bpm` : null,
  ].filter(Boolean);
  return recBits.length ? `Récupération : ${recBits.join(' · ')}.` : null;
}

/** The app sorts the review by its headings: in English they must be exactly these. */
function englishHeadings(): string {
  return currentLocale() === 'en'
    ? `\nUse exactly these English headings, in this order: ## Training summary, ## Sleep & recovery, ## What went well, ## Gaps to watch, ## Focus for next week, ## One action.`
    : '';
}

function formatWeeklyStats(stats: WeeklyStats): string {
  const lines: string[] = [];
  const start = new Date(`${stats.weekStart}T00:00:00`);
  const end = new Date(`${stats.weekEnd}T00:00:00`);
  lines.push(
    `## Semaine du ${format(start, 'd MMM', { locale: fr })} au ${format(end, 'd MMM yyyy', { locale: fr })}`,
  );
  lines.push(formatWeeklyVolumeLine(stats));

  if (stats.byType.length) {
    lines.push(
      `Répartition : ${stats.byType
        .map((t) => `${t.type} ${t.count} (${formatDuration(t.durationMin)})`)
        .join(' · ')}.`,
    );
  }
  lines.push(
    `Plan : ${stats.sessionsCompleted}/${stats.sessionsPlanned} ${
      stats.sessionsPlanned > 1 ? 'séances planifiées réalisées' : 'séance planifiée réalisée'
    }${
      isSet(stats.avgComplianceScore) ? `, conformité moyenne ${stats.avgComplianceScore}/100` : ''
    }.`,
  );
  lines.push(formatWeeklySleepLine(stats.sleep));

  const recoveryLine = formatWeeklyRecoveryLine(stats.recovery);
  if (recoveryLine) {
    lines.push(recoveryLine);
  }

  return lines.join('\n');
}

/** Génère le texte de la rétro hebdo (sans la persister). */
export async function generateWeeklyReviewContent(
  athleteId: string,
  weekStart: Date,
): Promise<{ content: string; stats: WeeklyStats }> {
  const [stats, ctx, profile] = await Promise.all([
    buildWeeklyStats(athleteId, weekStart),
    buildCoachContext(athleteId, addDays(weekStart, 6)),
    getAthleteProfile(athleteId),
  ]);
  // Contexte global de l'athlète (objectifs, forme, blessures, planifié à venir),
  // pris à la fin de la semaine concernée.

  const prompt = `${formatCoachContext(ctx)}

${formatWeeklyStats(stats)}

Rédige la rétrospective hebdomadaire en suivant la structure imposée. Mets l'accent sur l'analyse du sommeil de la semaine et son lien avec la récupération et la performance.`;

  const { text, usage } = await generateText({
    model: COACH_MODEL,
    system:
      inAnswerLanguage(buildWeeklySystem(toDisplayMode(profile?.displayMode))) + englishHeadings(),
    prompt,
    providerOptions: coachAsyncGatewayOptions,
    telemetry: { functionId: 'coach-weekly-review' },
  });
  void recordAiUsage(athleteId, 'coach', { ...usage, model: COACH_MODEL });

  return { content: sanitizeCoachCopy(text.trim()), stats };
}

function presentWeeklyReview<T extends { content: string } | null>(row: T): T {
  if (!row) {
    return row;
  }
  return { ...row, content: sanitizeCoachCopy(row.content) };
}

/** Lit la rétro hebdo stockée pour la semaine contenant `refDate`. */
export async function getWeeklyReview(athleteId: string, refDate: Date = new Date()) {
  const row = await prisma.weeklyReview.findUnique({
    where: {
      athleteId_weekStart: { athleteId, weekStart: utcDateOnly(weekStartFor(refDate)) },
    },
  });
  return presentWeeklyReview(row);
}

/**
 * Rétro la plus récente, quelle que soit la semaine — évite au lecteur de
 * deviner si la dernière génération porte sur la semaine écoulée (cron du
 * dimanche) ou la semaine en cours (génération à la demande, `current: true`).
 */
export async function getLatestWeeklyReview(athleteId: string) {
  const row = await prisma.weeklyReview.findFirst({
    where: { athleteId },
    orderBy: { weekStart: 'desc' },
  });
  return presentWeeklyReview(row);
}

/**
 * Génère et stocke la rétro hebdo. Par défaut on traite la semaine ÉCOULÉE
 * (utile pour un cron lancé en début de semaine), sauf si `current` est vrai.
 */
export async function generateAndStoreWeeklyReview(
  athleteId: string,
  refDate: Date = new Date(),
  options: { current?: boolean } = {},
) {
  if (!isCoachConfigured()) {
    throw new Error('Coach IA non configuré (AI_GATEWAY_API_KEY manquante).');
  }
  const base = options.current ? refDate : subDays(weekStartFor(refDate), 1);
  const weekStart = weekStartFor(base);
  const { content, stats } = await generateWeeklyReviewContent(athleteId, weekStart);
  const date = utcDateOnly(weekStart);
  return prisma.weeklyReview.upsert({
    where: { athleteId_weekStart: { athleteId, weekStart: date } },
    create: { athleteId, weekStart: date, content, stats: stats as object },
    update: { content, stats: stats as object, generatedAt: new Date() },
  });
}

/** True si on est dimanche (pour déclenchement cron). */
export function isSunday(d: Date = new Date()): boolean {
  return d.getDay() === 0;
}

/** Nombre de jours écoulés depuis la fin de la semaine la plus récente revue. */
export function daysSinceWeekEnd(weekStart: Date, refDate = new Date()): number {
  return differenceInCalendarDays(refDate, addDays(weekStart, 6));
}
