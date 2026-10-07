/**
 * Registers Langfuse OTEL + AI SDK v7 telemetry once per Node server process,
 * from each app's `instrumentation.ts`. Edge runtime is skipped.
 *
 * Must run *before* `Sentry.init()`: Sentry v8+ claims the global TracerProvider.
 * With `tracesSampleRate: 0`, that provider drops spans — so Langfuse must own
 * the global provider first (ADR-060). An isolated Langfuse-only provider is not
 * enough under Next.js: duplicated `@langfuse/tracing` bundles fall back to the
 * global provider and lose the isolated one.
 *
 * Env (already in .env / Vercel):
 * - LANGFUSE_PUBLIC_KEY
 * - LANGFUSE_SECRET_KEY
 * - LANGFUSE_BASE_URL (optional; defaults to EU cloud)
 */

let registered = false;

/** Test-only: allow re-running registration after mocks are reset. */
export function resetAiTelemetryRegistrationForTests(): void {
  registered = false;
}

export async function registerAiTelemetry(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  if (registered) {
    return;
  }

  const { isLangfuseConfigured, getLangfuseSpanProcessor } =
    await import('@sharpit/server/lib/ai/langfuse');
  if (!isLangfuseConfigured()) {
    return;
  }

  const processor = await getLangfuseSpanProcessor();
  if (!processor) {
    return;
  }

  const { registerTelemetry } = await import('ai');
  const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
  const { LangfuseVercelAiSdkIntegration } = await import('@langfuse/vercel-ai-sdk');

  const provider = new NodeTracerProvider({
    spanProcessors: [processor],
  });
  // Claim the process-global provider before Sentry can.
  provider.register();
  registerTelemetry(new LangfuseVercelAiSdkIntegration());
  registered = true;
}
