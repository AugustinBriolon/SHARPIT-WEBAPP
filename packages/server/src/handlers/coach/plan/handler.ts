import { addDays, format, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { NextResponse } from 'next/server';
import { COACH_REASONING_LEVEL, isCoachConfigured } from '@sharpit/server/lib/ai';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { recordAiUsage } from '@sharpit/server/lib/ai/usage';
import {
  RETRY_AFTER_HEADER,
  aiBudgetResponseBody,
  ensureFreeAiBudget,
  withAiBudgetWarningHeader,
} from '@sharpit/server/lib/access/ai-budget';
import { requireAiProcessingConsent } from '@sharpit/server/lib/privacy/consent-store';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import {
  buildCoachContext,
  formatCoachContext,
  type CoachContext,
} from '@sharpit/server/lib/coach/context/coach-context';
import {
  COACH_PROGRESS_HEADERS,
  encodeCoachProgressEvent,
  type CoachProgressEvent,
} from '@sharpit/app/lib/coach/chat/transcript/coach-progress-stream';
import { runStructuredCoachStream } from '@sharpit/server/lib/coach/stream-structured-generation';
import { withCoachTrace } from '@sharpit/server/lib/ai/coach-trace';
import { buildBusySummary } from '@sharpit/server/lib/coach/plan/calendar-availability';
import { getAthleteProfile, getGoalById } from '@sharpit/server/lib/queries';
import {
  athleteThresholds,
  buildPlannedSessionSteps,
  type PlannedSessionBreakdown,
} from '@sharpit/server/lib/planned-session/session-steps';
import {
  coachPlanGenerationSchema,
  coachPlanRequestSchema,
  type CoachPlan,
} from '@sharpit/app/lib/validators/coach';
import type { z } from 'zod';
import { chooseKeySessions } from '@sharpit/app/lib/planned-session/key-sessions';
import { buildGateContext } from '@sharpit/server/lib/plan-gate/build-context';
import { evaluatePlan } from '@sharpit/server/lib/plan-gate/evaluate-plan';
import type { GateProposal } from '@sharpit/app/lib/plan-gate/types';
import { computeTrainingDayId } from '@sharpit/core/training/training-day';
import { buildDecisionSnapshotContext } from '@sharpit/server/lib/decision-memory/build-snapshot-context';
import { createCoachingDecision } from '@sharpit/server/lib/decision-memory/repository';
import { formatStrengthSessionRules } from '@sharpit/server/lib/planned-session/strength/strength-session-template';
import { formatZoneTrainingRules } from '@sharpit/app/lib/physical-health/zone-training-rules';
import { buildCoachKnowledgeQuery } from '@sharpit/server/lib/coach/knowledge/build-query';
import { formatKnowledgeRagBlock } from '@sharpit/server/lib/coach/knowledge/format-knowledge-rag-block';
import { retrieveCoachKnowledgeWithCorrection } from '@sharpit/server/lib/coach/knowledge/retrieve-coach-knowledge';
import { loadLearningMemoryBlock } from '@sharpit/server/lib/coach/memory/load-learning-memory-block';
import {
  formatTravelConstraintPromptRule,
  resolvePlanTargetUnderTravel,
} from '@sharpit/app/lib/travel-context/training-constraint';
import {
  COACH_COPY_DASH_RULE,
  sanitizeCoachCopy,
} from '@sharpit/app/lib/coach/sanitize-coach-copy';
import { generatedSessionPayload } from '@sharpit/app/lib/planned-session/generated-session-payload';
import { normalizeCoachPlanGeneration } from '@sharpit/server/lib/coach/plan/normalize-plan-generation';
import {
  coachGenerationErrorDetails,
  planGenerationErrorMessage,
} from '@sharpit/server/lib/coach/plan/plan-generation-errors';

// Kept deliberately short. A 10 872-char version of this prompt made the model
// abandon the output schema entirely — inventing field names and enum values —
// while the same schema and context with a brief prompt produced 8 valid
// sessions. Domain rules stay; prose padding does not.
const SYSTEM_PROMPT = `Tu es un entraîneur d'élite en endurance (triathlon, course, vélo, natation). Tu proposes des séances précises et sûres à partir des données réelles fournies. Jamais de plan générique. Réponds en français.

Règles :
- Périodise vers la course principale (base → spécifique → affûtage) selon les semaines restantes.
- Module selon TSB et récupération : fatigué (TSB très négatif, readiness basse) → récup/endurance ; frais → séances clés.
- Respecte les jours d'entraînement habituels ; repos ailleurs. Ne duplique pas ce qui est déjà planifié.
- 80/20 : majorité d'endurance, 2-3 séances qualité/semaine max, surcharge progressive.
- Cibles concrètes depuis les seuils (FC via LTHR/FC max, puissance via FTP, allure via allure seuil). Seuil manquant → RPE/zones, et signale-le.
- TSS réaliste par séance. Aucun texte de description : le déroulé structuré suffit.
- Exploite la conformité prévu/réalisé et le ressenti (RPE, feeling).

Sécurité (impératif) :
- Respecte ABSOLUMENT la condition physique déclarée : n'aggrave jamais une zone sensible, baisse l'intensité, cible renfo/mobilité. Réduis la charge dès que la récupération signale une fatigue excessive.
- Dès qu'un objectif sportif est présent, et SI le renfo ou la mobilité figure dans les sports pratiqués, inclus dans la fenêtre — sauf voyage MOBILITY_ONLY/NONE ou capacité REST_ONLY — au moins une séance STRENGTH préventive spécifique au sport (stabilisateurs, chaîne postérieure, core, hanches/genoux/épaules) ET un bloc mobilité/étirements ciblés. Sinon, n'ajoute pas de STRENGTH.
- Information manquante → hypothèse CONSERVATRICE. N'invente jamais de données.

${formatStrengthSessionRules()}

${COACH_COPY_DASH_RULE}

Sortie : le schéma fait autorité pour les noms de champs, les types et les valeurs d'énumération — jamais ce texte. N'ajoute aucun champ hors schéma. Séance STRENGTH : strengthPrescription obligatoire (noms français, blocs et volume ci-dessus) ; RUN/BIKE/SWIM : null. Séance RUN, BIKE ou SWIM, même continue : endurancePrescription obligatoire (échauffement, corps, retour au calme) — étapes et groupes répétés avec leur intensité, jamais d'allure ni de watts, l'app les dérive des seuils. Textes courts : titre, une phrase de justification.`;

function buildGoalBlock(goal: NonNullable<Awaited<ReturnType<typeof getGoalById>>>, start: Date) {
  const daysToGo = goal.targetDate
    ? Math.round((startOfDay(goal.targetDate).getTime() - start.getTime()) / 86400_000)
    : null;
  const bits = [
    `Objectif ciblé : ${goal.title}`,
    goal.location ? `lieu ${goal.location}` : null,
    goal.targetDate ? `date ${format(goal.targetDate, 'd MMMM yyyy', { locale: fr })}` : null,
    daysToGo !== null ? `dans ${daysToGo} jours (~${Math.round(daysToGo / 7)} semaines)` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `\n\n## Objectif prioritaire pour ce bloc
${bits}
Périodise IMPÉRATIVEMENT ce bloc en fonction de cette échéance (base → spécifique → affûtage selon les semaines restantes). Oriente le contenu des séances vers les exigences de cet objectif.`;
}

function appendTravelConstraintRule(
  macroBlock: string,
  travelResolved: ReturnType<typeof resolvePlanTargetUnderTravel>,
) {
  if (!travelResolved.constraint && travelResolved.allowedDisciplines.length === 0) {
    return macroBlock;
  }
  return `${macroBlock}\n${formatTravelConstraintPromptRule(
    travelResolved.constraint,
    travelResolved.allowedDisciplines,
  )}`;
}

function buildMacroBlock(input: {
  effectiveTargetLoad: number | null;
  planPhase: string | undefined;
  effectivePlanFocus: string | null;
  travelResolved: ReturnType<typeof resolvePlanTargetUnderTravel>;
}) {
  const { effectiveTargetLoad, planPhase, effectivePlanFocus, travelResolved } = input;
  if (effectiveTargetLoad === null && !planPhase && !effectivePlanFocus) {
    return '';
  }
  const bits = [
    planPhase ? `Phase du macro-plan : ${planPhase}` : null,
    effectiveTargetLoad !== null
      ? `Charge hebdomadaire cible : ${effectiveTargetLoad} TSS (répartis sur les séances du bloc)`
      : null,
    effectivePlanFocus ? `Focus de la semaine : ${effectivePlanFocus}` : null,
  ].filter(Boolean);
  const macroBlock = `\n\n## Macro-plan de la semaine
${bits.join('\n')}
Calibre le volume et l'intensité des séances pour approcher cette charge cible sans la dépasser de plus de 10 %.`;
  return appendTravelConstraintRule(macroBlock, travelResolved);
}

function buildAgendaBlock(busySummary: string | null) {
  if (busySummary) {
    return `\n\n## Agenda de l'athlète (créneaux occupés à éviter)
Place chaque séance à une heure LIBRE ('startTime' au format HH:mm), entre 06:00 et 21:00, jamais la nuit. Ne surcharge pas un jour déjà très occupé : si une journée est pleine, allège ou déplace la séance. Vérifie que la durée de la séance tient dans un créneau libre.
${busySummary}`;
  }
  return `\n\n## Agenda
Aucun agenda connecté : propose des heures réalistes ('startTime' entre 06:00 et 21:00) ou laisse 'startTime' à null.`;
}

function buildPlanPrompt(input: {
  days: number;
  start: Date;
  focus: string | undefined;
  contextText: string;
  memoryBlock: string;
  knowledgeBlock: string;
  goalBlock: string;
  macroBlock: string;
  agendaBlock: string;
  /** Names the zones to protect — the static rules block cannot, it is shared by every athlete. */
  sensitiveZonesBlock: string;
}) {
  const {
    days,
    start,
    focus,
    contextText,
    memoryBlock,
    knowledgeBlock,
    goalBlock,
    macroBlock,
    agendaBlock,
  } = input;
  return `Génère un plan d'entraînement couvrant ${days} jour(s) à partir du ${format(
    start,
    'EEEE d MMMM yyyy',
    { locale: fr },
  )} (dayOffset 0 = ce jour-là, dayOffset 1 = lendemain, etc.).

${focus ? `Demande spécifique de l'athlète : ${focus}\n\n` : ''}Données de l'athlète :

${contextText}${memoryBlock}${knowledgeBlock}${goalBlock}${macroBlock}${agendaBlock}${input.sensitiveZonesBlock}`;
}

async function buildPlanGenerationContext(
  athleteId: string,
  parsed: z.infer<typeof coachPlanRequestSchema>,
  start: Date,
) {
  const { days = 7, focus, goalId, targetLoad, planPhase, planFocus } = parsed;
  const [ctx, busySummary, goal] = await Promise.all([
    buildCoachContext(athleteId, start, { includeScenario: true }),
    buildBusySummary(athleteId, start, days),
    goalId ? getGoalById(athleteId, goalId) : Promise.resolve(null),
  ]);

  const travelWindows = (ctx.travel ?? []).map((t: CoachContext['travel'][number]) => ({
    startDate: new Date(`${t.startDate}T00:00:00`),
    endDate: new Date(`${t.endDate}T00:00:00`),
    label: t.label,
    trainingConstraint: t.trainingConstraint,
    allowedDisciplines: t.allowedDisciplines ?? [],
  }));
  const travelResolved = resolvePlanTargetUnderTravel({
    startDate: start,
    days,
    targetLoad,
    planFocus,
    travels: travelWindows,
  });

  return { ctx, busySummary, goal, days, focus, goalId, travelResolved, planPhase };
}

async function preparePlanGeneration(
  athleteId: string,
  parsed: z.infer<typeof coachPlanRequestSchema>,
) {
  const start = startOfDay(parsed.startDate ?? new Date());

  const rateLimit = await checkRateLimit(rateLimiters.coachPlan, athleteId, { failClosed: true });
  if (!rateLimit.ok) {
    const limited = rateLimitJsonResponse(rateLimit);
    return {
      ok: false as const,
      response: NextResponse.json(limited.body, { status: limited.status }),
    };
  }

  const budget = await ensureFreeAiBudget(athleteId);
  if (!budget.allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(aiBudgetResponseBody(budget.retryAfterSeconds!, budget.isPro), {
        status: 402,
        headers: { [RETRY_AFTER_HEADER]: String(budget.retryAfterSeconds) },
      }),
    };
  }

  const { ctx, busySummary, goal, days, focus, goalId, travelResolved, planPhase } =
    await buildPlanGenerationContext(athleteId, parsed, start);

  const goalBlock = goal ? buildGoalBlock(goal, start) : '';
  const macroBlock = buildMacroBlock({
    effectiveTargetLoad: travelResolved.targetLoad,
    planPhase: planPhase ?? undefined,
    effectivePlanFocus: travelResolved.planFocus,
    travelResolved,
  });
  const agendaBlock = buildAgendaBlock(busySummary);
  const knowledgeCues = {
    focus,
    sports: ctx.practicedSports,
    verdict: ctx.decision?.verdict ?? null,
    limitingFactor: ctx.decision?.limitingFactorDomain ?? null,
    planPhase: planPhase ?? null,
  };
  const [memoryBlock, knowledgeBlock] = await Promise.all([
    loadLearningMemoryBlock(athleteId, start),
    Promise.resolve(
      formatKnowledgeRagBlock(
        retrieveCoachKnowledgeWithCorrection(
          buildCoachKnowledgeQuery(knowledgeCues),
          knowledgeCues,
        ),
      ),
    ),
  ]);
  const prompt = buildPlanPrompt({
    days,
    start,
    focus: focus ?? undefined,
    contextText: formatCoachContext(ctx),
    memoryBlock,
    knowledgeBlock,
    goalBlock,
    macroBlock,
    agendaBlock,
    sensitiveZonesBlock: formatZoneTrainingRules(ctx.trainingZones, start),
  });

  return {
    ok: true as const,
    start,
    goalId: goalId ?? null,
    prompt,
    budgetWarning: budget.warning,
  };
}

type PreparedPlan = Extract<Awaited<ReturnType<typeof preparePlanGeneration>>, { ok: true }>;

/**
 * Everything checked before the coach is asked: configuration, the request, the AI consent,
 * the rate limit and the AI budget. Shared by the streamed route and the background job.
 */
export async function preparePlanRequest(
  req: Request,
): Promise<
  { ok: false; response: NextResponse } | { ok: true; athleteId: string; prepared: PreparedPlan }
> {
  if (!isCoachConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Coach IA non configuré. Ajoute une clé AI_GATEWAY_API_KEY dans le fichier .env (Vercel → AI Gateway → API Keys), puis redémarre le serveur.',
        },
        { status: 503 },
      ),
    };
  }

  const body = await req.json().catch(() => ({}));
  const parsed = coachPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 }),
    };
  }

  const athleteId = await getCurrentAthleteId();
  const aiBlocked = await requireAiProcessingConsent(athleteId);
  if (aiBlocked) {
    return { ok: false, response: aiBlocked };
  }
  const prepared = await preparePlanGeneration(athleteId, parsed.data);
  if (!prepared.ok) {
    return { ok: false, response: prepared.response };
  }
  return { ok: true, athleteId, prepared };
}

/** Asks the coach for the week, then dates it, runs the Gate and records the decisions. */
export async function generatePlan(
  athleteId: string,
  prepared: PreparedPlan,
  progress: { onPartial: (value: unknown) => void; onReasoning?: (delta: string) => void },
): Promise<PlanPayload> {
  const { output, usage } = await withCoachTrace(
    { traceName: 'coach-plan', athleteId, tags: ['plan'] },
    () =>
      runStructuredCoachStream({
        schema: coachPlanGenerationSchema,
        system: SYSTEM_PROMPT,
        prompt: prepared.prompt,
        reasoning: COACH_REASONING_LEVEL.plan,
        schemaInPrompt: true,
        onReasoning: progress.onReasoning ?? (() => {}),
        onPartial: progress.onPartial,
      }),
  );
  void recordAiUsage(athleteId, 'coach', usage);
  return finalizePlan(athleteId, output, prepared.start, prepared.goalId ?? null);
}

export async function POST(req: Request) {
  const request = await preparePlanRequest(req);
  if (!request.ok) {
    return request.response;
  }
  const { athleteId, prepared } = request;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: CoachProgressEvent<PlanPayload, unknown>) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(encodeCoachProgressEvent(event)));
        } catch {
          // Athlete navigated away mid-generation — stop writing, let it unwind.
          closed = true;
        }
      };

      try {
        const value = await generatePlan(athleteId, prepared, {
          onReasoning: (delta) => send({ type: 'reasoning', delta }),
          onPartial: (partial) => send({ type: 'partial', value: partial }),
        });
        send({ type: 'result', value });
      } catch (error) {
        const details = coachGenerationErrorDetails(error);
        console.error('[coach/plan]', error, details ? { zod: details } : undefined);
        send({ type: 'error', message: planGenerationErrorMessage(error) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: withAiBudgetWarningHeader(COACH_PROGRESS_HEADERS, prepared.budgetWarning),
  });
}

export type PlanPayload = {
  summary: string;
  startDate: string;
  sessions: (CoachPlan['sessions'][number] & {
    date: string;
    startTime: string | null;
    decisionId: string;
    breakdown: PlannedSessionBreakdown;
    key: boolean;
  })[];
  gate: ReturnType<typeof evaluatePlan>;
};

/** Dates the proposed sessions, runs the Gate and records the coaching decisions. */
async function finalizePlan(
  athleteId: string,
  rawOutput: unknown,
  start: Date,
  goalId: string | null,
): Promise<PlanPayload> {
  {
    const normalized = normalizeCoachPlanGeneration(rawOutput);
    if (!normalized.ok) {
      console.error('[coach/plan] normalize failed', normalized.issues);
      throw new Error(
        normalized.issues[0] ?? 'Le coach a renvoyé une proposition incomplète. Réessaie.',
      );
    }
    const output = normalized.plan;

    const sessions = [...output.sessions]
      .sort((a, b) => a.dayOffset - b.dayOffset)
      .map((s) => ({
        ...s,
        date: format(addDays(start, s.dayOffset), 'yyyy-MM-dd'),
        startTime: s.startTime ?? null,
      }));

    const proposals: GateProposal[] = sessions.map((s) => ({
      sessionId: null,
      action: 'ADD',
      date: s.date,
      startTime: s.startTime,
      type: s.type,
      intensity: s.intensity,
      durationMin: s.durationMin,
      load: s.load,
      title: s.title,
      strengthPrescription: s.strengthPrescription ?? null,
      endurancePrescription: s.endurancePrescription ?? null,
      rationale: s.rationale ?? null,
      goalId: goalId ?? null,
    }));

    const { context: gateContext, snapshot } = await buildGateContext({
      athleteId,
      trainingDayId: computeTrainingDayId(start),
      proposals,
      goalId,
    });
    const gate = evaluatePlan(gateContext, proposals);

    const snapshotContext = buildDecisionSnapshotContext(snapshot);
    const decisionIds = await Promise.all(
      gate.sessions.map((sessionResult) =>
        createCoachingDecision(athleteId, {
          trainingDayId: computeTrainingDayId(new Date(`${sessionResult.proposal.date}T00:00:00`)),
          source: 'PLAN_GENERATOR',
          proposal: sessionResult.proposal,
          gateResult: sessionResult,
          snapshotContext,
          snapshotIdAtRecommendation: snapshot.snapshotId,
        }),
      ),
    ).then((decisions) => decisions.map((d) => d.id));

    // The Gate is the last word before the athlete sees anything: a session it rejects is
    // taken out here — its decision still recorded — rather than shown and refused on « Ajouter ».
    const kept = gate.sessions
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status !== 'REJECTED')
      .map(({ index }) => index);
    const keptProposals = kept.map((index) => proposals[index]);
    const keptGate =
      kept.length === proposals.length ? gate : evaluatePlan(gateContext, keptProposals);

    // Resolved like a planned session's, so a proposal opens on the steps it would store.
    const profile = await getAthleteProfile(athleteId);
    const thresholds = athleteThresholds(profile);
    const keySessions = chooseKeySessions(kept.map((index) => sessions[index]));
    const sessionsWithDecisionId = kept.map((index, position) => {
      const s = sessions[index];
      return {
        ...s,
        key: keySessions.has(position),
        breakdown: buildPlannedSessionSteps(s, thresholds, {
          defaultPoolLengthM: profile?.defaultPoolLengthM,
        }),
        title: sanitizeCoachCopy(s.title),
        // Written from the steps, not by the coach: the model spends no time on prose.
        description: generatedSessionPayload({ ...s, decisionId: null }, goalId).description,
        rationale: sanitizeCoachCopy(s.rationale),
        decisionId: decisionIds[index],
      };
    });
    if (sessionsWithDecisionId.length === 0) {
      throw new Error(
        'Aucune séance exploitable : le coach n’a proposé que des séances à éviter pour toi en ce moment. Précise ta demande et réessaie.',
      );
    }

    return {
      summary: sanitizeCoachCopy(output.summary),
      startDate: format(start, 'yyyy-MM-dd'),
      sessions: sessionsWithDecisionId,
      gate: keptGate,
    };
  }
}
