/**
 * What athletes wrote through « Donner un avis », newest first. Read-only; athlete ids only.
 *
 *   DATABASE_URL='<prod>' yarn tsx scripts/reports/feedback.ts [count]
 */
import { prisma } from '@sharpit/db/client';

const DEFAULT_COUNT = 50;

async function main() {
  const count = Number(process.argv[2]) || DEFAULT_COUNT;
  const notes = await prisma.athleteFeedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: count,
    select: { createdAt: true, athleteId: true, context: true, appVersion: true, message: true },
  });
  for (const note of notes) {
    const where = [note.context, note.appVersion].filter(Boolean).join(' · ');
    console.log(
      `${note.createdAt.toISOString()}  ${note.athleteId}  ${where}\n  ${note.message}\n`,
    );
  }
  console.log(`${notes.length} note(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
