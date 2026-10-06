/**
 * Offline quality scout for the Weekly Coaching Brief ViewModel.
 * No LLM / no DB — golden fixtures only.
 *
 *   yarn api eval:weekly-brief
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WeeklyCoachingBriefViewModel } from '@sharpit/app/presentation/weekly-coaching-brief-view-model';
import {
  scoreWeeklyBriefQuality,
  type WeeklyBriefQualityFlag,
} from '@sharpit/server/lib/presentation/coaching/score-weekly-brief-quality';

type Fixture = {
  id: string;
  vm: WeeklyCoachingBriefViewModel;
  expectScore?: number;
  expectFlags?: WeeklyBriefQualityFlag[];
  expectFlagsInclude?: WeeklyBriefQualityFlag[];
};

const fixturesPath = path.join(import.meta.dirname, 'eval-weekly-brief-fixtures.json');
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[];

type CaseResult = { id: string; ok: boolean; detail: string };

const results: CaseResult[] = [];

for (const fixture of fixtures) {
  const { score, flags } = scoreWeeklyBriefQuality(fixture.vm);
  const failures: string[] = [];

  if (fixture.expectScore !== undefined && score !== fixture.expectScore) {
    failures.push(`score ${score} ≠ ${fixture.expectScore}`);
  }
  if (fixture.expectFlags) {
    const got = [...flags].sort().join(',');
    const want = [...fixture.expectFlags].sort().join(',');
    if (got !== want) {
      failures.push(`flags [${got}] ≠ [${want}]`);
    }
  }
  for (const flag of fixture.expectFlagsInclude ?? []) {
    if (!flags.includes(flag)) {
      failures.push(`missing flag ${flag}`);
    }
  }

  results.push({
    id: fixture.id,
    ok: failures.length === 0,
    detail: failures.length === 0 ? `ok (score=${score})` : failures.join('; '),
  });
}

const failed = results.filter((r) => !r.ok);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const benchDir = path.join(import.meta.dirname, '../.bench');
mkdirSync(benchDir, { recursive: true });
const reportPath = path.join(benchDir, `eval-weekly-brief-${stamp}.md`);
const report = [
  '# Weekly brief quality eval',
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
