/**
 * Registers Langfuse OTEL + AI SDK v7 telemetry once per Node server process,
 * from each app's `instrumentation.ts`. Edge runtime is skipped.
 *
 * Uses an *isolated* TracerProvider (`setLangfuseTracerProvider`) so Sentry can
 * own the global OpenTelemetry provider without swallowing coach spans
 * (ADR-060; Langfuse FAQ "existing Sentry setup", Option C). Do not call
 * `NodeSDK.start()` here — that fights Sentry for the global provider and was
 * the silence after 2026-10-01.
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
  const { setLangfuseTracerProvider, getLangfuseTracer } = await import('@langfuse/tracing');
  const { LangfuseVercelAiSdkIntegration } = await import('@langfuse/vercel-ai-sdk');

  const provider = new NodeTracerProvider({
    spanProcessors: [processor],
  });
  setLangfuseTracerProvider(provider);
  registerTelemetry(new LangfuseVercelAiSdkIntegration({ tracer: getLangfuseTracer() }));
  registered = true;
}
