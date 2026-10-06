/**
 * The coach context: what the coach knows of the athlete when it answers. Reads its sources
 * (`coach-context-sources`), assembles them (`coach-context-assembly`) and writes them as prompt
 * text (`coach-context-format`). This module is the entry point, with a short-lived cache.
 */
import { format, startOfDay } from 'date-fns';
import { loadCoachContextSources } from '@sharpit/server/lib/coach/context/coach-context-sources';
import {
  assembleCoachContextPayload,
  type CoachContextData,
} from '@sharpit/server/lib/coach/context/coach-context-assembly';

export {
  buildPhysicalContext,
  legacyPhysicalTrend,
  type CoachActivity,
} from '@sharpit/server/lib/coach/context/coach-context-assembly';
export {
  COACH_CONTEXT_SECTIONS,
  DAY_LOAD_VS_STATUS_COACH_LINE,
  formatCoachActivityLine,
  formatCoachContext,
  formatConstraintsSection,
  formatDecisionSection,
  formatMetricGoalLine,
  type CoachContextSection,
} from '@sharpit/server/lib/coach/context/coach-context-format';

export type BuildCoachContextOptions = {
  /**
   * Load Scenario Engine comparison into the prompt.
   * Use for plan / adapt (horizon decisions). Skip for chat (tool on demand).
   */
  includeScenario?: boolean;
};

/**
 * Cache mémoire très court du contexte coach. Plusieurs endpoints IA (plan,
 * briefing, adaptation, rétro hebdo) peuvent être déclenchés à quelques secondes
 * d'intervalle : on évite alors de refaire les 7 requêtes DB. Le TTL court fait
 * que toute donnée modifiée est reprise quasi immédiatement (app mono-utilisateur).
 */
const CONTEXT_TTL_MS = 30_000;
let contextCache: {
  key: string;
  at: number;
  value: CoachContextData;
} | null = null;

/** Invalide le cache (à appeler après une mutation impactant le contexte). */
export function invalidateCoachContext() {
  contextCache = null;
}

export async function buildCoachContext(
  athleteId: string,
  refDate: Date = new Date(),
  options?: BuildCoachContextOptions,
): Promise<CoachContextData> {
  const includeScenario = options?.includeScenario === true;
  const key = `${athleteId}:${format(startOfDay(refDate), 'yyyy-MM-dd')}:sc${includeScenario ? 1 : 0}`;
  const now = Date.now();
  if (contextCache && contextCache.key === key && now - contextCache.at < CONTEXT_TTL_MS) {
    return contextCache.value;
  }
  const value = await buildCoachContextUncached(athleteId, refDate, { includeScenario });
  contextCache = { key, at: now, value };
  return value;
}

async function buildCoachContextUncached(
  athleteId: string,
  refDate: Date = new Date(),
  options?: BuildCoachContextOptions,
) {
  const includeScenario = options?.includeScenario === true;
  const today = startOfDay(refDate);
  const trainingDayId = format(today, 'yyyy-MM-dd');
  const sources = await loadCoachContextSources({
    athleteId,
    today,
    trainingDayId,
    includeScenario,
  });
  return assembleCoachContextPayload(today, sources, refDate);
}

export type CoachContext = Awaited<ReturnType<typeof buildCoachContext>>;
