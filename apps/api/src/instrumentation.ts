import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@sharpit/app/lib/observability/sentry-options';
import { registerAiTelemetry } from '@sharpit/server/lib/ai/telemetry';

/**
 * Next.js instrumentation hook: Sentry errors (ADR-060), then Langfuse OTEL + AI SDK telemetry.
 * Langfuse uses an isolated TracerProvider so it does not fight Sentry for the global one.
 */
export async function register() {
  Sentry.init(sentryOptions('api'));
  await registerAiTelemetry();
}

export const onRequestError = Sentry.captureRequestError;
