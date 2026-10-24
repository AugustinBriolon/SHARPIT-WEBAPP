/**
 * Safe logging helpers — never pass credentials, tokens, passwords, or raw
 * body metrics into log messages. Prefer athleteId + error name/code only.
 */

const SENSITIVE_KEY =
  /password|passwd|secret|token|cookie|authorization|credential|refresh|access_token|session|api_?key/i;

function sanitizeLogString(value: string): string {
  if (value.length > 200) {
    return `${value.slice(0, 40)}…[len=${value.length}]`;
  }
  return value;
}

function sanitizeLogError(value: Error): { name: string; message: string } {
  return { name: value.name, message: value.message };
}

function sanitizeLogArray(value: unknown[], depth: number): unknown[] {
  return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));
}

function sanitizeLogObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[Redacted]' : sanitizeLogValue(nested, depth + 1);
  }
  return out;
}

function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[Truncated]';
  }
  if (isNullish(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeLogString(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (value instanceof Error) {
    return sanitizeLogError(value);
  }
  if (Array.isArray(value)) {
    return sanitizeLogArray(value, depth);
  }
  return sanitizeLogObject(value as Record<string, unknown>, depth);
}

/** Log an error without leaking secrets or body-metric payloads. */
export function logSafeError(scope: string, error: unknown, meta?: Record<string, unknown>): void {
  const safeMeta = meta ? sanitizeLogValue(meta) : undefined;
  const safeError = sanitizeLogValue(error);
  if (safeMeta) {
    console.error(`[${scope}]`, safeError, safeMeta);
  } else {
    console.error(`[${scope}]`, safeError);
  }
}
