/**
 * Detect absence / pain situations that should pull playbook RAG and typed proposals.
 */

import type { CoachKnowledgeSituation } from '@sharpit/server/lib/coach/knowledge/build-query';
import { resolveCoachKnowledgeSituation } from '@sharpit/server/lib/coach/knowledge/knowledge-cues-from-context';

const MULTI_DAY_ABSENCE_DAYS = 3;

export type CoachPlaybookContextSlice = {
  physical?: ReadonlyArray<unknown> | null;
  recent?: ReadonlyArray<{ date?: string | null; dateIso?: string | null } | null> | null;
  activityStatus?: { status?: string | null } | null;
  decision?: {
    limitingFactorDomain?: string | null;
    limitingFactorDescription?: string | null;
  } | null;
};

/**
 * Multi-day gap in recent activities, paused activity status, or active physical notes.
 */
export function detectCoachPlaybookSituation(
  ctx: CoachPlaybookContextSlice,
  todayIsoDay?: string,
): CoachKnowledgeSituation | null {
  const hasActivePain = (ctx.physical?.length ?? 0) > 0;
  const limiting =
    ctx.decision?.limitingFactorDescription ?? ctx.decision?.limitingFactorDomain ?? null;

  const fromSignals = resolveCoachKnowledgeSituation({
    hasActivePain,
    limitingFactor: limiting,
    focus: null,
    verdict: null,
  });
  if (fromSignals === 'pain') {
    return 'pain';
  }

  const status = ctx.activityStatus?.status ?? null;
  if (status === 'paused' || status === 'injured' || status === 'sick') {
    return status === 'injured' ? 'pain' : 'absence';
  }

  if (daysSinceLastActivity(ctx.recent, todayIsoDay) >= MULTI_DAY_ABSENCE_DAYS) {
    return 'absence';
  }

  return fromSignals;
}

function daysSinceLastActivity(
  recent: CoachPlaybookContextSlice['recent'],
  todayIsoDay?: string,
): number {
  if (!recent?.length) {
    return MULTI_DAY_ABSENCE_DAYS + 1;
  }
  const today = todayIsoDay ? parseIsoDay(todayIsoDay) : startOfUtcDay(new Date());
  let latest: number | null = null;
  for (const row of recent) {
    const key = row?.dateIso ?? row?.date?.slice(0, 10);
    if (!key) {
      continue;
    }
    const ts = parseIsoDay(key);
    if (ts === null) {
      continue;
    }
    if (latest === null || ts > latest) {
      latest = ts;
    }
  }
  if (latest === null || today === null) {
    return 0;
  }
  return Math.max(0, Math.round((today - latest) / 86_400_000));
}

function parseIsoDay(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  return Date.parse(`${iso}T12:00:00.000Z`);
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
