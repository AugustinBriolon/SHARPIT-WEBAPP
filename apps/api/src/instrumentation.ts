import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@sharpit/app/lib/observability/sentry-options';
import { registerAiTelemetry } from '@sharpit/server/lib/ai/telemetry';

/**
 * Next.js instrumentation hook: Langfuse OTEL first (claims the global provider),
 * then Sentry errors (ADR-060). Order matters — Sentry must not own OTEL before Langfuse.
 */
export async function register() {
  await registerAiTelemetry();
  Sentry.init(sentryOptions('api'));
}

export const onRequestError = Sentry.captureRequestError;
