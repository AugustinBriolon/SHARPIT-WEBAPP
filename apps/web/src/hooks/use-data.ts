'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import {
  fetchAthleteProfile,
  fetchGoogleCalendars,
  fetchGoogleEvents,
  fetchRecords,
  fetchThresholdHistory,
  fetchThresholdPreview,
  fetchTrainingPlan,
} from '@/client/query/fetchers';
import { queryKeys } from '@/client/query/keys';
import type { ThresholdField } from '@sharpit/app/lib/threshold/threshold-estimates';
import { sendJson } from '@/client/query/send-json';

export {
  useAnalyzeBrick,
  useBrickAnalysis,
  useBrickEvaluation,
  usePlannedSessionMutations,
  usePlannedSessionPresentation,
  usePlannedSessions,
  useSaveBrickEvaluation,
  useSessionRationalePresentation,
  useWeeklyCoachingBriefViewModel,
} from '@/hooks/use-planned-sessions';
export type {
  BrickLegPayload,
  ClientBrickAnalysis,
  ClientBrickEvaluation,
  CreateBrickPayload,
  PlannedSessionBatchOp,
  PlannedSessionPayload,
} from '@/hooks/use-planned-sessions';

export {
  useActivities,
  useActivityMutations,
  useActivityRoutePreviews,
  useActivityStream,
  useMultisportStreams,
} from '@/hooks/use-activities';
export { useActivityDetail } from '@/hooks/use-activity-detail';
export type { ActivityMutationPayload } from '@/hooks/use-activities';

export { useGoalAchievements, useGoalMutations, useGoals } from '@/hooks/use-goals';
export type { GoalPayload } from '@/hooks/use-goals';

export { useBodyComposition, useHealthEntries } from '@/hooks/use-health';

export {
  isSearchableFoodQuery,
  useAddFoodLogEntry,
  useCreateCustomFood,
  useDeleteCustomFood,
  useDeleteFoodLogEntry,
  useFoodBarcodeLookup,
  useFoodLogDay,
  useFoodSearch,
  useImportMfpExport,
  useOwnFoods,
  useSaveNutritionTargets,
  useUpdateCustomFood,
  useUpdateFoodLogEntry,
} from '@/hooks/nutrition/use-food-log';
export type {
  AddFoodLogEntryVars,
  FoodLogEntryPreview,
  UpdateCustomFoodVars,
  UpdateFoodLogEntryVars,
} from '@/hooks/nutrition/use-food-log';
export {
  useCopyFoodLog,
  useDeleteSavedMeal,
  useLogSavedMeal,
  useSavedMeals,
  useSaveMeal,
  useSaveRecipe,
} from '@/hooks/nutrition/use-food-log-templates';
export type {
  CopyFoodLogVars,
  LogSavedMealVars,
  SaveRecipeVars,
} from '@/hooks/nutrition/use-food-log-templates';

export { useHikeTrip, useHikeTripMutations, useHikeTrips } from '@/hooks/use-hike-trips';
export type { CreateHikeTripInput, PatchHikeTripInput } from '@/hooks/use-hike-trips';

export function useRecords() {
  return useQuery({
    queryKey: queryKeys.records,
    // Persisted DB records — avoid refetching on every visit.
    queryFn: fetchRecords,
    staleTime: 30 * 60 * 1000,
  });
}

export function useAthleteProfile() {
  return useQuery({
    queryKey: queryKeys.athleteProfile,
    queryFn: fetchAthleteProfile,
    staleTime: 5 * 60 * 1000,
  });
}

export function useThresholdPreview() {
  return useQuery({
    queryKey: queryKeys.thresholdPreview,
    queryFn: fetchThresholdPreview,
    staleTime: 5 * 60 * 1000,
  });
}

export function useThresholdHistory() {
  return useQuery({
    queryKey: queryKeys.thresholdHistory,
    queryFn: fetchThresholdHistory,
    staleTime: 60 * 1000,
  });
}

export function useTrainingPlan() {
  return useQuery({
    queryKey: queryKeys.trainingPlan,
    queryFn: fetchTrainingPlan,
    staleTime: 60 * 1000,
  });
}

export function useTrainingPlanMutations() {
  const queryClient = useQueryClient();
  const key = queryKeys.trainingPlan;

  const generate = useMutation({
    mutationFn: (goalId: string) => sendJson('/api/training-plans', 'POST', { goalId }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      toast.success("Plan d'entraînement généré");
    },
    onError: (err: unknown) =>
      toast.error('La génération du plan a échoué.', {
        description: err instanceof Error ? err.message : undefined,
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const archive = useMutation({
    mutationFn: (id: string) => sendJson(`/api/training-plans/${id}`, 'DELETE'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, null);
      return { previous };
    },
    onError: (err: unknown, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
      toast.error("Impossible d'archiver le plan.", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Plan macro archivé');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return { generate, archive };
}

type ThresholdPreviewCache = {
  estimates: {
    ftpW: number | null;
    runThresholdPaceSecPerKm: number | null;
    swimCssSecPer100m: number | null;
  };
  changes: { field: ThresholdField }[];
};

function buildThresholdEstimatePatch(
  fields: ThresholdField[] | undefined,
  preview: ThresholdPreviewCache,
) {
  const accepted = new Set(fields?.length ? fields : preview.changes.map((change) => change.field));
  const patch: Record<string, number | null> = {};
  if (accepted.has('ftpW')) {
    patch.ftpW = preview.estimates.ftpW;
  }
  if (accepted.has('runThresholdPaceSecPerKm')) {
    patch.runThresholdPaceSecPerKm = preview.estimates.runThresholdPaceSecPerKm;
  }
  if (accepted.has('swimCssSecPer100m')) {
    patch.swimCssSecPer100m = preview.estimates.swimCssSecPer100m;
  }
  return patch;
}

async function optimisticallyApplyThresholdEstimates(
  queryClient: ReturnType<typeof useQueryClient>,
  fields?: ThresholdField[],
) {
  await queryClient.cancelQueries({ queryKey: queryKeys.athleteProfile });
  await queryClient.cancelQueries({ queryKey: queryKeys.thresholdPreview });
  const previousProfile = queryClient.getQueryData(queryKeys.athleteProfile);
  const preview = queryClient.getQueryData<ThresholdPreviewCache>(queryKeys.thresholdPreview);

  if (previousProfile && preview) {
    queryClient.setQueryData(queryKeys.athleteProfile, {
      ...(previousProfile as object),
      ...buildThresholdEstimatePatch(fields, preview),
      thresholdsSyncedAt: new Date().toISOString(),
    });
  }

  return { previousProfile };
}

export function useApplyThresholdEstimates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields?: ThresholdField[]) =>
      sendJson('/api/athlete-profile/apply-estimates', 'POST', fields ? { fields } : {}),
    onMutate: (fields) => optimisticallyApplyThresholdEstimates(queryClient, fields),
    onError: (err: unknown, _fields, context) => {
      if (context?.previousProfile !== undefined) {
        queryClient.setQueryData(queryKeys.athleteProfile, context.previousProfile);
      }
      toast.error("Impossible d'appliquer les seuils estimés.", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Seuils estimés appliqués');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.thresholdPreview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.thresholdHistory });
      void queryClient.invalidateQueries({ queryKey: queryKeys.athleteProfile });
    },
  });
}

export function useGoogleEvents(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.googleEvents(from, to),
    queryFn: () => fetchGoogleEvents(from, to),
    staleTime: 5 * 60 * 1000, // 5 min — avoid spamming Google API
    retry: 1,
  });
}

export function useGoogleCalendars(enabled = true) {
  return useQuery({
    queryKey: queryKeys.googleCalendars,
    queryFn: fetchGoogleCalendars,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
