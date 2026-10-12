/**
 * Server side of contextual coach conversations (ADR-031).
 *
 * One registry entry per discuss kind: an optional entitlement check, then a
 * loader returning a short system-prompt block (or null). The discuss metadata
 * is client-supplied, so it is parsed defensively and every lookup is scoped to
 * the athlete resolved by the server — forging it can never read another
 * athlete's data nor unlock a Pro block.
 */

import { hasProAccess } from '@sharpit/app/lib/access/tier';
import type { CoachDiscussMetadata } from '@sharpit/app/lib/coach/chat/discuss/coach-discuss-context';
import { lastCoachDiscussMetadata } from '@sharpit/server/lib/coach/chat/discuss/coach-discuss-metadata-parse';
import {
  loadMorningBriefDiscussBlock,
  loadTodayDiscussBlock,
} from '@sharpit/server/lib/coach/chat/discuss/coach-discuss-day-scores';
import {
  formatNutritionDiscussBlock,
  formatPlanningDiscussBlock,
  loadActivityDiscussBlock,
  loadGoalDiscussBlock,
  loadPhysicalConditionDiscussBlock,
  loadPlannedSessionDiscussBlock,
  loadRecordDiscussBlock,
} from '@sharpit/server/lib/coach/chat/discuss/coach-discuss-target-blocks';
import { format } from 'date-fns';
import {
  JOURNAL_ANALYSES_PRO_REQUIRED_ERROR,
  loadJournalAnalysesCoachBlock,
} from '@sharpit/server/lib/coach/chat/discuss/journal-analyses-coach-gate';
import { prisma } from '@sharpit/db/client';
import { getAthleteProfile } from '@sharpit/server/lib/queries';

type DiscussKind = CoachDiscussMetadata['discussKind'];

type DiscussHandler<K extends DiscussKind> = {
  /** Resolves to an athlete-facing refusal, or null when the athlete may proceed. */
  authorize?(athleteId: string): Promise<string | null>;
  loadBlock(
    athleteId: string,
    metadata: Extract<CoachDiscussMetadata, { discussKind: K }>,
    now: Date,
  ): Promise<string | null>;
};

export type CoachDiscussServerContext =
  | { status: 'forbidden'; error: string }
  | { status: 'allowed'; loadBlock: () => Promise<string | null> };

/** Journal analyses reading is a Pro perk (ADR-030) — re-checked on every turn. */
async function requireJournalAnalysesPro(athleteId: string): Promise<string | null> {
  const profile = await getAthleteProfile(athleteId);
  return hasProAccess(profile?.tier ?? 'FREE') ? null : JOURNAL_ANALYSES_PRO_REQUIRED_ERROR;
}

const DISCUSS_HANDLERS: { [K in DiscussKind]: DiscussHandler<K> } = {
  today: {
    loadBlock: (athleteId, _metadata, now) =>
      loadTodayDiscussBlock(athleteId, format(now, 'yyyy-MM-dd'), now),
  },
  'morning-brief': {
    loadBlock: (athleteId, metadata, now) =>
      loadMorningBriefDiscussBlock(athleteId, metadata.trainingDayId, now),
  },
  planning: {
    loadBlock: async (_, metadata, now) => formatPlanningDiscussBlock(metadata.horizonDays, now),
  },
  'planned-session': {
    loadBlock: (athleteId, metadata) =>
      loadPlannedSessionDiscussBlock(athleteId, metadata.sessionId),
  },
  activity: {
    loadBlock: (athleteId, metadata, now) =>
      loadActivityDiscussBlock(athleteId, metadata.activityId, now),
  },
  goal: {
    loadBlock: (athleteId, metadata, now) => loadGoalDiscussBlock(athleteId, metadata.goalId, now),
  },
  record: {
    loadBlock: (athleteId, metadata) => loadRecordDiscussBlock(athleteId, metadata.categoryKey),
  },
  'physical-condition': {
    loadBlock: (athleteId, metadata) =>
      loadPhysicalConditionDiscussBlock(athleteId, metadata.noteId),
  },
  'journal-analyses': {
    authorize: requireJournalAnalysesPro,
    loadBlock: (athleteId) => loadJournalAnalysesCoachBlock(prisma, athleteId),
  },
  nutrition: {
    loadBlock: async (_, metadata, now) => formatNutritionDiscussBlock(metadata.trainingDayId, now),
  },
};

const NO_DISCUSS_BLOCK = async (): Promise<null> => null;

/** A missing context block degrades to an ordinary conversation, not a failed turn. */
async function loadBlockSafely(load: () => Promise<string | null>): Promise<string | null> {
  try {
    return await load();
  } catch (error) {
    console.error('[coach-chat] discuss context', error);
    return null;
  }
}

/**
 * Entitlements are settled before anything is loaded; the returned loader lets
 * the caller fetch the block in parallel with the rest of the coach context.
 */
export async function resolveCoachDiscussServerContext(
  athleteId: string,
  messages: unknown,
  now: Date = new Date(),
): Promise<CoachDiscussServerContext> {
  const metadata = lastCoachDiscussMetadata(messages);
  if (!metadata) {
    return { status: 'allowed', loadBlock: NO_DISCUSS_BLOCK };
  }
  // Correlated union: TS cannot tie the looked-up handler to this metadata's kind.
  const handler = DISCUSS_HANDLERS[metadata.discussKind] as DiscussHandler<DiscussKind>;
  const refusal = handler.authorize ? await handler.authorize(athleteId) : null;
  if (refusal) {
    return { status: 'forbidden', error: refusal };
  }
  return {
    status: 'allowed',
    loadBlock: () => loadBlockSafely(() => handler.loadBlock(athleteId, metadata, now)),
  };
}
