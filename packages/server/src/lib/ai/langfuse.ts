import type { LangfuseSpanProcessor } from '@langfuse/otel';

let processorPromise: Promise<LangfuseSpanProcessor | null> | null = null;

/**
 * Vitest / unit runs must not open OTEL exporters or call Next `after()`.
 */
export function isLangfuseConfigured(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return false;
  }
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() && process.env.LANGFUSE_SECRET_KEY?.trim(),
  );
}

/**
 * Shared Langfuse OTEL processor — lazy so importing this module in tests does
 * not construct an exporter (and spam missing-key warnings).
 */
export async function getLangfuseSpanProcessor(): Promise<LangfuseSpanProcessor | null> {
  if (!isLangfuseConfigured()) {
    return null;
  }
  if (!processorPromise) {
    processorPromise = import('@langfuse/otel').then(({ LangfuseSpanProcessor }) => {
      // Immediate export: Vercel freezes the isolate; batched spans are often lost
      // even when `after()` flushes (Langfuse serverless guidance).
      return new LangfuseSpanProcessor({ exportMode: 'immediate' });
    });
  }
  return processorPromise;
}

/** Flush pending spans — call from `after()` on coach routes. */
export async function flushLangfuseTraces(): Promise<void> {
  const active = await getLangfuseSpanProcessor();
  if (!active) {
    return;
  }
  await active.forceFlush();
}
