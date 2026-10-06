import type { CoachContextSection } from '@sharpit/server/lib/coach/context/coach-context';
import { COACH_REASONING_LEVEL } from '@sharpit/server/lib/ai';

/**
 * What a coach request is about, and so what it needs: which parts of the athlete context,
 * whether the calendar is read, which tools the model may call, how much it thinks first.
 *
 * Every request used to ship the whole context, the agenda and all nine tool schemas (~6 000
 * tokens) whatever the question, and to reason before its first word. A question about last
 * night's sleep needs none of the agenda. The classification is deliberately cautious: when in
 * doubt it answers `general`, which keeps the whole context and every tool — only the agenda,
 * which a tool can still fetch, is left out. Pure: no clock, no database.
 */
export type CoachIntent = 'planning' | 'session' | 'nutrition' | 'recovery' | 'general';

export type CoachToolName =
  | 'listPlannedSessions'
  | 'getScenarioProjection'
  | 'searchWatchExercises'
  | 'getCalendarAvailability'
  | 'createPlannedSession'
  | 'createBrickSession'
  | 'updatePlannedSession'
  | 'deletePlannedSession'
  | 'setTravelContext';

export type CoachRequestScope = {
  intent: CoachIntent;
  /** Null: the whole context. */
  sections: ReadonlySet<CoachContextSection> | null;
  /** Read the next days' calendar into the prompt (an external call). */
  readsAgenda: boolean;
  /** Null: every tool. */
  tools: readonly CoachToolName[] | null;
  reasoning: (typeof COACH_REASONING_LEVEL)['conversational' | 'answer'];
};

/** Always sent: who the athlete is, where they stand today, what they aim for, what hurts. */
const CORE: readonly CoachContextSection[] = [
  'note',
  'thresholds',
  'sports',
  'pmc',
  'decision',
  'health',
  'goals',
  'physical',
  'activityStatus',
];

const READ_ONLY_TOOLS: readonly CoachToolName[] = ['listPlannedSessions', 'getScenarioProjection'];

const SCOPES: Record<CoachIntent, Omit<CoachRequestScope, 'intent'>> = {
  planning: {
    sections: null,
    readsAgenda: true,
    tools: null,
    reasoning: COACH_REASONING_LEVEL.conversational,
  },
  general: {
    sections: null,
    readsAgenda: false,
    tools: null,
    reasoning: COACH_REASONING_LEVEL.answer,
  },
  session: {
    sections: new Set([
      ...CORE,
      'fatigue',
      'adaptation',
      'environment',
      'recent',
      'realized',
      'upcoming',
    ]),
    readsAgenda: false,
    tools: [...READ_ONLY_TOOLS, 'searchWatchExercises'],
    reasoning: COACH_REASONING_LEVEL.answer,
  },
  nutrition: {
    sections: new Set([...CORE, 'nutrition', 'fatigue', 'recent', 'upcoming']),
    readsAgenda: false,
    tools: READ_ONLY_TOOLS,
    reasoning: COACH_REASONING_LEVEL.answer,
  },
  recovery: {
    sections: new Set([...CORE, 'fatigue', 'adaptation', 'recent', 'realized', 'upcoming']),
    readsAgenda: false,
    tools: READ_ONLY_TOOLS,
    reasoning: COACH_REASONING_LEVEL.answer,
  },
};

/** Word stems, matched on the question without accents. Checked in this order. */
const KEYWORDS: ReadonlyArray<[CoachIntent, readonly string[]]> = [
  [
    'planning',
    [
      'planifi',
      'programm',
      'plan ',
      'planning',
      'semaine prochaine',
      'deplace',
      'decale',
      'reporte',
      'ajoute',
      'rajoute',
      'cree',
      'creer',
      'supprime',
      'annule',
      'remplace',
      'modifie',
      'change ma',
      'change la',
      'cale',
      'mets ',
      'mettre',
      'organise',
      'calendrier',
      'agenda',
      'creneau',
      'dispo',
      'voyage',
      'vacances',
      'deplacement',
      'envoie',
      'montre',
    ],
  ],
  [
    'nutrition',
    [
      'mang',
      'nutrition',
      'calori',
      'kcal',
      'protein',
      'glucide',
      'lipide',
      'repas',
      'regime',
      'aliment',
      'hydrat',
      'carburant',
      'poids',
      'petit-dej',
      'diner',
      'dejeuner',
      'collation',
    ],
  ],
  [
    'recovery',
    [
      'sommeil',
      'dormi',
      'dors',
      'nuit',
      'recup',
      'fatigu',
      'hrv',
      'vfc',
      'repos',
      'courbatu',
      'stress',
      'forme du jour',
      'frais',
      'epuis',
    ],
  ],
  [
    'session',
    [
      'analys',
      'seance d',
      'ma sortie',
      'mon footing',
      'ma course',
      'activite',
      'allure',
      'watts',
      'puissance',
      'frequence cardiaque',
      'cadence',
      'fractionne',
      'comment s est passe',
      "comment s'est passe",
      'bien couru',
      'record',
    ],
  ],
];

/** The screen a conversation was opened from says more than any keyword. */
const DISCUSS_INTENTS: Partial<Record<string, CoachIntent>> = {
  planning: 'planning',
  'planned-session': 'planning',
  activity: 'session',
  record: 'session',
  'physical-condition': 'recovery',
  'journal-analyses': 'recovery',
  nutrition: 'nutrition',
};

export function normalizeCoachText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'");
}

export function classifyCoachIntent(input: {
  lastUserText: string;
  discussKind?: string | null;
  /** The conversation already proposed calendar changes: a follow-up stays in planning. */
  isPlanningThread?: boolean;
}): CoachIntent {
  const text = normalizeCoachText(input.lastUserText);
  const byWords = KEYWORDS.find(([, stems]) => stems.some((stem) => text.includes(stem)))?.[0];
  if (byWords === 'planning' || input.isPlanningThread) {
    return 'planning';
  }
  const byScreen = input.discussKind ? DISCUSS_INTENTS[input.discussKind] : undefined;
  return byScreen ?? byWords ?? 'general';
}

export function coachRequestScope(intent: CoachIntent): CoachRequestScope {
  return { intent, ...SCOPES[intent] };
}

const CALENDAR_TOOL_PARTS = new Set([
  'tool-createPlannedSession',
  'tool-createBrickSession',
  'tool-updatePlannedSession',
  'tool-deletePlannedSession',
  'tool-setTravelContext',
]);

type LooseMessage = { role?: unknown; parts?: unknown };
type LoosePart = { type?: unknown; text?: unknown };

function partsOf(message: unknown): LoosePart[] {
  const parts = (message as LooseMessage | null)?.parts;
  return Array.isArray(parts) ? (parts as LoosePart[]) : [];
}

/** The athlete's latest question, as plain text. */
export function lastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return '';
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if ((messages[index] as LooseMessage | null)?.role === 'user') {
      return partsOf(messages[index])
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text as string)
        .join('\n');
    }
  }
  return '';
}

/** Whether the coach proposed calendar changes in the last few turns. */
export function isPlanningThread(messages: unknown, lookback = 4): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }
  return messages
    .slice(-lookback)
    .some((message) => partsOf(message).some((part) => CALENDAR_TOOL_PARTS.has(String(part.type))));
}
