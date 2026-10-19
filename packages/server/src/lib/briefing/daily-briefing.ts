import { inAnswerLanguage } from '@sharpit/server/lib/locale/locale-context';
import {
  buildBriefingDayContext,
  formatBriefingDayContext,
} from '@sharpit/server/lib/briefing/briefing-context';
import {
  resolveBriefingPhase,
  resolveBriefingPhaseFromDailyPhase,
} from '@sharpit/server/lib/briefing/briefing-phase';
import { buildDailyPhaseDayContext } from '@sharpit/app/lib/daily-phase/day-context';
import { resolveDailyPhase } from '@sharpit/app/lib/daily-phase/resolve';
import {
  buildDeterministicBriefingFallback,
  validateBriefingContent,
} from '@sharpit/server/lib/briefing/briefing-validation';
import { generateText } from 'ai';
import { COACH_MODEL, coachAsyncGatewayOptions, isCoachConfigured } from '@sharpit/server/lib/ai';
import {
  buildCoachContext,
  formatCoachContext,
  invalidateCoachContext,
} from '@sharpit/server/lib/coach/context/coach-context';
import {
  COACH_COPY_DASH_RULE,
  sanitizeCoachCopy,
} from '@sharpit/app/lib/coach/sanitize-coach-copy';
import { recordAiUsage } from '@sharpit/server/lib/ai/usage';
import { athleteHasAiProcessingConsent } from '@sharpit/server/lib/privacy/consent-store';
import { prisma } from '@sharpit/db/client';
import { getActivities, getPlannedSessions } from '@sharpit/server/lib/queries';
import { startOfDay } from 'date-fns';

async function resolveAthleteCentricBriefingPhase(athleteId: string, refDate: Date) {
  const dayStart = startOfDay(refDate);
  const [activities, plannedSessions] = await Promise.all([
    getActivities(athleteId, { limit: 40 }),
    getPlannedSessions(athleteId, { from: dayStart, to: dayStart }),
  ]);
  const dayContext = buildDailyPhaseDayContext(
    refDate,
    activities as never,
    plannedSessions as never,
  );
  const resolution = resolveDailyPhase(
    {
      dayContext,
      athlete: {
        recommendationAvailable: true,
        adviceActionable: true,
        dailyStrainAvailable: false,
        newSessionSincePriorSnapshot: false,
        newInferenceSincePriorSnapshot: false,
        newObservationsSincePriorSnapshot: false,
        minutesSinceLastActivity: null,
        minutesSinceSnapshotGenerated: null,
        priorPhase: null,
        sleepLoggedTonight: false,
      },
      localHour: refDate.getHours(),
    },
    refDate,
  );
  return {
    briefingPhase: resolveBriefingPhaseFromDailyPhase(resolution.phase),
    dailyPhase: resolution.phase,
  };
}

function buildBriefingSystem(phase: ReturnType<typeof resolveBriefingPhase>): string {
  const phaseRules: Record<typeof phase, string> = {
    morning:
      "Focus : état de forme au réveil + séance(s) prévue(s) aujourd'hui. Pas de débrief de séances pas encore faites.",
    midday:
      "Focus : état actuel + séances déjà réalisées ce matin + ce qui reste prévu cet après-midi. Ne confonds pas hier et aujourd'hui.",
    afternoon:
      "Focus : débrief des séances déjà réalisées aujourd'hui + ajustement pour le reste de la journée (récup, séance restante ou repos).",
    evening:
      "Focus : bilan de la journée d'entraînement + récupération pour demain. Parle au passé pour les séances du jour.",
  };

  return `Tu es le coach d'endurance personnel de l'athlète. Tu rédiges son ${phase === 'morning' ? 'BILAN DU MATIN' : 'BILAN DU JOUR'} : court, concret, motivant, basé sur ses données réelles.

${phaseRules[phase]}

RÈGLES IMPÉRATIVES sur les séances :
- Les séances listées dans "RÉALISÉES aujourd'hui" sont AUJOURD'HUI uniquement.
- Les séances listées dans "HIER" sont HIER — ne les présente JAMAIS comme des séances d'aujourd'hui.
- Si une séance est hier (ex. natation hier) et une autre aujourd'hui (ex. vélo ce midi), mentionne-les avec la bonne temporalité.
- Ne fusionne pas plusieurs séances de jours différents en une seule phrase "aujourd'hui".

Structure (markdown concis, pas de titre niveau 1/2) :
- **Accroche** : état de forme actuel (readiness, TSB, sommeil, HRV) — 1-2 chiffres clés.
- **Séances** : selon la phase — prévu (matin), débrief réalisé + reste (après-midi), bilan du jour (soir).
- **Point d'attention** (optionnel) : blessure, fatigue, surcharge.

5 à 8 lignes max. Pas de blabla. Respecte IMPÉRATIVEMENT les douleurs/blessures. Français, tutoiement.

${COACH_COPY_DASH_RULE}`;
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Génère le texte du bilan du jour (sans le persister). */
export async function generateDailyBriefingContent(
  athleteId: string,
  refDate: Date = new Date(),
  options: { allowLlm?: boolean } = {},
): Promise<{
  content: string;
  readiness: number | null;
  phaseAtGeneration: ReturnType<typeof resolveBriefingPhase>;
}> {
  invalidateCoachContext();
  const { briefingPhase: phase, dailyPhase } = await resolveAthleteCentricBriefingPhase(
    athleteId,
    refDate,
  );
  const [ctx, dayCtx] = await Promise.all([
    buildCoachContext(athleteId, refDate),
    buildBriefingDayContext(athleteId, refDate, dailyPhase),
  ]);

  const allowLlm = options.allowLlm ?? (await athleteHasAiProcessingConsent(athleteId));
  if (!allowLlm) {
    // Deterministic Twin path — no athlete context sent to an LLM.
    return {
      content: sanitizeCoachCopy(buildDeterministicBriefingFallback(dayCtx, ctx)),
      readiness: ctx.health.readinessToday,
      phaseAtGeneration: phase,
    };
  }

  const prompt = `${formatCoachContext(ctx)}

${formatBriefingDayContext(dayCtx)}

Rédige le ${dayCtx.phaseLabel} en suivant la structure imposée et les règles de temporalité.`;

  const { text, usage } = await generateText({
    model: COACH_MODEL,
    system: inAnswerLanguage(buildBriefingSystem(phase)),
    prompt,
    providerOptions: coachAsyncGatewayOptions,
    telemetry: { functionId: 'coach-briefing' },
  });
  // Written for the athlete, never asked by them: its own ledger, so it cannot spend the coach
  // budget their plan and questions need.
  void recordAiUsage(athleteId, 'briefing', { ...usage, model: COACH_MODEL });

  const llmContent = text.trim();
  const validation = validateBriefingContent(llmContent, dayCtx, ctx);
  const raw = validation.valid ? llmContent : buildDeterministicBriefingFallback(dayCtx, ctx);
  const content = sanitizeCoachCopy(raw);

  if (!validation.valid) {
    console.warn('[daily-briefing] validation failed:', validation.reason);
  }

  return { content, readiness: ctx.health.readinessToday, phaseAtGeneration: phase };
}

function presentDailyBriefing<T extends { content: string } | null>(row: T): T {
  if (!row) {
    return row;
  }
  return { ...row, content: sanitizeCoachCopy(row.content) };
}

/** Lit le bilan stocké pour une date (null si absent). */
export async function getDailyBriefing(athleteId: string, refDate: Date = new Date()) {
  const row = await prisma.dailyBriefing.findUnique({
    where: { athleteId_date: { athleteId, date: utcDateOnly(refDate) } },
  });
  return presentDailyBriefing(row);
}

/** Whether a briefing generated at `generatedAt` is recent enough to keep as it is. */
export function isBriefingFresh(generatedAt: Date, now: Date, minIntervalMinutes: number): boolean {
  return now.getTime() - generatedAt.getTime() < minIntervalMinutes * 60_000;
}

/** Génère le bilan du jour et le stocke (upsert sur la date).
 * Without AI consent (or without AI gateway), stores the deterministic fallback only.
 * `minIntervalMinutes` keeps a briefing written that recently instead of asking the model again:
 * a history import syncs in batches, and each batch regenerated it (ADR-092). */
export async function generateAndStoreDailyBriefing(
  athleteId: string,
  refDate: Date = new Date(),
  options: { minIntervalMinutes?: number } = {},
) {
  if (options.minIntervalMinutes) {
    const existing = await prisma.dailyBriefing.findUnique({
      where: { athleteId_date: { athleteId, date: utcDateOnly(refDate) } },
    });
    if (existing && isBriefingFresh(existing.generatedAt, new Date(), options.minIntervalMinutes)) {
      return existing;
    }
  }
  const hasAiConsent = await athleteHasAiProcessingConsent(athleteId);
  const allowLlm = hasAiConsent && isCoachConfigured();
  const { content, readiness, phaseAtGeneration } = await generateDailyBriefingContent(
    athleteId,
    refDate,
    { allowLlm },
  );
  const date = utcDateOnly(refDate);
  return prisma.dailyBriefing.upsert({
    where: { athleteId_date: { athleteId, date } },
    create: { athleteId, date, content, readiness, phaseAtGeneration },
    update: { content, readiness, phaseAtGeneration, generatedAt: new Date() },
  });
}
