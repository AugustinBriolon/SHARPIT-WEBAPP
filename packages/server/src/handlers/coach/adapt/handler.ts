import { runStructuredCoachStream } from '@sharpit/server/lib/coach/stream-structured-generation';
import { normalizeCoachPrescriptions } from '@sharpit/server/lib/coach/plan/normalize-plan-generation';
import { withCoachTrace } from '@sharpit/server/lib/ai/coach-trace';
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
} from '@sharpit/server/lib/coach/context/coach-context';
import { buildCoachKnowledgeQuery } from '@sharpit/server/lib/coach/knowledge/build-query';
import { formatKnowledgeRagBlock } from '@sharpit/server/lib/coach/knowledge/format-knowledge-rag-block';
import { retrieveCoachKnowledgeWithCorrection } from '@sharpit/server/lib/coach/knowledge/retrieve-coach-knowledge';
import { loadLearningMemoryBlock } from '@sharpit/server/lib/coach/memory/load-learning-memory-block';
import {
  getActiveTrainingPlan,
  getGoals,
  getPlannedSessionsForCoach,
} from '@sharpit/server/lib/queries';
import {
  resolveDefaultPlanGoalId,
  selectableDatedGoalIds,
} from '@sharpit/app/lib/planned-session/plan-goal';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import { formatStrengthSessionRules } from '@sharpit/server/lib/planned-session/strength/strength-session-template';
import { formatZoneTrainingRules } from '@sharpit/app/lib/physical-health/zone-training-rules';
import {
  adaptPlanGenerationSchema,
  adaptPlanSchema,
  adaptRequestSchema,
  type AdaptPlan,
} from '@sharpit/app/lib/validators/coach';
import {
  COACH_COPY_DASH_RULE,
  sanitizeCoachCopy,
} from '@sharpit/app/lib/coach/sanitize-coach-copy';
import { buildGateContext } from '@sharpit/server/lib/plan-gate/build-context';
import { evaluatePlan } from '@sharpit/server/lib/plan-gate/evaluate-plan';
import type { GateProposal, GateResult } from '@sharpit/app/lib/plan-gate/types';
import { computeTrainingDayId } from '@sharpit/core/training/training-day';
import { buildDecisionSnapshotContext } from '@sharpit/server/lib/decision-memory/build-snapshot-context';
import { createCoachingDecision } from '@sharpit/server/lib/decision-memory/repository';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import {
  COACH_PROGRESS_HEADERS,
  encodeCoachProgressEvent,
  type CoachProgressEvent,
} from '@sharpit/app/lib/coach/chat/transcript/coach-progress-stream';

type AdaptChange = AdaptPlan['changes'][number];
type UpcomingSession = Awaited<ReturnType<typeof getPlannedSessionsForCoach>>[number];

function pickNullable<T>(changeVal: T | null | undefined, existingVal?: T | null): T | null {
  return changeVal ?? existingVal ?? null;
}

function optionalAdaptFields(change: AdaptChange) {
  return {
    intensity: change.intensity ?? null,
    durationMin: change.durationMin ?? null,
    load: change.load ?? null,
    title: change.title ?? null,
    strengthPrescription: change.strengthPrescription ?? null,
    endurancePrescription: change.endurancePrescription ?? null,
    rationale: change.reason ?? null,
  };
}

function gateProposalFromAdd(
  change: AdaptChange,
  defaultGoalId: string | null,
): GateProposal | null {
  if (!change.date || !change.type) {
    return null;
  }
  return {
    sessionId: change.sessionId,
    action: 'ADD',
    date: change.date,
    startTime: null,
    type: change.type,
    goalId: defaultGoalId,
    ...optionalAdaptFields(change),
  };
}

function gateProposalFromModify(
  change: AdaptChange,
  existing: UpcomingSession,
  defaultGoalId: string | null,
): GateProposal {
  return {
    sessionId: change.sessionId,
    action: 'MODIFY',
    date: change.date ?? dayKeyFromDate(existing.date),
    startTime: null,
    type: change.type ?? existing.type,
    intensity: pickNullable(change.intensity, existing.intensity),
    durationMin: pickNullable(change.durationMin, existing.durationMin),
    load: pickNullable(change.load, existing.load),
    title: pickNullable(change.title, existing.title),
    strengthPrescription: change.strengthPrescription ?? null,
    endurancePrescription: change.endurancePrescription ?? null,
    rationale: change.reason ?? null,
    goalId: existing.goalId ?? defaultGoalId,
  };
}

/** Merges a MODIFY's partial fields onto the current session so date/type-dependent
 * rules (weekly load, recovery spacing, ...) evaluate the resulting state, not a
 * half-empty proposal. ADD proposals use the change's own fields directly. */
function toGateProposal(
  change: AdaptChange,
  existing: UpcomingSession | null,
  defaultGoalId: string | null,
): GateProposal | null {
  if (change.action === 'ADD') {
    return gateProposalFromAdd(change, defaultGoalId);
  }
  if (!existing) {
    return null;
  }
  return gateProposalFromModify(change, existing, defaultGoalId);
}

const TYPE_FR: Record<string, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
  STRENGTH: 'Renfo',
};

const SYSTEM_PROMPT = `Tu es un entraîneur expert en endurance. À partir de l'état de forme de l'athlète, de ce qu'il a RÉELLEMENT réalisé récemment (avec analyses prévu/réalisé) et de ses séances DÉJÀ PLANIFIÉES à venir, propose des ajustements pertinents du plan.

Pour chaque ajustement, choisis une action :
- MODIFY : modifier une séance existante (référence son sessionId, indique les champs à changer).
- REMOVE : supprimer une séance existante (sessionId).
- ADD : ajouter une nouvelle séance (sessionId=null, fournis une date yyyy-MM-dd dans la fenêtre).

Principes :
- Les séances marquées [clé] portent la préparation : quand une séance est manquée ou la semaine trop chargée, sacrifie d'abord les séances non clés, et déplace une séance clé manquée plutôt que de la supprimer.
- Si l'athlète a fait plus dur/long que prévu (fatigue accrue), allège ou recule les séances clés.
- S'il a fait plus facile ou manqué, tu peux densifier raisonnablement.
- Respecte la périodisation vers la course et la règle 80/20.
- Ne propose QUE des changements utiles : laisse les séances déjà bonnes telles quelles (ne les liste pas).
- Renseigne uniquement les champs à modifier pour MODIFY ; mets null ailleurs.
- durationMin et load doivent être des entiers (pas de décimales).
- Pour ADD/MODIFY d'une séance STRENGTH : renseigne strengthPrescription. null sinon.
- Pour ADD/MODIFY d'une séance RUN ou BIKE structurée : renseigne endurancePrescription (étapes et groupes répétés avec leur intensité, jamais d'allure ni de watts).

${formatStrengthSessionRules()}

${COACH_COPY_DASH_RULE}

FORMAT : le schéma de sortie fait autorité — noms de champs, valeurs autorisées et types viennent de lui, jamais de ce texte. N'ajoute aucun champ hors schéma et n'invente aucune valeur d'énumération.
- Si le plan manque de renfo/mobilité préventive alors qu'un objectif sportif est actif ET que le renfo ou la mobilité figure dans les sports pratiqués, ADD des séances STRENGTH (préventif + mobilité) adaptées au sport — sauf MOBILITY_ONLY/NONE / REST_ONLY. Sinon, n'ajoute pas de STRENGTH.
Réponds en français.`;

function adaptErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/gateway|fetch failed|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
    return 'Connexion au coach IA impossible. Vérifie ta connexion réseau (proxy, VPN, partage de connexion).';
  }
  if (/schema|validation|object/i.test(message)) {
    return 'Le coach a renvoyé une réponse invalide. Réessaie dans un instant.';
  }
  return 'La réadaptation a échoué. Réessaie dans un instant.';
}

function buildUpcomingLines(upcoming: UpcomingSession[]) {
  return upcoming.map((p) => {
    const bits = [
      `id=${p.id}`,
      format(p.date, 'EEE d MMM', { locale: fr }),
      TYPE_FR[p.type] ?? p.type,
      p.intensity ? intensityLabels[p.intensity] : null,
      p.durationMin ? `${p.durationMin} min` : null,
      p.load ? `${Math.round(p.load)} TSS` : null,
      p.title ? `"${p.title}"` : null,
      p.brickGroupId ? '[brick]' : null,
      p.isKey ? '[clé]' : null,
      p.completed ? '[réalisée]' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return `- ${bits}`;
  });
}

function buildAdaptPrompt(input: {
  focus: string | undefined;
  today: Date;
  horizon: Date;
  ctx: Awaited<ReturnType<typeof buildCoachContext>>;
  upcomingLines: string[];
  memoryBlock: string;
  knowledgeBlock: string;
}) {
  const { focus, today, horizon, ctx, upcomingLines, memoryBlock, knowledgeBlock } = input;
  return `${focus ? `Demande de l'athlète : ${focus}\n\n` : ''}Fenêtre d'ajustement : du ${format(today, 'd MMM', { locale: fr })} au ${format(horizon, 'd MMM yyyy', { locale: fr })} (dates ADD au format yyyy-MM-dd dans cette fenêtre).

${formatCoachContext(ctx)}${memoryBlock}${knowledgeBlock}${formatZoneTrainingRules(ctx.trainingZones, today)}

## Séances déjà planifiées à venir (à ajuster)
${upcomingLines.length ? upcomingLines.join('\n') : 'Aucune séance planifiée à venir.'}`;
}

function emptyAdaptResponse(budgetWarning: boolean) {
  return new Response(
    encodeCoachProgressEvent<AdaptPayload, unknown>({
      type: 'result',
      value: {
        summary:
          "Aucune séance planifiée sur la fenêtre : il n'y a rien à réadapter. Génère d'abord une semaine, puis reviens ici pour l'ajuster.",
        changes: [],
        gate: { sessions: [], planLevelFindings: [] },
      },
    }),
    { headers: withAiBudgetWarningHeader(COACH_PROGRESS_HEADERS, budgetWarning) },
  );
}

/** The goal a session the adjustment adds is attached to: the active plan's, else a dated goal. */
export async function loadAdaptDefaultGoalId(athleteId: string): Promise<string | null> {
  const [activePlan, goals] = await Promise.all([
    getActiveTrainingPlan(athleteId),
    getGoals(athleteId),
  ]);
  return resolveDefaultPlanGoalId(activePlan?.goalId, selectableDatedGoalIds(goals));
}

async function loadAdaptContext(athleteId: string, today: Date, days: number) {
  const horizon = addDays(today, days);
  const [ctx, upcoming, defaultGoalId] = await Promise.all([
    buildCoachContext(athleteId, today, { includeScenario: true }),
    getPlannedSessionsForCoach(athleteId, { from: today, to: horizon }),
    loadAdaptDefaultGoalId(athleteId),
  ]);
  return { ctx, upcoming, defaultGoalId, horizon };
}

type AdaptAccess = { blocked: NextResponse | null; budgetWarning: boolean };

async function checkAdaptAccess(athleteId: string): Promise<AdaptAccess> {
  const rateLimit = await checkRateLimit(rateLimiters.coachAdapt, athleteId, { failClosed: true });
  if (!rateLimit.ok) {
    const limited = rateLimitJsonResponse(rateLimit);
    return {
      blocked: NextResponse.json(limited.body, { status: limited.status }),
      budgetWarning: false,
    };
  }
  const budget = await ensureFreeAiBudget(athleteId);
  if (!budget.allowed) {
    return {
      blocked: NextResponse.json(aiBudgetResponseBody(budget.retryAfterSeconds!), {
        status: 402,
        headers: { [RETRY_AFTER_HEADER]: String(budget.retryAfterSeconds) },
      }),
      budgetWarning: false,
    };
  }
  return { blocked: null, budgetWarning: budget.warning };
}

type AdaptRequestParseResult =
  { ok: true; days: number; focus: string | undefined } | { ok: false; response: NextResponse };

async function parseAdaptRequest(req: Request): Promise<AdaptRequestParseResult> {
  const body = await req.json().catch(() => ({}));
  const parsed = adaptRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 }),
    };
  }
  const { days = 14, focus } = parsed.data;
  return { ok: true, days, focus: focus ?? undefined };
}

function createAdaptProgressStream(input: {
  athleteId: string;
  prompt: string;
  upcoming: UpcomingSession[];
  defaultGoalId: string | null;
  today: Date;
  budgetWarning: boolean;
}) {
  const { athleteId, prompt, upcoming, defaultGoalId, today } = input;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: CoachProgressEvent<AdaptPayload, unknown>) => {
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
        const { output, usage } = await withCoachTrace(
          { traceName: 'coach-adapt', athleteId, tags: ['adapt'] },
          () =>
            runStructuredCoachStream({
              schema: adaptPlanGenerationSchema,
              system: SYSTEM_PROMPT,
              prompt,
              // Measured: constrained at medium it failed outright or took over a minute; as
              // JSON at low, 23–30 s.
              reasoning: COACH_REASONING_LEVEL.plan,
              schemaInPrompt: true,
              onReasoning: (delta) => send({ type: 'reasoning', delta }),
              onPartial: (value) => send({ type: 'partial', value }),
            }),
        );
        void recordAiUsage(athleteId, 'coach', usage);
        send({
          type: 'result',
          value: await finalizeAdapt({
            athleteId,
            output,
            upcoming,
            defaultGoalId,
            today,
          }),
        });
      } catch (error) {
        console.error('[coach/adapt]', error);
        send({ type: 'error', message: adaptErrorMessage(error) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
}

function sanitizeOptionalCoachCopy(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return sanitizeCoachCopy(value);
}

async function ensureAdaptAccess(athleteId: string): Promise<NextResponse | AdaptAccess> {
  const aiBlocked = await requireAiProcessingConsent(athleteId);
  if (aiBlocked) {
    return aiBlocked;
  }
  return checkAdaptAccess(athleteId);
}

export async function POST(req: Request) {
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'Coach IA non configuré. Ajoute une clé AI_GATEWAY_API_KEY dans .env.',
      },
      { status: 503 },
    );
  }

  try {
    const parsedRequest = await parseAdaptRequest(req);
    if (!parsedRequest.ok) {
      return parsedRequest.response;
    }
    const { days, focus } = parsedRequest;

    const today = startOfDay(new Date());
    const athleteId = await getCurrentAthleteId();

    const accessResult = await ensureAdaptAccess(athleteId);
    if (accessResult instanceof NextResponse) {
      return accessResult;
    }
    const access = accessResult;
    if (access.blocked) {
      return access.blocked;
    }

    const { ctx, upcoming, defaultGoalId, horizon } = await loadAdaptContext(
      athleteId,
      today,
      days,
    );

    // Nothing to adapt: the model has no anchor and drifts into generating a
    // whole plan instead — inventing fields outside the schema, which then fails
    // validation after a full ~60s generation. Answer directly rather than pay
    // for an answer that cannot be right.
    if (upcoming.length === 0) {
      return emptyAdaptResponse(access.budgetWarning);
    }

    const knowledgeCues = {
      focus,
      sports: ctx.practicedSports,
      verdict: ctx.decision?.verdict ?? null,
      limitingFactor: ctx.decision?.limitingFactorDomain ?? null,
    };
    const [memoryBlock, knowledgeBlock] = await Promise.all([
      loadLearningMemoryBlock(athleteId, today),
      Promise.resolve(
        formatKnowledgeRagBlock(
          retrieveCoachKnowledgeWithCorrection(
            buildCoachKnowledgeQuery(knowledgeCues),
            knowledgeCues,
          ),
        ),
      ),
    ]);
    const prompt = buildAdaptPrompt({
      focus,
      today,
      horizon,
      ctx,
      upcomingLines: buildUpcomingLines(upcoming),
      memoryBlock,
      knowledgeBlock,
    });

    const stream = createAdaptProgressStream({
      athleteId,
      prompt,
      upcoming,
      defaultGoalId,
      today,
      budgetWarning: access.budgetWarning,
    });

    return new Response(stream, {
      headers: withAiBudgetWarningHeader(COACH_PROGRESS_HEADERS, access.budgetWarning),
    });
  } catch (error) {
    console.error('[coach/adapt]', error);
    return NextResponse.json({ error: adaptErrorMessage(error) }, { status: 500 });
  }
}

export type AdaptPayload = {
  summary: string;
  changes: (AdaptChange & { decisionId: string | null })[];
  gate: GateResult;
};

type FinalizeAdaptInput = {
  athleteId: string;
  output: unknown;
  upcoming: UpcomingSession[];
  defaultGoalId: string | null;
  today: Date;
};

/** Validates the model output, runs the Gate and records the coaching decisions. */
/** The answer with each change's prescriptions coerced, so one odd step does not void it all. */
function normalizeAdaptOutput(output: unknown): unknown {
  const changes = (output as { changes?: unknown })?.changes;
  if (!Array.isArray(changes)) {
    return output;
  }
  return {
    ...(output as object),
    changes: changes.map((change) =>
      change && typeof change === 'object'
        ? normalizeCoachPrescriptions(change as Record<string, unknown>)
        : change,
    ),
  };
}

async function finalizeAdapt(input: FinalizeAdaptInput): Promise<AdaptPayload> {
  const { athleteId, output, upcoming, defaultGoalId, today } = input;
  {
    const validated = adaptPlanSchema.safeParse(normalizeAdaptOutput(output));
    if (!validated.success) {
      console.error('[coach/adapt] validation', validated.error.flatten());
      throw new Error('Le coach a renvoyé une réponse invalide. Réessaie.');
    }

    const existingById = new Map(upcoming.map((s) => [s.id, s] as const));

    // REMOVE changes bypass the Gate entirely — there is no new session content to validate.
    // Pair each change with its proposal explicitly (toGateProposal can return null even for
    // a non-REMOVE change) so decisionIds always attach to the right change afterward.
    const gatedPairs = validated.data.changes
      .filter((c) => c.action !== 'REMOVE')
      .map((change) => ({
        change,
        proposal: toGateProposal(
          change,
          change.sessionId ? (existingById.get(change.sessionId) ?? null) : null,
          defaultGoalId,
        ),
      }))
      .filter(
        (pair): pair is { change: AdaptChange; proposal: GateProposal } => pair.proposal !== null,
      );
    const proposals = gatedPairs.map((pair) => pair.proposal);

    let gate: GateResult = { sessions: [], planLevelFindings: [] };
    const decisionIdByChange = new Map<AdaptChange, string>();
    const rejected = new Set<AdaptChange>();
    if (proposals.length > 0) {
      const { context: gateContext, snapshot } = await buildGateContext({
        athleteId,
        trainingDayId: computeTrainingDayId(today),
        proposals,
        goalId: defaultGoalId,
      });
      gate = evaluatePlan(gateContext, proposals);

      const snapshotContext = buildDecisionSnapshotContext(snapshot);
      const decisions = await Promise.all(
        gate.sessions.map((sessionResult) =>
          createCoachingDecision(athleteId, {
            trainingDayId: computeTrainingDayId(
              new Date(`${sessionResult.proposal.date}T00:00:00`),
            ),
            source: 'PLAN_ADAPTER',
            proposal: sessionResult.proposal,
            gateResult: sessionResult,
            snapshotContext,
            snapshotIdAtRecommendation: snapshot.snapshotId,
          }),
        ),
      );
      gatedPairs.forEach((pair, i) => decisionIdByChange.set(pair.change, decisions[i].id));
      gatedPairs.forEach((pair, i) => {
        if (gate.sessions[i]?.status === 'REJECTED') {
          rejected.add(pair.change);
        }
      });
    }

    // As for a generated week: the Gate is the last word before the athlete sees anything, so a
    // change it rejects is taken out here — its decision still recorded — never shown and refused.
    const changesWithDecisionId = validated.data.changes
      .filter((change) => !rejected.has(change))
      .map((change) => ({
        ...change,
        title: sanitizeOptionalCoachCopy(change.title),
        description: sanitizeOptionalCoachCopy(change.description),
        reason: sanitizeCoachCopy(change.reason),
        decisionId: decisionIdByChange.get(change) ?? null,
      }));

    return {
      summary: sanitizeCoachCopy(validated.data.summary),
      changes: changesWithDecisionId,
      gate,
    };
  }
}
