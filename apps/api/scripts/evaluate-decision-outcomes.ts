/**
 * Advances the Decision Memory lifecycle: expires stale PRESENTED recommendations,
 * and evaluates outcomes for decisions whose linked session is old enough to judge.
 *
 * Usage:
 *   yarn tsx scripts/evaluate-decision-outcomes.ts
 *   yarn tsx scripts/evaluate-decision-outcomes.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import {
  expireDecision,
  findDecisionsPendingOutcomeEvaluation,
  findStalePresentedDecisions,
} from '@sharpit/server/lib/decision-memory/repository';
import { evaluateAndSaveDecisionOutcome } from '@sharpit/server/lib/decision-memory/evaluate-decision-outcome';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const now = new Date();

  const stale = await findStalePresentedDecisions(now);
  console.log(`PRESENTED decisions to expire: ${stale.length}`);
  if (!dryRun) {
    for (const decision of stale) {
      await expireDecision(decision.id, now);
    }
  }

  const pending = await findDecisionsPendingOutcomeEvaluation(now);
  console.log(`Decisions ready for outcome evaluation: ${pending.length}`);
  if (!dryRun) {
    let evaluated = 0;
    let inconclusive = 0;
    for (const { decision, plannedSessionId } of pending) {
      const outcome = await evaluateAndSaveDecisionOutcome(decision.id, plannedSessionId, now);
      if (!outcome) {
        continue;
      }
      if (outcome.outcomeStatus === 'EVALUATED') {
        evaluated += 1;
      } else {
        inconclusive += 1;
      }
    }
    console.log(`Outcomes recorded: ${evaluated} evaluated, ${inconclusive} inconclusive.`);
  }

  if (dryRun) {
    console.log('Dry-run: no changes written.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
