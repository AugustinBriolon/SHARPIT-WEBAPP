import { z } from 'zod';
import {
  coachEndurancePrescriptionGenerationSchema,
  coachEndurancePrescriptionSchema,
} from '@sharpit/app/lib/planned-session/endurance/coach-endurance-prescription';
import { coachStrengthPrescriptionSchema } from '@sharpit/app/lib/planned-session/strength/strength-prescription';

const planSessionTypeSchema = z.enum(['RUN', 'BIKE', 'SWIM', 'STRENGTH']);
const planIntensitySchema = z.enum([
  'RECOVERY',
  'ENDURANCE',
  'TEMPO',
  'THRESHOLD',
  'VO2MAX',
  'RACE',
]);

/**
 * Loose strength set for LLM generation only.
 * Unknown intent/pattern/restMode stay as strings — normalize coerces to null.
 * Persist schema stays strict (see coachStrengthPrescriptionSchema).
 */
const coachStrengthSetGenerationSchema = z.object({
  exercise: z
    .string()
    .min(1)
    .max(120)
    .describe(
      'Nom FR de l’exercice. Préférer un libellé proche du catalogue Garmin Connect (ex. Pompe, Étirement 90/90, Clamshell avec élastique).',
    ),
  intent: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Ce que l’exercice entraîne : STRENGTH | CORE | PLYOMETRIC | MOBILITY | CONDITIONING. null si tu ne sais vraiment pas.',
    ),
  pattern: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Famille biomécanique (ex. SQUAT, HIP_ABDUCTION, CORE_ANTI_LATERAL). null OBLIGATOIREMENT si intent=MOBILITY ou CONDITIONING.',
    ),
  sets: z.number().min(1).max(20).describe('Nombre de séries.'),
  reps: z.number().min(0).max(100).describe('Répétitions par série. 0 si isométrie chronométrée.'),
  durationSec: z
    .number()
    .min(0)
    .max(3600)
    .nullable()
    .optional()
    .describe('Durée d’une série en secondes (isométrie). null sinon.'),
  weightKg: z
    .number()
    .min(0)
    .max(500)
    .nullable()
    .optional()
    .describe('Charge cible en kg si pertinente, sinon null.'),
  restMode: z
    .string()
    .nullable()
    .optional()
    .describe('Fin de repos montre : "lap" (défaut) ou "time".'),
  restSec: z
    .number()
    .min(0)
    .max(600)
    .nullable()
    .optional()
    .describe('Repos chronométré en secondes si restMode=time.'),
  notes: z.string().nullable().optional().describe('Consigne courte optionnelle.'),
});

const coachStrengthPrescriptionGenerationSchema = z
  .object({
    sets: z
      .array(coachStrengthSetGenerationSchema)
      .min(1)
      .max(20)
      .describe('Liste ordonnée des exercices de la séance muscu.'),
  })
  .describe(
    'Prescription muscu structurée (montre Garmin). OBLIGATOIRE si type=STRENGTH, null sinon.',
  );

/** Schéma de sortie structurée du générateur de séances (persist / Gate). */
export const coachPlanSchema = z.object({
  summary: z
    .string()
    .describe(
      'Résumé en 1-2 phrases de la logique du bloc proposé (phase, intention, ajustement selon la fraîcheur).',
    ),
  sessions: z
    .array(
      z.object({
        dayOffset: z
          .number()
          .int()
          .min(0)
          .max(27)
          .describe('Nombre de jours après la date de début du plan (0 = jour de début).'),
        startTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable()
          .describe(
            "Heure de début 'HH:mm' choisie dans un créneau LIBRE de l'agenda (entre 06:00 et 21:00, jamais la nuit). null si aucune contrainte d'agenda.",
          ),
        type: planSessionTypeSchema,
        intensity: planIntensitySchema,
        title: z.string().describe('Titre court de la séance.'),
        description: z
          .string()
          .describe(
            'Structure détaillée : échauffement, corps de séance (intervalles, allures/zones cibles), récupération. Pour STRENGTH : intention courte uniquement (ex. « Focus chaîne postérieure ») — la liste d’exercices va dans strengthPrescription, jamais en liste numérotée ici.',
          ),
        strengthPrescription: coachStrengthPrescriptionSchema
          .nullable()
          .optional()
          .describe(
            'OBLIGATOIRE si type=STRENGTH (exercices + séries/reps). null pour RUN/BIKE/SWIM.',
          ),
        endurancePrescription: coachEndurancePrescriptionSchema
          .nullable()
          .optional()
          .describe(
            'Déroulé structuré pour RUN et BIKE dès que la séance a une structure (fractionné, blocs au seuil, progressif). null pour STRENGTH, SWIM, et pour une sortie continue sans structure.',
          ),
        durationMin: z.number().int().min(10).max(420),
        load: z.number().int().min(0).max(400).describe('Charge / TSS estimé de la séance.'),
        rationale: z.string().describe('Justification courte : pourquoi cette séance maintenant.'),
      }),
    )
    .min(1)
    .max(14),
});

export type CoachPlan = z.infer<typeof coachPlanSchema>;

/**
 * Schéma permissif pour la génération IA (floats OK ; enums strength en string).
 * `normalizeCoachPlanGeneration` coerce vers `coachPlanSchema` avant Gate.
 */
const generatedSessionBaseSchema = z.object({
  dayOffset: z
    .number()
    .min(0)
    .max(27)
    .describe('Nombre de jours après la date de début du plan (0 = jour de début).'),
  startTime: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Heure de début 'HH:mm' (ex. 09:00) dans un créneau libre, ou null sans contrainte d'agenda.",
    ),
  intensity: planIntensitySchema,
  title: z.string().describe('Titre court de la séance.'),
  durationMin: z.number().min(10).max(420),
  load: z.number().min(0).max(400).describe('Charge / TSS estimé de la séance.'),
  rationale: z
    .string()
    .describe('Une phrase de 15 mots au plus : pourquoi cette séance maintenant.'),
});

/**
 * One variant per kind of session, so the model cannot leave the steps out: an endurance
 * session carries its structure, a strength session its exercises. No prose description — the
 * server writes it from the steps, and the model spends its time on the session, not on text.
 */
const generatedSessionSchema = z.discriminatedUnion('type', [
  generatedSessionBaseSchema.extend({
    type: z.enum(['RUN', 'BIKE', 'SWIM']),
    endurancePrescription: coachEndurancePrescriptionGenerationSchema.describe(
      'Déroulé : échauffement, corps, retour au calme — même pour une sortie continue.',
    ),
  }),
  generatedSessionBaseSchema.extend({
    type: z.literal('STRENGTH'),
    strengthPrescription: coachStrengthPrescriptionGenerationSchema.describe(
      'Exercices avec séries et répétitions.',
    ),
  }),
]);

export const coachPlanGenerationSchema = z.object({
  summary: z
    .string()
    .describe('Une phrase de 25 mots au plus : la logique du bloc (phase, intention, fraîcheur).'),
  sessions: z.array(generatedSessionSchema).min(1).max(14),
});

/** Paramètres de la requête de génération. */
export const coachPlanRequestSchema = z.object({
  startDate: z.coerce.date().optional(),
  days: z.coerce.number().int().min(1).max(28).optional(),
  focus: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
  targetLoad: z.coerce.number().int().min(0).max(1200).optional().nullable(),
  planPhase: z.string().optional().nullable(),
  planFocus: z.string().optional().nullable(),
});

/** Tags bornés pour le debrief séance (inspiré feedback Campus, ADR-083 roadmap). */
export const sessionAnalysisScoreTagSchema = z.enum([
  'PACING',
  'INTENSITY',
  'VOLUME',
  'EXECUTION',
  'RECOVERY',
  'TECHNIQUE',
  'FUELING',
  'CONSISTENCY',
]);

export type SessionAnalysisScoreTag = z.infer<typeof sessionAnalysisScoreTagSchema>;

/** Analyse d'une séance réalisée vs prévue. */
export const sessionAnalysisSchema = z.object({
  complianceScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Score de conformité 0-100 entre le prévu et le réalisé.'),
  verdict: z
    .enum(['AS_PLANNED', 'HARDER', 'EASIER', 'SHORTER', 'LONGER', 'DIFFERENT'])
    .describe(
      'Verdict global : conforme, plus dur, plus facile, plus court, plus long, ou différent.',
    ),
  summary: z.string().describe('Résumé en 1-2 phrases de la réalisation.'),
  remarks: z
    .array(z.string())
    .max(5)
    .describe('Remarques pertinentes et exploitables (3 max idéalement).'),
  strengths: z
    .array(z.string())
    .max(4)
    .optional()
    .describe('Points forts concrets de la réalisation (1-3 idéalement).'),
  improvements: z
    .array(z.string())
    .max(4)
    .optional()
    .describe("Axes d'amélioration actionnables (1-3 idéalement)."),
  scoreTags: z
    .array(sessionAnalysisScoreTagSchema)
    .max(4)
    .optional()
    .describe(
      'Tags thématiques bornés (PACING, INTENSITY, VOLUME, EXECUTION, RECOVERY, TECHNIQUE, FUELING, CONSISTENCY).',
    ),
  recommendation: z.string().describe('Conseil concret à retenir pour la suite.'),
  physicalReassessments: z
    .array(
      z.object({
        noteId: z
          .string()
          .describe(
            "ID EXACT d'une douleur/blessure ACTIVE fournie dans le contexte. N'invente jamais d'ID : recopie-le tel quel.",
          ),
        noteTitle: z.string().describe("Titre de la note physique concernée (pour l'affichage)."),
        question: z
          .string()
          .describe(
            "Question courte et ciblée à poser à l'athlète pour réévaluer cette douleur après cette séance.",
          ),
        suggestedSeverity: z
          .number()
          .int()
          .min(0)
          .max(10)
          .nullable()
          .describe(
            "Sévérité 0-10 suggérée UNIQUEMENT si l'athlète l'a explicitement indiquée dans ses notes/ressenti. Sinon null (l'athlète renseignera lui-même).",
          ),
        comment: z
          .string()
          .describe(
            'Commentaire pré-rempli pour le point de suivi, rappelant le contexte de la séance (ex. test diagnostique réalisé).',
          ),
      }),
    )
    .max(3)
    .optional()
    .describe(
      'Propositions de réévaluation du suivi physique, UNIQUEMENT pour les douleurs/blessures actives dont la zone est explicitement sollicitée ou mentionnée par la consigne / les notes de cette séance. Laisse vide ou omets si rien de pertinent.',
    ),
});

export type SessionAnalysis = z.infer<typeof sessionAnalysisSchema>;

/** Analyse GLOBALE d'un brick (enchaînement multisport). */
export const brickAnalysisSchema = z.object({
  overallScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Score global d'exécution du brick 0-100 (transitions incluses)."),
  summary: z.string().describe('Synthèse globale du brick en 1-2 phrases.'),
  transition: z
    .string()
    .describe(
      "Analyse de l'enchaînement / des transitions : dérive cardiaque, perte d'allure en sortie de vélo, sensations dans les premières minutes du sport suivant.",
    ),
  remarks: z.array(z.string()).max(5).describe("Remarques exploitables sur l'ensemble du brick."),
  recommendation: z.string().describe('Conseil concret pour améliorer les prochains bricks.'),
});

export type BrickAnalysis = z.infer<typeof brickAnalysisSchema>;

/** Analyse narrative contextuelle d'une activité (figée en base). */
export const activityNarrativeSchema = z.object({
  headline: z.string().describe('Titre accrocheur en une phrase.'),
  narrative: z
    .string()
    .describe('2 à 4 phrases style coach : comparaisons factuelles, contexte, ton bienveillant.'),
});

export type ActivityNarrative = z.infer<typeof activityNarrativeSchema>;

/** Réadaptation des séances à venir. */
const nullableAdaptString = z.preprocess(
  (v) => (v === '' || v === 'null' ? null : v),
  z.string().nullable(),
);

const nullableAdaptInt = z.preprocess((v) => {
  if (v === undefined || v === null || v === undefined || v === '') {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}, z.number().int().nullable());

const adaptChangeBase = {
  action: z.enum(['MODIFY', 'REMOVE', 'ADD']),
  sessionId: z
    .string()
    .nullable()
    .describe('ID de la séance existante (pour MODIFY/REMOVE), null pour ADD.'),
  date: z.string().nullable().describe('Date yyyy-MM-dd (requise pour ADD).'),
  type: z.enum(['RUN', 'BIKE', 'SWIM', 'STRENGTH']).nullable(),
  intensity: z.enum(['RECOVERY', 'ENDURANCE', 'TEMPO', 'THRESHOLD', 'VO2MAX', 'RACE']).nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  strengthPrescription: coachStrengthPrescriptionSchema
    .nullable()
    .optional()
    .describe(
      'Pour ADD/MODIFY STRENGTH : prescription structurée. null/omit = ne pas changer (MODIFY) ou non-STRENGTH.',
    ),
  endurancePrescription: coachEndurancePrescriptionSchema
    .nullable()
    .optional()
    .describe(
      'Pour ADD/MODIFY RUN ou BIKE structurée : déroulé en étapes et groupes répétés. null/omit = ne pas changer (MODIFY) ou séance sans structure.',
    ),
  durationMin: z.number().nullable().describe('Durée en minutes (entier).'),
  load: z.number().nullable().describe('Charge TSS (entier).'),
  reason: z.string().describe('Pourquoi cet ajustement.'),
};

/** Schéma permissif pour la génération IA (accepte les décimales). */
export const adaptPlanGenerationSchema = z.object({
  summary: z.string().describe('Synthèse des ajustements proposés et de leur logique.'),
  changes: z
    .array(
      z.object({
        ...adaptChangeBase,
        endurancePrescription: coachEndurancePrescriptionGenerationSchema
          .nullable()
          .optional()
          .describe(
            'Pour ADD/MODIFY RUN ou BIKE structurée : déroulé en étapes et groupes répétés. null/omit = ne pas changer (MODIFY) ou séance sans structure.',
          ),
      }),
    )
    .max(20),
});

export const adaptPlanSchema = z.object({
  summary: z.string().describe('Synthèse des ajustements proposés et de leur logique.'),
  changes: z
    .array(
      z.object({
        action: adaptChangeBase.action,
        sessionId: z.preprocess(
          (v) => (v === '' || v === 'null' ? null : v),
          adaptChangeBase.sessionId,
        ),
        date: nullableAdaptString.describe('Date yyyy-MM-dd (requise pour ADD).'),
        type: adaptChangeBase.type,
        intensity: adaptChangeBase.intensity,
        title: nullableAdaptString,
        description: nullableAdaptString,
        strengthPrescription: adaptChangeBase.strengthPrescription,
        endurancePrescription: adaptChangeBase.endurancePrescription,
        durationMin: nullableAdaptInt,
        load: nullableAdaptInt,
        reason: adaptChangeBase.reason,
      }),
    )
    .max(20),
});

export type AdaptPlan = z.infer<typeof adaptPlanSchema>;

export const adaptRequestSchema = z.object({
  days: z.coerce.number().int().min(1).max(28).optional(),
  focus: z.string().optional().nullable(),
});
