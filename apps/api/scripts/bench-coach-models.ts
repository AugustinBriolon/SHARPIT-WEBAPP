/**
 * Compares chat models on the coach's real prompt: same system prompt, same context, same tools
 * and settings as `/api/coach/chat`, for each question of `coach-bench-questions.json`. Writes a
 * Markdown report (latency, empty answers, answers side by side) under `.bench/`.
 *
 * Run against a local or disposable database: read tools execute, write tools stop at approval.
 * Every run is a billed model call through the AI gateway — always pass `--athlete` so a prod
 * account (e.g. `default`) is never auto-picked and billed by a bench storm.
 *
 * Usage:
 *   yarn api bench:coach-models --athlete <disposableAthleteId>
 *   yarn api bench:coach-models --athlete <id> --questions coach-bench-off-scope.json
 *   yarn api bench:coach-models --athlete <id> --models google/gemini-3-flash,anthropic/claude-haiku-4.5 --limit 5
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { streamText } from 'ai';
import { prisma } from '@sharpit/db/client';
import { coachGatewayOptions } from '@sharpit/server/lib/ai';
import { createCoachTools } from '@sharpit/server/lib/coach/chat/tools/coach-tools';
import { buildCoachSystemPrompt } from '@sharpit/server/lib/coach/chat/coach-system-prompt';
import { coachChatGenerationSettings } from '@sharpit/server/lib/coach/chat/coach-chat-generation';
import { describeCoachChatOutcome } from '@sharpit/server/lib/coach/chat/coach-chat-outcome';
import {
  classifyCoachIntent,
  coachRequestScope,
  type CoachRequestScope,
} from '@sharpit/server/lib/coach/chat/coach-request-scope';
import {
  formatCoachBenchReport,
  summarizeCoachBench,
  type CoachBenchRun,
} from '@sharpit/server/lib/coach/chat/coach-model-bench';

const DEFAULT_MODELS = [
  'deepseek/deepseek-v4-flash',
  'google/gemini-3-flash',
  'anthropic/claude-haiku-4.5',
];
/** Twice the chat route's limit: long enough to see how far past it a model goes. */
const RUN_TIMEOUT_MS = 120_000;

type BenchOptions = {
  models: string[];
  limit: number | null;
  athleteId: string | null;
  questionsFile: string;
};

function readOption(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function parseOptions(): BenchOptions {
  const limit = readOption('limit');
  return {
    models: readOption('models')?.split(',') ?? DEFAULT_MODELS,
    limit: limit ? Number(limit) : null,
    athleteId: readOption('athlete'),
    questionsFile: readOption('questions') ?? 'coach-bench-questions.json',
  };
}

/** Garmin forbids using its data, or anything derived from it, to evaluate AI models (ADR-103). */
async function assertNoGarminData(athleteId: string): Promise<void> {
  const [account, activities] = await Promise.all([
    prisma.garminAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.activity.count({ where: { athleteId, garminId: { not: null } } }),
  ]);
  if (account || activities > 0) {
    throw new Error(
      `Refusing athlete "${athleteId}": it holds Garmin data, which must not feed a model benchmark. Use a disposable athlete without Garmin.`,
    );
  }
}

async function resolveAthleteId(requested: string | null): Promise<string> {
  if (!requested) {
    throw new Error(
      'Pass --athlete <id> (disposable profile). Auto-pick was removed: benches were billing prod athletes.',
    );
  }
  if (requested === 'default' && process.env.ALLOW_BENCH_DEFAULT_ATHLETE !== '1') {
    throw new Error(
      'Refusing athlete "default" (prod owner). Use a disposable --athlete, or set ALLOW_BENCH_DEFAULT_ATHLETE=1.',
    );
  }
  const athlete = await prisma.athleteProfile.findFirst({
    where: { id: requested, deletedAt: null },
    select: { id: true },
  });
  if (!athlete) {
    throw new Error(`No athlete found for --athlete ${requested}`);
  }
  await assertNoGarminData(athlete.id);
  return athlete.id;
}

/** The gateway would silently answer with a fallback model; a benchmark measures one model. */
const benchProviderOptions = {
  ...coachGatewayOptions,
  gateway: { ...coachGatewayOptions.gateway, models: [] },
};

type Prompt = Awaited<ReturnType<typeof buildCoachSystemPrompt>>;

async function runOnce(input: {
  model: string;
  question: string;
  scope: CoachRequestScope;
  prompt: Prompt;
  athleteId: string;
}): Promise<CoachBenchRun> {
  const startedAt = performance.now();
  let firstTextMs: number | null = null;
  const base = { model: input.model, intent: input.scope.intent, question: input.question };
  try {
    const result = streamText({
      model: input.model,
      system: input.prompt.system,
      messages: [{ role: 'user', content: input.question }],
      tools: createCoachTools(input.athleteId, { practicedSports: input.prompt.practicedSports }),
      ...coachChatGenerationSettings(input.scope),
      providerOptions: benchProviderOptions,
      abortSignal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });
    for await (const part of result.stream) {
      if (part.type === 'text-delta' && firstTextMs === null) {
        firstTextMs = Math.round(performance.now() - startedAt);
      }
      if (part.type === 'error') {
        throw part.error;
      }
    }
    const [steps, finishReason, usage] = await Promise.all([
      result.steps,
      result.finishReason,
      result.totalUsage,
    ]);
    const outcome = describeCoachChatOutcome({
      finishReason,
      rawFinishReason: undefined,
      steps,
      finalStep: steps.at(-1)!,
    });
    return {
      ...base,
      firstTextMs,
      totalMs: Math.round(performance.now() - startedAt),
      emptyAnswer: outcome.emptyAnswer,
      error: null,
      finishReason,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
      toolCalls: steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
      text: steps.map((s) => s.text).join('\n\n'),
    };
  } catch (error) {
    return {
      ...base,
      firstTextMs,
      totalMs: Math.round(performance.now() - startedAt),
      emptyAnswer: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      finishReason: null,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      toolCalls: [],
      text: '',
    };
  }
}

async function loadQuestions(fileName: string, limit: number | null): Promise<string[]> {
  const file = path.join(import.meta.dirname, fileName);
  const questions = JSON.parse(await readFile(file, 'utf8')) as string[];
  return limit ? questions.slice(0, limit) : questions;
}

async function writeReport(runs: CoachBenchRun[]): Promise<string> {
  const now = new Date();
  const dir = path.join(import.meta.dirname, '..', '.bench');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `coach-models-${now.toISOString().replace(/[:.]/g, '-')}.md`);
  await writeFile(file, formatCoachBenchReport(runs, now));
  return file;
}

async function main() {
  const options = parseOptions();
  const athleteId = await resolveAthleteId(options.athleteId);
  const questions = await loadQuestions(options.questionsFile, options.limit);
  const runs: CoachBenchRun[] = [];
  for (const question of questions) {
    const scope = coachRequestScope(
      classifyCoachIntent({ lastUserText: question, discussKind: null, isPlanningThread: false }),
    );
    const prompt = await buildCoachSystemPrompt(athleteId, async () => null, scope);
    for (const model of options.models) {
      const run = await runOnce({ model, question, scope, prompt, athleteId });
      console.log(
        `${model.padEnd(32)} ${scope.intent.padEnd(9)} first ${run.firstTextMs ?? '—'} ms · total ${run.totalMs} ms${run.error ? ` · ${run.error}` : ''}${run.emptyAnswer ? ' · EMPTY' : ''}`,
      );
      runs.push(run);
    }
  }
  console.table(summarizeCoachBench(runs));
  console.log(`Report: ${await writeReport(runs)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
