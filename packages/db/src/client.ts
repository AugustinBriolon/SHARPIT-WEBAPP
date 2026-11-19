import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import { athleteScopeExtension } from './athlete-scope';
import { shouldUseNeonAdapter } from './neon-adapter';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  const log =
    process.env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const);

  const client = shouldUseNeonAdapter(connectionString, process.env.PRISMA_NEON_ADAPTER)
    ? new PrismaClient({ adapter: new PrismaNeon({ connectionString }), log: [...log] })
    : new PrismaClient({ log: [...log] });
  // A query extension leaves every model's API as it was, so the client keeps its type.
  return client.$extends(athleteScopeExtension()) as unknown as PrismaClient;
}

/** Bust dev HMR cache when schema delegates are missing (e.g. after prisma generate). */
function isPrismaClientCurrent(client: PrismaClient): boolean {
  return (
    'condition' in client &&
    'environmentalObservationRecord' in client &&
    'athleteDayJournal' in client &&
    'athleteActivityStatus' in client &&
    'journalHabitExperiment' in client
  );
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && isPrismaClientCurrent(cached)) {
    return cached;
  }

  if (cached) {
    void cached.$disconnect().catch(() => {});
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
