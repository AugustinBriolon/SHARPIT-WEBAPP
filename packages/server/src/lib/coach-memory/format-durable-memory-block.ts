/**
 * Formats active structured coach-memory entries (INJURY / PREFERENCE / NOTE)
 * for the coach system prompt — beside free-text profileContext (ADR-080).
 */

import {
  COACH_MEMORY_TYPE_LABELS,
  type CoachMemoryEntry,
  type CoachMemoryType,
} from '@sharpit/app/lib/coach-memory/core/types';

const DURABLE_TYPES: ReadonlySet<CoachMemoryType> = new Set(['INJURY', 'PREFERENCE', 'NOTE']);

export function formatDurableMemoryBlock(entries: CoachMemoryEntry[]): string {
  const active = entries.filter((entry) => entry.isActive && DURABLE_TYPES.has(entry.type));
  if (active.length === 0) {
    return '';
  }

  const lines = active.map((entry) => {
    const kind = COACH_MEMORY_TYPE_LABELS[entry.type] ?? entry.type;
    const title = entry.label?.trim() || entry.note?.trim() || kind;
    const note = entry.note?.trim() && entry.note.trim() !== title ? ` — ${entry.note.trim()}` : '';
    const openEnded = entry.endDate.startsWith('2099');
    const showDates = entry.type === 'INJURY' || !openEnded;
    const dates = showDates ? ` (${entry.startDate} → ${entry.endDate})` : '';
    return `- [${kind}] ${title}${dates}${note}`;
  });

  return [
    '\n## Mémoire durable (structurée — priorité haute)',
    'Notes, préférences et blessures que l’athlète (ou toi) a enregistrées. Respecte-les ; ne les invente pas. Le journal libre reste dans « Contexte personnel ».',
    ...lines,
  ].join('\n');
}
