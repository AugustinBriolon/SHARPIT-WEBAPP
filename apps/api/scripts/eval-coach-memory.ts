/**
 * Offline eval for Decision Memory → coach learning prompt block.
 * No LLM / no DB — golden fixtures only.
 *
 *   yarn api eval:coach-memory
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatLearningMemoryBlock } from '@sharpit/server/lib/coach/memory/format-learning-memory-block';
import { buildLearningFeedback } from '@sharpit/server/lib/decision-memory/learning-feedback';
import type { OutcomeEvaluation } from '@sharpit/app/lib/decision-memory/types';
import type { ActivityType, SessionIntensity } from '@prisma/client';

type FixtureOutcome = {
  type: ActivityType;
  intensity: SessionIntensity | null;
  outcome: OutcomeEvaluation;
};

type Fixture = {
  id: string;
  outcomes: FixtureOutcome[];
  expectBlockEmpty?: boolean;
  expectBlockContains?: string[];
  expectMaxBullets?: number;
};

const fixturesPath = path.join(import.meta.dirname, 'eval-coach-memory-fixtures.json');
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[];

type CaseResult = { id: string; ok: boolean; detail: string };

const results: CaseResult[] = [];

for (const fixture of fixtures) {
  const block = formatLearningMemoryBlock(buildLearningFeedback(fixture.outcomes));
  const failures: string[] = [];

  if (fixture.expectBlockEmpty === true && block !== '') {
    failures.push(`expected empty block, got ${block.length} chars`);
  }
  if (fixture.expectBlockEmpty === false && block === '') {
    failures.push('expected non-empty block');
  }
  for (const needle of fixture.expectBlockContains ?? []) {
    if (!block.includes(needle)) {
      failures.push(`missing substring: ${JSON.stringify(needle)}`);
    }
  }
  if (fixture.expectMaxBullets !== undefined) {
    const bullets = block.split('\n').filter((line) => line.startsWith('- '));
    if (bullets.length > fixture.expectMaxBullets) {
      failures.push(`expected ≤${fixture.expectMaxBullets} bullets, got ${bullets.length}`);
    }
    if (bullets.length === 0 && fixture.expectBlockEmpty !== true) {
      failures.push('expected at least one bullet');
    }
  }

  results.push({
    id: fixture.id,
    ok: failures.length === 0,
    detail: failures.length === 0 ? 'ok' : failures.join('; '),
  });
}

const failed = results.filter((r) => !r.ok);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const benchDir = path.join(import.meta.dirname, '../.bench');
mkdirSync(benchDir, { recursive: true });
const reportPath = path.join(benchDir, `eval-coach-memory-${stamp}.md`);
const report = [
  '# Coach memory eval',
  '',
  `Cases: ${results.length} · failed: ${failed.length}`,
  '',
  ...results.map((r) => `- ${r.ok ? 'PASS' : 'FAIL'} \`${r.id}\` — ${r.detail}`),
  '',
].join('\n');
writeFileSync(reportPath, report, 'utf8');

console.log(report);
console.log(`Report → ${reportPath}`);
process.exit(failed.length > 0 ? 1 : 0);
