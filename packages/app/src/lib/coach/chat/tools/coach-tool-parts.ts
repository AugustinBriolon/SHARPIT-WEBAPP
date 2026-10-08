import type { UIMessage } from 'ai';
import { isSet } from '@sharpit/shared/value';

export type ToolPartLite = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; isAutomatic?: boolean; approved?: boolean; reason?: string };
};

export const CALENDAR_MUTATION_TOOL_TYPES = new Set([
  'tool-createPlannedSession',
  'tool-createBrickSession',
  'tool-updatePlannedSession',
  'tool-deletePlannedSession',
  'tool-setTravelContext',
  'tool-setTrainingConstraint',
  'tool-logFoods',
]);

const TERMINAL_TOOL_STATES = new Set(['output-available', 'output-error', 'output-denied']);

/** HITL in progress — not executed yet, and not a failed/interrupted tool. */
const PENDING_APPROVAL_STATES = new Set(['approval-requested', 'approval-responded']);

export function isTerminalToolState(state: string | undefined): boolean {
  return isSet(state) && TERMINAL_TOOL_STATES.has(state);
}

export function isPendingApprovalToolState(state: string | undefined): boolean {
  return isSet(state) && PENDING_APPROVAL_STATES.has(state);
}

/**
 * Idle stream + calendar mutation that never reached a terminal or HITL state.
 * `approval-responded` is NOT stale: the athlete validated one card while
 * siblings still wait, and auto-continue only fires once every approval in
 * the step has a response.
 */
export function isStaleCalendarToolPart(part: ToolPartLite, streamIdle: boolean): boolean {
  if (!streamIdle || !CALENDAR_MUTATION_TOOL_TYPES.has(part.type)) {
    return false;
  }
  if (isTerminalToolState(part.state)) {
    return false;
  }
  if (isPendingApprovalToolState(part.state)) {
    return false;
  }
  return true;
}

export function collectPendingApprovals(messages: UIMessage[]): ToolPartLite[] {
  const pending: ToolPartLite[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }
    for (const part of message.parts) {
      if (!part.type.startsWith('tool-')) {
        continue;
      }
      const toolPart = part as ToolPartLite;
      if (
        toolPart.state === 'approval-requested' &&
        toolPart.approval &&
        !toolPart.approval.isAutomatic
      ) {
        pending.push(toolPart);
      }
    }
  }
  return pending;
}

export function hasUnresolvedCalendarTools(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }
    for (const part of message.parts) {
      if (!part.type.startsWith('tool-')) {
        continue;
      }
      const toolPart = part as ToolPartLite;
      if (!CALENDAR_MUTATION_TOOL_TYPES.has(toolPart.type)) {
        continue;
      }
      if (!isTerminalToolState(toolPart.state)) {
        return true;
      }
    }
  }
  return false;
}

/** Marque les propositions calendrier non finalisées comme refusées (nouvelle demande utilisateur). */
export function dismissUnresolvedCalendarTools(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!part.type.startsWith('tool-')) {
          return part;
        }
        const toolPart = part as ToolPartLite;
        if (!CALENDAR_MUTATION_TOOL_TYPES.has(toolPart.type)) {
          return part;
        }
        if (isTerminalToolState(toolPart.state)) {
          return part;
        }

        const approvalId = toolPart.approval?.id ?? `dismissed-${toolPart.type}`;
        return {
          ...toolPart,
          state: 'output-denied',
          approval: {
            id: approvalId,
            approved: false as const,
            reason: 'Proposition ignorée — nouvelle demande envoyée',
          },
        };
      }),
    };
  }) as UIMessage[];
}
