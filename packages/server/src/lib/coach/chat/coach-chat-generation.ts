import { stepCountIs } from 'ai';
import { COACH_MAX_OUTPUT_TOKENS, coachGatewayOptions } from '@sharpit/server/lib/ai';
import type { CoachRequestScope } from '@sharpit/server/lib/coach/chat/coach-request-scope';

/**
 * How the coach chat calls the model, apart from the model itself and the prompt: shared by the
 * route and the model benchmark, so a benchmark measures what athletes actually get.
 */
export function coachChatGenerationSettings(scope: CoachRequestScope) {
  return {
    // Only the tools this question can use: fewer schemas in every step's prompt.
    ...(scope.tools ? { activeTools: [...scope.tools] } : {}),
    // Les actions qui modifient le calendrier / le journal nécessitent la validation de l'athlète.
    // listPlannedSessions (lecture seule) s'exécute automatiquement.
    //
    // Intentionally no `experimental_toolApprovalSecret`: the AI SDK HMAC binds the exact
    // tool input, which would reject athlete edits (grams / meal) on the approval card.
    // Binding is instead: Clerk session → athleteId, plus CoachToolExecution idempotency
    // on (athleteId, toolCallId), with zod revalidation of the edited input before write.
    toolApproval: {
      createPlannedSession: 'user-approval',
      createBrickSession: 'user-approval',
      updatePlannedSession: 'user-approval',
      deletePlannedSession: 'user-approval',
      setTravelContext: 'user-approval',
      logFoods: 'user-approval',
    },
    // Keep tool loops short — DeepSeek Flash can otherwise re-call list tools and bloat the SSE.
    stopWhen: stepCountIs(4),
    // No smoothing: a 12 ms pause per word held a long answer back by seconds, on a screen
    // the athlete is waiting on. Clients render the stream as it comes.
    reasoning: scope.reasoning,
    maxOutputTokens: COACH_MAX_OUTPUT_TOKENS.conversational,
    providerOptions: coachGatewayOptions,
  } as const;
}
