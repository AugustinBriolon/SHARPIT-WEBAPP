import { isUniqueViolation } from '@sharpit/server/lib/prisma-errors';
import type { AnalysisKind } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import {
  ANALYSIS_RUN_STALE_MS,
  type AnalysisRunView,
} from '@sharpit/app/lib/analysis/analysis-run';

/** Runs older than this are not worth reporting to the client. */
const RECENT_WINDOW_MS = 60 * 60_000;

type RunTarget = { athleteId: string; kind: AnalysisKind; targetId: string };

/**
 * Takes the right to run this analysis. Returns false when another request is
 * already on it, so the same work never runs twice in parallel — a claim left
 * RUNNING past the stale window is treated as dead and can be taken over.
 */
export async function claimAnalysisRun(
  target: RunTarget,
  now: Date = new Date(),
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - ANALYSIS_RUN_STALE_MS);
  const claim = { status: 'RUNNING' as const, startedAt: now, finishedAt: null, error: null };
  const updated = await prisma.analysisRun.updateMany({
    where: {
      ...target,
      OR: [{ status: { not: 'RUNNING' } }, { startedAt: { lt: staleBefore } }],
    },
    data: claim,
  });
  if (updated.count > 0) {
    return true;
  }
  try {
    await prisma.analysisRun.create({ data: { ...target, ...claim } });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false;
    }
    throw error;
  }
}

export async function finishAnalysisRun(target: RunTarget): Promise<void> {
  await prisma.analysisRun.updateMany({
    where: target,
    data: { status: 'READY', finishedAt: new Date(), error: null },
  });
}

export async function failAnalysisRun(target: RunTarget, reason: string): Promise<void> {
  await prisma.analysisRun.updateMany({
    where: target,
    data: { status: 'FAILED', finishedAt: new Date(), error: reason.slice(0, 200) },
  });
}

/**
 * Runs the client cares about: everything still in flight, plus what finished
 * in the last hour so a returning athlete still gets told.
 */
export async function listRecentAnalysisRuns(
  athleteId: string,
  now: Date = new Date(),
): Promise<AnalysisRunView[]> {
  const rows = await prisma.analysisRun.findMany({
    where: {
      athleteId,
      OR: [
        { status: 'RUNNING' },
        { finishedAt: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) } },
      ],
    },
    select: { kind: true, targetId: true, status: true, startedAt: true, finishedAt: true },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  return rows.map((row) => ({
    kind: row.kind,
    targetId: row.targetId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }));
}

/**
 * Wraps one analysis: claims it, runs it, and records the outcome. Returns
 * false when the work was already claimed — the caller does nothing.
 */
export async function withAnalysisRun(
  target: RunTarget,
  work: () => Promise<void>,
): Promise<boolean> {
  if (!(await claimAnalysisRun(target))) {
    return false;
  }
  try {
    await work();
    await finishAnalysisRun(target);
    return true;
  } catch (error) {
    await failAnalysisRun(target, error instanceof Error ? error.message : 'Analyse impossible');
    throw error;
  }
}
