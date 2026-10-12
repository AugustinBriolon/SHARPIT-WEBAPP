import { ActivityType } from '@prisma/client';
import { generateText, Output } from 'ai';
import {
  COACH_MODEL,
  coachAnalysisGatewayOptions,
  isCoachConfigured,
} from '@sharpit/server/lib/ai';
import { canGenerateNarrativeForActivity } from '@sharpit/server/lib/access/narrative-trial';
import { isActivityToday } from '@sharpit/app/lib/activity/list/activity-day';
import {
  isEligibleForActivityNarrative,
  NARRATIVE_ANALYSIS_SINCE,
} from '@sharpit/app/lib/activity/narrative/activity-narrative-config';
import { buildActivityNarrativeFacts } from '@sharpit/server/lib/activity/narrative/activity-narrative-facts';
import { withAnalysisRun } from '@sharpit/server/lib/analysis/analysis-run-store';
import { mapWithConcurrency } from '@sharpit/server/lib/async/map-with-concurrency';
import { recordAiUsage } from '@sharpit/server/lib/ai/usage';
import { prisma } from '@sharpit/db/client';
import { activityNarrativeSchema, type ActivityNarrative } from '@sharpit/app/lib/validators/coach';
import {
  COACH_COPY_DASH_RULE,
  sanitizeCoachCopy,
} from '@sharpit/app/lib/coach/sanitize-coach-copy';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

/** Parallel LLM narratives after multi-activity import — keep low to avoid gateway bursts. */
const NARRATIVE_CONCURRENCY = 3;

const NARRATIVE_SYSTEM = `Tu es un entraîneur expert en endurance pour l'application SHARPIT.

On te fournit des FAITS structurés sur la séance ET le contexte athlète (récupération, sommeil, charge, seuils personnels, conditions physiques, environnement). Tu rédiges une analyse narrative courte en français.

OBJECTIF : croiser les dimensions. Pas seulement décrire la séance. Cherche des liens plausibles entre performance, récupération, charge récente, sommeil, conditions physiques et environnement.

RÈGLES :
- Appuie-toi UNIQUEMENT sur les faits fournis. N'invente aucun chiffre.
- Ne répète PAS mécaniquement distance, durée, TSS ou allure déjà visibles ailleurs sur la page : cite-les seulement s'ils servent de preuve à une interprétation (ex. « allure ralentie malgré FC modérée → chaleur ou fatigue cumulée »).
- Si readiness basse : cherche une cause probable dans sommeil/dette de sommeil, charge (ACWR/TSB), HRV ou condition physique active. Pas seulement la météo.
- Si une condition physique active existe (douleur, posture, sciatique…) et que la séance sollicite potentiellement cette zone, mentionne-la avec prudence et un point de vigilance concret.
- Compare la performance aux seuils personnels (LTHR, FTP, allure seuil) quand disponibles, plutôt qu'à des moyennes génériques seules.
- Technique : s'il existe une section « Technique », tu peux en tirer AU PLUS une remarque. Et seulement si elle change vraiment l'interprétation (dérive aérobie, intensité mal placée en zones, irrégularité marquante). Sinon, ignore la section. Interdit : conseils de forme permanents, cibles de cadence « idéales », pose du pied, « tu devrais » générique.
- Ton bienveillant, précis, sans jargon inutile.
- headline : une phrase accrocheuse orientée interprétation (max ~100 caractères).
- narrative : 2 à 4 phrases fluides avec au moins une connexion entre systèmes (pas une liste de stats). Intègre les chiffres clés dans le texte plutôt que sous forme de liste.
- Si peu de données contextuelles, dis-le honnêtement et concentre-toi sur ce qui est disponible.
- Mentionne les objectifs validés si présents.

${COACH_COPY_DASH_RULE}`;

export async function setActivityNarrativeAnalysis(
  activityId: string,
  analysis: ActivityNarrative,
): Promise<void> {
  const analyzedAt = new Date();
  await prisma.activity.update({
    where: { id: activityId },
    data: {
      narrativeAnalysis: analysis,
      narrativeAnalyzedAt: analyzedAt,
    },
  });
}

/**
 * Génère et persiste l'analyse narrative si absente (ou si force=true).
 * Auto path is today-only; older sessions need force or allowHistorical (backfill).
 * Retourne true si une nouvelle analyse a été créée.
 *
 * Goal achievements are read from DB inside facts — no enrichGoalsWithProgress
 * on this path (achievements are already written at activity/goal sync time).
 */
function narrativeAlreadyAnalyzed(
  existing: { narrativeAnalyzedAt: Date | null },
  force?: boolean,
): boolean {
  return Boolean(existing.narrativeAnalyzedAt && !force);
}

function narrativeBlockedByDatePolicy(
  existing: { date: Date },
  options?: { force?: boolean; allowHistorical?: boolean },
): boolean {
  if (options?.force || options?.allowHistorical) {
    return false;
  }
  return !isActivityToday(existing.date);
}

async function shouldSkipNarrativeAnalysis(
  athleteId: string,
  activityId: string,
  options?: { force?: boolean; allowHistorical?: boolean },
): Promise<{ skip: true } | { skip: false; activityDate: Date }> {
  const existing = await prisma.activity.findFirst({
    where: { id: activityId, athleteId },
    select: { narrativeAnalyzedAt: true, date: true, narrativeAnalysis: true },
  });
  if (!existing || !isEligibleForActivityNarrative(existing.date)) {
    return { skip: true };
  }
  if (narrativeAlreadyAnalyzed(existing, options?.force)) {
    return { skip: true };
  }
  if (narrativeBlockedByDatePolicy(existing, options)) {
    return { skip: true };
  }
  return { skip: false, activityDate: existing.date };
}

async function generateAndStoreNarrative(
  athleteId: string,
  activityId: string,
  facts: string,
): Promise<boolean> {
  const { output, usage } = await generateText({
    model: COACH_MODEL,
    output: Output.object({ schema: activityNarrativeSchema }),
    system: NARRATIVE_SYSTEM,
    prompt: facts,
    providerOptions: coachAnalysisGatewayOptions,
  });
  void recordAiUsage(athleteId, 'analysis', usage);

  if (!output) {
    return false;
  }

  await setActivityNarrativeAnalysis(activityId, {
    headline: sanitizeCoachCopy(output.headline),
    narrative: sanitizeCoachCopy(output.narrative),
  });
  return true;
}

export async function runActivityNarrativeAnalysis(
  athleteId: string,
  activityId: string,
  options?: { force?: boolean; allowHistorical?: boolean },
): Promise<boolean> {
  if (!isCoachConfigured()) {
    return false;
  }

  const gate = await shouldSkipNarrativeAnalysis(athleteId, activityId, options);
  if (gate.skip) {
    return false;
  }

  // Pro athletes always pass. FREE athletes only pass on activities dated
  // after they joined SHARPIT (older imports stay Pro-only), and at most
  // once a day — applies uniformly to every path (auto sync, manual
  // "Générer" tap, backfill), no separate spend/credit bookkeeping needed.
  const access = await canGenerateNarrativeForActivity(athleteId, gate.activityDate);
  if (!access.allowed) {
    return false;
  }

  const facts = await buildActivityNarrativeFacts(athleteId, activityId);
  if (!facts) {
    return false;
  }

  // Recorded as a run so the athlete is told it landed, from whichever page
  // they are on when it does (ADR-036).
  let created = false;
  await withAnalysisRun(
    { athleteId, kind: 'ACTIVITY_NARRATIVE', targetId: activityId },
    async () => {
      created = await generateAndStoreNarrative(athleteId, activityId, facts);
    },
  );
  return created;
}

/** Lance l'analyse pour des activités nouvellement importées (best-effort, parallel). */
export async function runActivityNarrativeForIds(
  athleteId: string,
  activityIds: string[],
): Promise<void> {
  await mapWithConcurrency(activityIds, NARRATIVE_CONCURRENCY, async (id) => {
    try {
      await runActivityNarrativeAnalysis(athleteId, id);
    } catch (error) {
      console.error('[activity-narrative]', id, error);
    }
  });
}

/** Remplit les analyses manquantes depuis {@link NARRATIVE_ANALYSIS_SINCE}. */
export async function backfillActivityNarratives(athleteId: string): Promise<{
  eligible: number;
  created: number;
}> {
  if (!isCoachConfigured()) {
    return { eligible: 0, created: 0 };
  }

  const activities = await prisma.activity.findMany({
    where: {
      athleteId,
      ...visibleActivityWhere,
      narrativeAnalyzedAt: null,
      date: { gte: NARRATIVE_ANALYSIS_SINCE },
      type: { in: [ActivityType.RUN, ActivityType.BIKE, ActivityType.SWIM] },
    },
    select: { id: true },
    orderBy: { date: 'asc' },
  });

  const outcomes = await mapWithConcurrency(activities, NARRATIVE_CONCURRENCY, async ({ id }) => {
    try {
      return await runActivityNarrativeAnalysis(athleteId, id, { allowHistorical: true });
    } catch (error) {
      console.error('[activity-narrative/backfill]', id, error);
      return false;
    }
  });
  const created = outcomes.filter(Boolean).length;

  return { eligible: activities.length, created };
}
