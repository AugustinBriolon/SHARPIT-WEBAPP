import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { shouldUseNeonAdapter } from './neon-adapter';

/**
 * The client is generated with `engineType = "client"` (no Rust query engine in the bundle), which
 * needs a driver adapter for every connection: Neon's serverless one on a Neon host, `pg` elsewhere
 * (the local Docker database, a CI Postgres). Lazy by construction: nothing connects until a query,
 * so a build without `DATABASE_URL` still loads.
 */
export function createPrismaAdapter(
  connectionString: string | undefined = process.env.DATABASE_URL,
  override: string | undefined = process.env.PRISMA_NEON_ADAPTER,
): PrismaNeon | PrismaPg {
  return shouldUseNeonAdapter(connectionString, override)
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
}

/** A plain client for seeds and one-off scripts, which have no athlete scope to apply. */
export function createScriptPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: createPrismaAdapter() });
}
