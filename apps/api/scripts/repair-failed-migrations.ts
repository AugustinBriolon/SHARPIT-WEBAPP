/**
 * Unblocks Prisma migrate deploy when a migration is stuck in "failed" state (P3009).
 * Runs before `prisma migrate deploy` on Vercel — no-op when the database is healthy.
 *
 * Handles the post-squash case: `0_baseline` failed on a database that already
 * had the full schema from the pre-squash migration history (CREATE TYPE 42710).
 *
 * Also handles `20260915090000_analysis_evidence_snapshot` when the table was
 * pre-created / half-applied (Postgres 42P07 relation already exists).
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import {
  ANALYSIS_EVIDENCE_MIGRATION,
  BASELINE_MIGRATION,
  decideAnalysisEvidenceRepair,
  decideBaselineRepair,
} from './repair-failed-migrations-logic';

type FailedMigrationRow = {
  migration_name: string;
};

type ExistsRow = {
  exists: boolean;
};

const prisma = new PrismaClient();

function runResolve(migrationName: string, flag: '--applied' | '--rolled-back'): void {
  execSync(`yarn prisma migrate resolve ${flag} ${migrationName}`, {
    stdio: 'inherit',
    env: process.env,
  });
}

async function isFailed(migrationName: string): Promise<boolean> {
  const failed = await prisma.$queryRaw<FailedMigrationRow[]>`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE migration_name = ${migrationName}
      AND finished_at IS NULL
      AND rolled_back_at IS NULL
      AND started_at IS NOT NULL
  `;
  return failed.length > 0;
}

/** Pre-squash databases already own enums + AthleteProfile — baseline must not re-CREATE. */
async function livingSchemaPresent(): Promise<boolean> {
  const [activityType, athleteProfile] = await Promise.all([
    prisma.$queryRaw<ExistsRow[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'ActivityType'
      ) AS "exists"
    `,
    prisma.$queryRaw<ExistsRow[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'AthleteProfile'
      ) AS "exists"
    `,
  ]);
  return Boolean(activityType[0]?.exists && athleteProfile[0]?.exists);
}

async function analysisEvidenceTablePresent(): Promise<boolean> {
  const rows = await prisma.$queryRaw<ExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'AnalysisEvidenceSnapshot'
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function repairBaseline(): Promise<void> {
  const failed = await isFailed(BASELINE_MIGRATION);
  const schemaAlreadyPresent = failed ? await livingSchemaPresent() : false;
  const action = decideBaselineRepair({ failed, schemaAlreadyPresent });

  if (action === 'mark-applied') {
    console.info(
      `[repair-migrations] ${BASELINE_MIGRATION} failed but schema already present — marking applied`,
    );
    runResolve(BASELINE_MIGRATION, '--applied');
    return;
  }

  if (action === 'mark-rolled-back') {
    console.info(
      `[repair-migrations] ${BASELINE_MIGRATION} failed without a living schema — marking rolled back for retry`,
    );
    runResolve(BASELINE_MIGRATION, '--rolled-back');
  }
}

async function repairAnalysisEvidence(): Promise<void> {
  const failed = await isFailed(ANALYSIS_EVIDENCE_MIGRATION);
  const tableAlreadyPresent = failed ? await analysisEvidenceTablePresent() : false;
  const action = decideAnalysisEvidenceRepair({ failed, tableAlreadyPresent });

  if (action === 'mark-applied') {
    console.info(
      `[repair-migrations] ${ANALYSIS_EVIDENCE_MIGRATION} failed but table already present — marking applied`,
    );
    runResolve(ANALYSIS_EVIDENCE_MIGRATION, '--applied');
    return;
  }

  if (action === 'mark-rolled-back') {
    console.info(
      `[repair-migrations] ${ANALYSIS_EVIDENCE_MIGRATION} failed without table — marking rolled back for retry`,
    );
    runResolve(ANALYSIS_EVIDENCE_MIGRATION, '--rolled-back');
  }
}

async function main(): Promise<void> {
  try {
    await repairBaseline();
    await repairAnalysisEvidence();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[repair-migrations] failed', error);
  process.exit(1);
});
