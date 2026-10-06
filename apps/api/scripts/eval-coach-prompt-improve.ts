/**
 * Offline self-improve harness for coach prompt fragments.
 * One mutation per fixture · keep only if score rises · never patches source.
 *
 *   yarn api eval:coach-prompt-improve
 *   yarn api eval:coach-prompt-improve -- --write-candidate
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateCoachPromptImprove } from '@sharpit/server/lib/coach/prompt-improve/evaluate-coach-prompt-improve';
import type { CoachPromptMutationId } from '@sharpit/server/lib/coach/prompt-improve/mutate-coach-prompt-fragment';

type Fixture = {
  id: string;
  baseline: string;
  mutationId: CoachPromptMutationId;
  expectDecision: 'keep' | 'rollback';
};

const writeCandidate = process.argv.includes('--write-candidate');
const fixturesPath = path.join(import.meta.dirname, 'eval-coach-prompt-improve-fixtures.json');
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[];

type CaseResult = { id: string; ok: boolean; detail: string; retained?: string };

const results: CaseResult[] = [];

for (const fixture of fixtures) {
  const outcome = evaluateCoachPromptImprove(fixture.baseline, fixture.mutationId);
  const failures: string[] = [];

  if (outcome.decision !== fixture.expectDecision) {
    failures.push(`decision ${outcome.decision} ≠ ${fixture.expectDecision}`);
  }
  if (outcome.decision === 'keep' && outcome.mutated.score <= outcome.baseline.score) {
    failures.push(`keep without score rise (${outcome.baseline.score} → ${outcome.mutated.score})`);
  }
  if (outcome.decision === 'rollback' && outcome.retained !== fixture.baseline) {
    failures.push('rollback did not restore baseline');
  }

  results.push({
    id: fixture.id,
    ok: failures.length === 0,
    detail:
      failures.length === 0
        ? `ok (${outcome.baseline.score} → ${outcome.mutated.score}, ${outcome.decision})`
        : failures.join('; '),
    retained: outcome.decision === 'keep' ? outcome.retained : undefined,
  });
}

const failed = results.filter((r) => !r.ok);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const benchDir = path.join(import.meta.dirname, '../.bench');
mkdirSync(benchDir, { recursive: true });
const reportPath = path.join(benchDir, `eval-coach-prompt-improve-${stamp}.md`);
const report = [
  '# Coach prompt self-improve eval',
  '',
  `Cases: ${results.length} · failed: ${failed.length}`,
  '',
  ...results.map((r) => `- ${r.ok ? 'PASS' : 'FAIL'} \`${r.id}\` — ${r.detail}`),
  '',
  'Production prompts are never patched by this harness. Use `--write-candidate` to dump a kept fragment under `.bench/`.',
  '',
].join('\n');
writeFileSync(reportPath, report, 'utf8');

if (writeCandidate) {
  const kept = results.find((r) => r.ok && r.retained);
  if (kept?.retained) {
    const candidatePath = path.join(benchDir, `coach-prompt-candidate-${stamp}.txt`);
    writeFileSync(candidatePath, kept.retained, 'utf8');
    console.log(`Candidate → ${candidatePath}`);
  }
}

console.log(report);
console.log(`Report → ${reportPath}`);
process.exit(failed.length > 0 ? 1 : 0);
