import {
  CALENDAR_MUTATION_TOOL_TYPES,
  type ToolPartLite,
} from '@sharpit/app/lib/coach/chat/tools/coach-tool-parts';

type SessionInput = {
  title?: string;
  date?: string;
};

type SessionOutput = {
  ok?: boolean;
  error?: string;
  title?: string | null;
};

const FAILURE_LABEL: Record<string, string> = {
  'tool-createPlannedSession': 'Séance non ajoutée',
  'tool-createBrickSession': 'Brick non ajouté',
  'tool-updatePlannedSession': 'Séance non modifiée',
  'tool-deletePlannedSession': 'Séance non supprimée',
  'tool-setTravelContext': 'Contexte voyage non enregistré',
  'tool-setTrainingConstraint': 'Contrainte non enregistrée',
  'tool-logFoods': 'Aliments non ajoutés',
};

const SUCCESS_DETAIL_GENERIC: Record<string, string> = {
  'tool-createPlannedSession': "Cette séance n'a pas pu être ajoutée",
  'tool-createBrickSession': "Ce brick n'a pas pu être ajouté",
  'tool-updatePlannedSession': "Cette séance n'a pas pu être modifiée",
  'tool-deletePlannedSession': "Cette séance n'a pas pu être supprimée",
  'tool-setTravelContext': "Ce contexte voyage n'a pas pu être enregistré",
  'tool-setTrainingConstraint': "Cette contrainte n'a pas pu être enregistrée",
  'tool-logFoods': "Ces aliments n'ont pas pu être ajoutés au journal",
};

export function sessionTitleFromPart(part: ToolPartLite): string | null {
  const input = (part.input ?? {}) as SessionInput;
  const output = (part.output ?? {}) as SessionOutput;
  const title = output.title ?? input.title;
  return title?.trim() ? title.trim() : null;
}

function classifyToolError(trimmed: string): { hint: string; debug: string | null } | null {
  const lower = trimmed.toLowerCase();
  if (lower === 'an error occurred.' || lower === 'an error occurred') {
    return { hint: "L'ajout n'a pas abouti", debug: trimmed };
  }
  if (lower.includes('fetch failed') || lower.includes('network')) {
    return { hint: 'Problème de connexion — réessaie dans un instant', debug: trimmed };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { hint: 'La requête a pris trop de temps', debug: trimmed };
  }
  return null;
}

/** Message utilisateur en français ; détail technique réservé au tooltip. */
export function humanizeToolErrorMessage(raw?: string | null): {
  hint: string | null;
  debug: string | null;
} {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { hint: null, debug: null };
  }

  const classified = classifyToolError(trimmed);
  if (classified) {
    return classified;
  }

  const looksFrench = /[àâäéèêëïîôùûüç]/i.test(trimmed);
  if (looksFrench) {
    return { hint: trimmed, debug: null };
  }

  if (/^[a-z0-9\s.!?'",:-]+$/i.test(trimmed)) {
    return { hint: "L'opération n'a pas abouti", debug: trimmed };
  }

  return { hint: trimmed, debug: null };
}

export function failureLabelForPart(part: ToolPartLite): string {
  const base = FAILURE_LABEL[part.type] ?? 'Échec';
  const title = sessionTitleFromPart(part);
  return title ? `${base} — ${title}` : base;
}

export function isToolSuccess(part: ToolPartLite): boolean {
  if (part.state === 'output-available') {
    const output = part.output as SessionOutput | undefined;
    return output?.ok !== false;
  }
  return false;
}

export function isToolFailure(part: ToolPartLite): boolean {
  if (part.state === 'output-error') {
    return true;
  }
  if (part.state === 'output-available') {
    const output = part.output as SessionOutput | undefined;
    return output?.ok === false;
  }
  return false;
}

function outputErrorFromPart(part: ToolPartLite): string | null {
  const output = part.output as SessionOutput | undefined;
  if (output?.ok === false) {
    return output.error?.trim() ?? null;
  }
  return null;
}

export function rawErrorFromPart(part: ToolPartLite): string | null {
  if (part.state === 'output-error') {
    return part.errorText?.trim() ?? null;
  }
  if (part.state === 'output-available') {
    return outputErrorFromPart(part);
  }
  return null;
}

export function failureHintForPart(part: ToolPartLite): {
  hint: string | null;
  debug: string | null;
} {
  const raw = rawErrorFromPart(part);
  const humanized = humanizeToolErrorMessage(raw);
  if (humanized.hint) {
    return humanized;
  }
  return {
    hint: SUCCESS_DETAIL_GENERIC[part.type] ?? "L'opération n'a pas abouti",
    debug: raw,
  };
}

export type ToolDisplayEntry =
  | { kind: 'single'; part: ToolPartLite }
  | {
      kind: 'condensed-failures';
      toolType: string;
      count: number;
      titles: string[];
      hint: string | null;
      debug: string | null;
    };

function failureCondenseKey(part: ToolPartLite): string {
  const { hint, debug } = failureHintForPart(part);
  return `${part.type}|${hint ?? ''}|${debug ?? ''}`;
}

function condenseFailures(failures: ToolPartLite[]): ToolDisplayEntry[] {
  const groups = new Map<string, ToolPartLite[]>();
  for (const part of failures) {
    const key = failureCondenseKey(part);
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    if (group.length === 1) {
      return { kind: 'single' as const, part: group[0] };
    }
    const titles = group.map(sessionTitleFromPart).filter((t): t is string => Boolean(t));
    const { hint, debug } = failureHintForPart(group[0]);
    return {
      kind: 'condensed-failures' as const,
      toolType: group[0].type,
      count: group.length,
      titles,
      hint,
      debug,
    };
  });
}

/** Succès groupés, puis échecs condensés ; le reste conserve l'ordre d'origine. */
export function buildToolDisplayEntries(parts: ToolPartLite[]): ToolDisplayEntry[] {
  const other: ToolPartLite[] = [];
  const successes: ToolPartLite[] = [];
  const failures: ToolPartLite[] = [];

  for (const part of parts) {
    if (CALENDAR_MUTATION_TOOL_TYPES.has(part.type) && isToolSuccess(part)) {
      successes.push(part);
    } else if (CALENDAR_MUTATION_TOOL_TYPES.has(part.type) && isToolFailure(part)) {
      failures.push(part);
    } else {
      other.push(part);
    }
  }

  return [
    ...other.map((part) => ({ kind: 'single' as const, part })),
    ...successes.map((part) => ({ kind: 'single' as const, part })),
    ...condenseFailures(failures),
  ];
}

export function condensedFailureLabel(
  entry: Extract<ToolDisplayEntry, { kind: 'condensed-failures' }>,
): string {
  const base = FAILURE_LABEL[entry.toolType] ?? 'Échec';
  if (entry.count === 1) {
    return base;
  }
  if (entry.toolType === 'tool-createPlannedSession') {
    return `${entry.count} séances non ajoutées`;
  }
  if (entry.toolType === 'tool-createBrickSession') {
    return `${entry.count} bricks non ajoutés`;
  }
  return `${entry.count} opérations échouées`;
}
