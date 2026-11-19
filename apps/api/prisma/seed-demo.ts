import { createScriptPrismaClient } from '@sharpit/db/adapter';
import { seedDemoAthlete } from '@sharpit/server/lib/demo/seed-demo-data';

const prisma = createScriptPrismaClient();

seedDemoAthlete(prisma)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
