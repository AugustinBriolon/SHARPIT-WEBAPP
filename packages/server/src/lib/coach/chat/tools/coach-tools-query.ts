import { tool } from 'ai';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import { z } from 'zod';
import {
  googleCalendarGateFromPrefs,
  shouldLoadCalendarBusyBlocks,
} from '@sharpit/server/lib/cron/provider-sync-gates';
import { resolveAthleteCalendarTimeZone } from '@sharpit/server/lib/integrations/apple-calendar/athlete-calendar-time-zone';
import {
  getGoogleAccount,
  getUpcomingBusy,
} from '@sharpit/server/lib/integrations/google/google-sync';
import { isOAuthAccountConnected } from '@sharpit/server/lib/integrations/shared/connection-status';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import { getHealthEntries, getPlannedSessions } from '@sharpit/server/lib/queries';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import {
  formatScenarioComparisonForCoach,
  loadScenarioComparisonForCoach,
} from '@sharpit/server/lib/presentation/scenario/scenario-comparison';
import { parseStrengthPrescription } from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import { loadV1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';
import {
  formatCompareSleepVsReadinessMarkdown,
  formatExplainDayScoresMarkdown,
  formatExplainTargetBandMarkdown,
} from '@sharpit/server/lib/coach/chat/tools/coach-insights-format';
import { trainingDayIdNow } from '@sharpit/server/lib/athlete-state/freshness-service';

function buildListPlannedSessionsTool(athleteId: string) {
  return tool({
    description:
      'Liste les séances planifiées à venir avec leur id. Inutile si les id sont déjà dans le contexte système — à utiliser seulement pour un horizon plus long ou après une mutation validée.',
    inputSchema: z.object({
      days: z.number().int().min(1).max(60).optional().describe('Horizon en jours (défaut 21).'),
    }),
    execute: async ({ days = 21 }) => {
      const today = startOfDay(new Date());
      const sessions = await getPlannedSessions(athleteId, {
        from: today,
        to: addDays(today, days),
      });
      return sessions.map((s) => ({
        id: s.id,
        date: dayKeyFromDate(s.date),
        type: s.type,
        intensity: s.intensity,
        title: s.title,
        durationMin: s.durationMin,
        load: s.load,
        completed: s.completed,
        brickGroupId: s.brickGroupId,
        brickOrder: s.brickOrder,
        hasStrengthPrescription: Boolean(parseStrengthPrescription(s.strengthPrescription)),
      }));
    },
  });
}

function buildGetScenarioProjectionTool(athleteId: string) {
  return tool({
    description:
      "Charge une comparaison de scénarios d'entraînement (projections sur l'horizon). À appeler UNIQUEMENT si l'athlète demande explicitement une projection, une comparaison d'options de plan, ou « que se passe-t-il si… ». Pas pour une simple réadaptation de séance (sommeil/récup/environnement suffisent).",
    inputSchema: z.object({
      horizonDays: z
        .union([z.literal(7), z.literal(14)])
        .optional()
        .describe('Horizon de projection (défaut 7).'),
    }),
    execute: async ({ horizonDays = 7 }) => {
      const comparison = await loadScenarioComparisonForCoach(athleteId, {
        horizonDays,
      });
      const text = formatScenarioComparisonForCoach(comparison);
      if (!text) {
        return {
          ok: false as const,
          error: 'Aucune comparaison de scénarios disponible pour cet horizon.',
        };
      }
      return { ok: true as const, markdown: text };
    },
  });
}

function buildSearchWatchExercisesTool() {
  return tool({
    description:
      "Cherche les exercices du catalogue Garmin Connect correspondant à un mouvement. Utilise-le pour nommer les exercices d'une séance STRENGTH avec des libellés que la montre affiche tels quels. Un libellé hors catalogue reste envoyé, mais sous un nom générique.",
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .max(120)
        .describe('Mouvement recherché en français (ex. « pont fessier élastique »).'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Nombre de suggestions (défaut 5).'),
    }),
    execute: async ({ query }) => {
      return {
        query,
        matches: [],
      };
    },
  });
}

function buildGetCalendarAvailabilityTool(athleteId: string) {
  return tool({
    description:
      "Liste les créneaux OCCUPÉS de l'agenda (Google et/ou Apple selon les intégrations actives) sur les prochains jours, pour placer les séances sur des créneaux libres. À appeler avant de proposer des horaires précis. Renvoie connected:false si aucun calendrier n'est actif.",
    inputSchema: z.object({
      days: z.number().int().min(1).max(30).optional().describe('Horizon en jours (défaut 14).'),
    }),
    execute: async ({ days = 14 }) => {
      const [account, prefs, timeZone] = await Promise.all([
        getGoogleAccount(athleteId),
        loadResolvedSourcePrefs(athleteId),
        resolveAthleteCalendarTimeZone(athleteId),
      ]);
      const calendarGate = googleCalendarGateFromPrefs(prefs);
      const connected = shouldLoadCalendarBusyBlocks({
        googleOAuthConnected: isOAuthAccountConnected(account),
        calendarEnabled: calendarGate.calendarEnabled,
      });
      if (!connected) {
        return { connected: false as const, busy: [] };
      }
      try {
        const busy = await getUpcomingBusy(athleteId, days);
        return {
          connected: true as const,
          timeZone,
          busy,
        };
      } catch (error) {
        console.error('Lecture agenda échouée', error);
        return { connected: true as const, busy: [], error: 'fetch_failed' };
      }
    },
  });
}

function buildExplainDayScoresTool(athleteId: string) {
  return tool({
    description:
      "Explique les scores SharpIt du jour (Réserve d'énergie, stress, cible d'effort, forme). Jour courant ou trainingDayId yyyy-MM-dd. Interdit : diagnostic médical / pathologie — cadre entraînement uniquement.",
    inputSchema: z.object({
      trainingDayId: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('Jour yyyy-MM-dd (défaut = aujourd’hui).'),
    }),
    execute: async ({ trainingDayId }) => {
      const dayId = trainingDayId ?? trainingDayIdNow();
      const [scores, snapshot] = await Promise.all([
        loadV1DayScores(athleteId, dayId),
        getOrBuildAthleteSnapshot(athleteId, dayId),
      ]);
      return {
        ok: true as const,
        markdown: formatExplainDayScoresMarkdown({
          trainingDayId: dayId,
          scores,
          readiness: snapshot.readiness ?? null,
        }),
      };
    },
  });
}

function buildCompareSleepVsReadinessTool(athleteId: string) {
  return tool({
    description:
      'Compare sommeil (minutes) et forme/readiness sur 7 ou 14 jours. Pour croiser récupération et nuits — pas un diagnostic médical.',
    inputSchema: z.object({
      windowDays: z
        .union([z.literal(7), z.literal(14)])
        .optional()
        .describe('Fenêtre en jours (défaut 7).'),
    }),
    execute: async ({ windowDays = 7 }) => {
      const ref = new Date();
      const entries = await getHealthEntries(athleteId, windowDays + 1, ref);
      const cutoff = subDays(startOfDay(ref), windowDays - 1);
      const points = entries
        .filter((entry) => entry.date >= cutoff)
        .map((entry) => ({
          trainingDayId: format(entry.date, 'yyyy-MM-dd'),
          sleepMinutes: entry.sleepMinutes ?? null,
          readiness: entry.recoveryScore ?? null,
        }))
        .sort((a, b) => a.trainingDayId.localeCompare(b.trainingDayId));
      return {
        ok: true as const,
        markdown: formatCompareSleepVsReadinessMarkdown(points, windowDays),
      };
    },
  });
}

function buildExplainTargetBandTool(athleteId: string) {
  return tool({
    description:
      "Explique la cible d'effort (bande low–high) du jour et où se situe l'athlète. Pas de diagnostic médical.",
    inputSchema: z.object({
      trainingDayId: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('Jour yyyy-MM-dd (défaut = aujourd’hui).'),
    }),
    execute: async ({ trainingDayId }) => {
      const dayId = trainingDayId ?? trainingDayIdNow();
      const [scores, snapshot] = await Promise.all([
        loadV1DayScores(athleteId, dayId),
        getOrBuildAthleteSnapshot(athleteId, dayId),
      ]);
      if (!scores.targetBand) {
        return {
          ok: false as const,
          error: "Cible d'effort indisponible pour ce jour (données insuffisantes).",
        };
      }
      return {
        ok: true as const,
        markdown: formatExplainTargetBandMarkdown({
          trainingDayId: dayId,
          band: scores.targetBand,
          readiness: snapshot.readiness ?? null,
        }),
      };
    },
  });
}

export function buildQueryCoachTools(athleteId: string) {
  return {
    listPlannedSessions: buildListPlannedSessionsTool(athleteId),
    getScenarioProjection: buildGetScenarioProjectionTool(athleteId),
    searchWatchExercises: buildSearchWatchExercisesTool(),
    getCalendarAvailability: buildGetCalendarAvailabilityTool(athleteId),
    explainDayScores: buildExplainDayScoresTool(athleteId),
    compareSleepVsReadiness: buildCompareSleepVsReadinessTool(athleteId),
    explainTargetBand: buildExplainTargetBandTool(athleteId),
  };
}
