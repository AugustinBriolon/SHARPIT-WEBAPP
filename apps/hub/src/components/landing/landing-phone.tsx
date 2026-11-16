import Image from 'next/image';
import resume from './app-resume.png';

/**
 * The app's Résumé on an iPhone: a capture of the real screen, rendered by the iOS app's own
 * views on its sample data (`TodayView` over `FixtureTodayClient`), so it is the product and not
 * a drawing of it. Re-capture it when Résumé changes (`-SharpitScreenDemo today` on a Debug
 * build, cropped under the status bar so no account's picture shows); it shows example figures,
 * said in its label.
 */
export function Phone() {
  return (
    <figure
      aria-label="L’écran Résumé de l’app SharpIt, sur des données d’exemple"
      className="relative mx-auto w-[300px] shrink-0 rounded-[3.1rem] border-[10px] border-[oklch(0.2_0.04_139)] bg-[oklch(0.2_0.04_139)] dark:ring-1 dark:ring-white/15"
      data-phone
    >
      <Image
        alt="Résumé : le verdict du jour « Reste en endurance facile », le sommeil et la récupération en anneaux, la séance prévue."
        className="block h-auto w-full rounded-[2.5rem]"
        sizes="300px"
        src={resume}
        priority
      />
    </figure>
  );
}
