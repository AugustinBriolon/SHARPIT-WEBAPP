import type { BodySide, PhysicalCategory, PhysicalStatus } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import {
  mapLegacyCategoryToConditionType,
  mapLegacyStatusToConditionStatus,
  mapLegacyStatusToEpisodeStatus,
  resolveBodyRegion,
  resolveConditionScope,
} from '@sharpit/core/physical-health/legacy-mapping';

/** The declared note, as far as its Condition mirror needs it. */
export type ConditionSourceNote = {
  id: string;
  athleteId: string;
  category: PhysicalCategory;
  status: PhysicalStatus;
  title: string;
  bodyPart: string | null;
  side: BodySide;
  severity: number | null;
  description: string | null;
  affectsTraining: boolean;
  startDate: Date;
  resolvedAt: Date | null;
};

function conditionFields(note: ConditionSourceNote) {
  const type = mapLegacyCategoryToConditionType(note.category);
  const scope = resolveConditionScope(type, note.bodyPart);
  return {
    scope,
    type,
    bodyRegion: resolveBodyRegion(scope, note.bodyPart, note.title, type),
    side: note.side,
    label: note.title,
    diagnosis: note.description,
    status: mapLegacyStatusToConditionStatus(note.status),
    severity: note.severity ?? 0,
    affectsTraining: note.affectsTraining,
    startedAt: note.startDate,
    resolvedAt: note.resolvedAt,
  };
}

function episodeFields(note: ConditionSourceNote) {
  return {
    status: mapLegacyStatusToEpisodeStatus(note.status),
    resolvedAt: note.resolvedAt,
  };
}

async function createCondition(note: ConditionSourceNote): Promise<void> {
  await prisma.condition.create({
    data: {
      ...conditionFields(note),
      athleteId: note.athleteId,
      legacyPhysicalNoteId: note.id,
      lastObservationAt: note.startDate,
      episodes: {
        create: {
          episodeNumber: 1,
          startedAt: note.startDate,
          peakSeverity: note.severity,
          ...episodeFields(note),
        },
      },
    },
  });
}

/** A resolved zone reopened: a new episode, counted as a recurrence. */
async function openRecurrence(conditionId: string, note: ConditionSourceNote): Promise<void> {
  const last = await prisma.conditionEpisode.findFirst({
    where: { conditionId },
    orderBy: { episodeNumber: 'desc' },
    select: { episodeNumber: true },
  });
  await prisma.$transaction([
    prisma.conditionEpisode.create({
      data: {
        conditionId,
        episodeNumber: (last?.episodeNumber ?? 0) + 1,
        startedAt: new Date(),
        peakSeverity: note.severity,
        ...episodeFields(note),
      },
    }),
    prisma.condition.update({
      where: { id: conditionId },
      data: { status: 'RECURRENT', recurrenceCount: { increment: 1 } },
    }),
  ]);
}

async function updateLatestEpisode(conditionId: string, note: ConditionSourceNote): Promise<void> {
  const latest = await prisma.conditionEpisode.findFirst({
    where: { conditionId },
    orderBy: { episodeNumber: 'desc' },
    select: { id: true },
  });
  if (latest) {
    await prisma.conditionEpisode.update({ where: { id: latest.id }, data: episodeFields(note) });
  }
}

/**
 * Keeps the Physical Health Engine's Condition in step with the athlete's declaration. The
 * note is the source of truth (ADR-068); notes declared after the Phase 1 migration never got
 * a Condition, so the snapshot — and every reader of it — missed them.
 */
export async function syncConditionFromNote(
  note: ConditionSourceNote,
  previousStatus: PhysicalStatus | null = null,
): Promise<void> {
  const existing = await prisma.condition.findFirst({
    where: { legacyPhysicalNoteId: note.id, athleteId: note.athleteId },
    select: { id: true },
  });
  if (!existing) {
    await createCondition(note);
    return;
  }
  await prisma.condition.update({ where: { id: existing.id }, data: conditionFields(note) });
  if (previousStatus === 'RESOLVED' && note.status !== 'RESOLVED') {
    await openRecurrence(existing.id, note);
    return;
  }
  await updateLatestEpisode(existing.id, note);
}
