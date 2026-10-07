import { beforeEach, describe, expect, it, vi } from 'vitest';

const setLangfuseTracerProvider = vi.fn();
const getLangfuseTracer = vi.fn(() => ({ name: 'langfuse-tracer' }));
const registerTelemetry = vi.fn();
const NodeTracerProvider = vi.fn(function NodeTracerProvider(
  this: { opts: unknown },
  opts: unknown,
) {
  this.opts = opts;
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

vi.mock('@langfuse/tracing', () => ({
  setLangfuseTracerProvider: (...args: unknown[]) => setLangfuseTracerProvider(...args),
  getLangfuseTracer: () => getLangfuseTracer(),
}));

vi.mock('@langfuse/vercel-ai-sdk', () => ({
  LangfuseVercelAiSdkIntegration: LangfuseVercelAiSdkIntegration,
}));

describe('registerAiTelemetry', () => {
  beforeEach(async () => {
    vi.resetModules();
    setLangfuseTracerProvider.mockClear();
    getLangfuseTracer.mockClear();
    registerTelemetry.mockClear();
    NodeTracerProvider.mockClear();
    LangfuseVercelAiSdkIntegration.mockClear();
    process.env.NEXT_RUNTIME = 'nodejs';
    const { resetAiTelemetryRegistrationForTests } = await import('./telemetry');
    resetAiTelemetryRegistrationForTests();
  });

  it('installs an isolated Langfuse TracerProvider and wires the AI SDK tracer', async () => {
    const { registerAiTelemetry } = await import('./telemetry');
    await registerAiTelemetry();

    expect(NodeTracerProvider).toHaveBeenCalledOnce();
    expect(setLangfuseTracerProvider).toHaveBeenCalledOnce();
    expect(setLangfuseTracerProvider.mock.calls[0]?.[0]).toBeInstanceOf(NodeTracerProvider);
    expect(LangfuseVercelAiSdkIntegration).toHaveBeenCalledWith({
      tracer: { name: 'langfuse-tracer' },
    });
    expect(registerTelemetry).toHaveBeenCalledOnce();
  });

  it('is a no-op on the edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const { registerAiTelemetry } = await import('./telemetry');
    await registerAiTelemetry();

    expect(setLangfuseTracerProvider).not.toHaveBeenCalled();
    expect(registerTelemetry).not.toHaveBeenCalled();
  });

  it('registers only once per process', async () => {
    const { registerAiTelemetry } = await import('./telemetry');
    await registerAiTelemetry();
    await registerAiTelemetry();

    expect(setLangfuseTracerProvider).toHaveBeenCalledOnce();
    expect(registerTelemetry).toHaveBeenCalledOnce();
  });
});
