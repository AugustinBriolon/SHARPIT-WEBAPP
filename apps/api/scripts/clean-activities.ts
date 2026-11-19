/**
 * Nettoyage des activités + reset des curseurs de synchro.
 *
 * Supprime toutes les activités (les métriques run/bike/swim, les streams et les
 * séries de musculation suivent en cascade), détache les séances planifiées
 * réalisées, purge les records de performance, puis remet à zéro les curseurs de
 * synchro Strava/Garmin afin qu'un prochain import récupère TOUT l'historique.
 *
 * Usage :
 *   yarn db:clean:activities          # demande confirmation interactive
 *   yarn db:clean:activities --yes    # sans confirmation (CI / script)
 *   yarn db:clean:activities --health # supprime aussi les données santé Garmin
 *   yarn db:clean:activities --streams # invalide uniquement le cache streams (carte/courbes)
 */
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function confirm(question: string): Promise<boolean> {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    return true;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [oui/non] `);
  rl.close();
  return ['oui', 'o', 'yes', 'y'].includes(answer.trim().toLowerCase());
}

async function main() {
  const streamsOnly = process.argv.includes('--streams');
  const withHealth = process.argv.includes('--health');

  if (streamsOnly) {
    const streamCount = await prisma.activityStream.count();
    console.log(`Caches streams en base : ${streamCount}`);
    const ok = await confirm('Invalider tous les caches streams (carte, courbes) ?');
    if (!ok) {
      console.log('Annulé.');
      return;
    }
    const removed = await prisma.activityStream.deleteMany();
    console.log(`Caches streams supprimés : ${removed.count}`);
    console.log('\nRouvre une séance ou lance le backfill Strava/Garmin pour re-télécharger.');
    return;
  }

  const [activityCount, healthCount] = await Promise.all([
    prisma.activity.count(),
    prisma.dailyHealth.count(),
  ]);

  console.log(`Activités en base : ${activityCount}`);
  if (withHealth) {
    console.log(`Jours de santé en base : ${healthCount}`);
  }

  const ok = await confirm(
    withHealth
      ? 'Supprimer TOUTES les activités ET les données santé ?'
      : 'Supprimer TOUTES les activités ?',
  );
  if (!ok) {
    console.log('Annulé.');
    return;
  }

  // Détache les séances planifiées réalisées (l'activité liée va disparaître).
  const unlinked = await prisma.plannedSession.updateMany({
    where: { activityId: { not: null } },
    data: { activityId: null, completed: false, analysis: undefined, analyzedAt: null },
  });
  console.log(`Séances planifiées détachées : ${unlinked.count}`);

  // Records de performance (référencent des activités par id, sans FK).
  const records = await prisma.performanceRecord.deleteMany();
  console.log(`Records supprimés : ${records.count}`);

  // Activités : cascade vers RunMetrics / BikeMetrics / SwimMetrics / StrengthSet / ActivityStream.
  const deleted = await prisma.activity.deleteMany();
  console.log(`Activités supprimées : ${deleted.count}`);

  if (withHealth) {
    const health = await prisma.dailyHealth.deleteMany();
    console.log(`Jours de santé supprimés : ${health.count}`);
  }

  // Reset des curseurs : force un ré-import complet à la prochaine synchro.
  const strava = await prisma.stravaAccount.updateMany({
    data: { lastSyncAt: null },
  });
  const garmin = await prisma.garminAccount.updateMany({
    data: { lastActivitySyncAt: null, ...(withHealth ? { lastSyncAt: null } : {}) },
  });
  console.log(`Curseurs réinitialisés : Strava=${strava.count}, Garmin=${garmin.count}`);

  console.log(
    '\nTerminé. Lance « Importer tout l’historique » dans Réglages → Garmin pour ré-importer.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
