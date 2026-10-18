import { isUniqueViolation } from '@sharpit/server/lib/prisma-errors';
import { Prisma } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import type { NutritionAnalysisFacts } from './nutrition-analysis-facts';
import type { NutritionDayReading } from './nutrition-analysis-schema';
import {
  NUTRITION_ANALYSIS_CLAIM_TTL_MS,
  type StoredNutritionAnalysis,
} from './nutrition-analysis-state';
import { nutritionDayDate } from './nutrition-analysis-inputs';

export async function findNutritionAnalysisRow(
  athleteId: string,
  trainingDayId: string,
): Promise<StoredNutritionAnalysis | null> {
  return prisma.nutritionDayAnalysis.findUnique({
    where: { athleteId_date: { athleteId, date: nutritionDayDate(trainingDayId) } },
    select: {
      status: true,
      inputHash: true,
      analysis: true,
      generatedAt: true,
      attemptHash: true,
      attemptedAt: true,
    },
  });
}

/**
 * Atomically takes the right to generate for these facts. Returns false when a
 * live claim on the same hash already exists — another request is generating.
 */
export async function claimNutritionAnalysis(input: {
  athleteId: string;
  trainingDayId: string;
  hash: string;
  now: Date;
}): Promise<boolean> {
  const date = nutritionDayDate(input.trainingDayId);
  const claim = { attemptHash: input.hash, attemptedAt: input.now };
  const updated = await prisma.nutritionDayAnalysis.updateMany({
    where: {
      athleteId: input.athleteId,
      date,
      OR: [
        { attemptHash: null },
        { attemptHash: { not: input.hash } },
        { attemptedAt: { lt: new Date(input.now.getTime() - NUTRITION_ANALYSIS_CLAIM_TTL_MS) } },
      ],
    },
    data: claim,
  });
  if (updated.count > 0) {
    return true;
  }
  try {
    await prisma.nutritionDayAnalysis.create({
      data: { athleteId: input.athleteId, date, ...claim },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false;
    }
    throw error;
  }
}

export async function saveNutritionAnalysis(input: {
  athleteId: string;
  trainingDayId: string;
  hash: string;
  facts: NutritionAnalysisFacts;
  reading: NutritionDayReading;
  model: string;
}): Promise<void> {
  await prisma.nutritionDayAnalysis.update({
    where: {
      athleteId_date: { athleteId: input.athleteId, date: nutritionDayDate(input.trainingDayId) },
    },
    data: {
      status: 'FINAL',
      inputHash: input.hash,
      facts: input.facts as unknown as Prisma.InputJsonValue,
      analysis: input.reading as unknown as Prisma.InputJsonValue,
      model: input.model,
      generatedAt: new Date(),
    },
  });
}
