import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const profile = await prisma.athleteProfile.findFirst({
    select: { id: true, onboardingCompletedAt: true },
  });

  if (!profile) {
    console.log('Aucun profil trouvé.');
    return;
  }

  console.log(`Profil actuel: ${profile.id}`);
  console.log(`  onboardingCompletedAt: ${profile.onboardingCompletedAt}`);

  const updated = await prisma.athleteProfile.update({
    where: { id: profile.id },
    data: { onboardingCompletedAt: new Date() },
  });

  console.log(`\n✅ Profil restauré`);
  console.log(`  onboardingCompletedAt: ${updated.onboardingCompletedAt}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
