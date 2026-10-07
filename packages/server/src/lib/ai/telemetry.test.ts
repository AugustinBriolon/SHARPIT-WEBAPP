import { beforeEach, describe, expect, it, vi } from 'vitest';

const register = vi.fn();
const registerTelemetry = vi.fn();
const NodeTracerProvider = vi.fn(function NodeTracerProvider(
  this: { opts: unknown; register: typeof register },
  opts: unknown,
) {
  this.opts = opts;
  this.register = register;
});
const LangfuseVercelAiSdkIntegration = vi.fn(function LangfuseVercelAiSdkIntegration(
  this: { options: unknown },
  options: unknown,
) {
  this.options = options;
});

vi.mock('@sharpit/server/lib/ai/langfuse', () => ({
  isLangfuseConfigured: vi.fn(() => true),
  getLangfuseSpanProcessor: vi.fn(async () => ({ forceFlush: vi.fn() })),
}));

vi.mock('ai', () => ({
  registerTelemetry: (...args: unknown[]) => registerTelemetry(...args),
}));

vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: NodeTracerProvider,
}));

vi.mock('@langfuse/vercel-ai-sdk', () => ({
  LangfuseVercelAiSdkIntegration: LangfuseVercelAiSdkIntegration,
}));

describe('registerAiTelemetry', () => {
  beforeEach(async () => {
    vi.resetModules();
    register.mockClear();
    registerTelemetry.mockClear();
    NodeTracerProvider.mockClear();
    LangfuseVercelAiSdkIntegration.mockClear();
    process.env.NEXT_RUNTIME = 'nodejs';
    const { resetAiTelemetryRegistrationForTests } = await import('./telemetry');
    resetAiTelemetryRegistrationForTests();
  });

  it('registers the Langfuse provider on the global OTEL API before AI SDK wiring', async () => {
    const { registerAiTelemetry } = await import('./telemetry');
    await registerAiTelemetry();

    expect(NodeTracerProvider).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
    expect(LangfuseVercelAiSdkIntegration).toHaveBeenCalledOnce();
    expect(registerTelemetry).toHaveBeenCalledOnce();
  });

  it('is a no-op on the edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const { registerAiTelemetry } = await import('./telemetry');
    await registerAiTelemetry();

    expect(register).not.toHaveBeenCalled();
    expect(registerTelemetry).not.toHaveBeenCalled();
  });

  it('registers only once per process', async () => {
    const { registerAiTelemetry } = await import('./telemetry');
    await registerAiTelemetry();
    await registerAiTelemetry();

    expect(register).toHaveBeenCalledOnce();
    expect(registerTelemetry).toHaveBeenCalledOnce();
  });
});
