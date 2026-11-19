import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const profiles = await prisma.athleteProfile.findMany({
    select: { id: true, onboardingCompletedAt: true },
    take: 5,
  });

  console.log('Profiles trouvés:');
  profiles.forEach((p) => {
    console.log(`  - ${p.id}: onboardingCompletedAt = ${p.onboardingCompletedAt}`);
  });

  if (profiles.length === 0) {
    console.log('Aucun profil trouvé.');
    return;
  }

  const [profile] = profiles;
  const updated = await prisma.athleteProfile.update({
    where: { id: profile.id },
    data: { onboardingCompletedAt: null },
  });

  console.log(`\n✅ Profil réinitialisé: ${updated.id}`);
  console.log(`   onboardingCompletedAt: null`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
