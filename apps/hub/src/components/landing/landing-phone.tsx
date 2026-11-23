import Image from 'next/image';
import { BatteryFull, Signal, Wifi } from 'lucide-react';
import resume from './app-resume.png';

const RIM = 'bg-muted-foreground';
const BUTTON = `${RIM} absolute w-[3px] rounded-full`;

/**
 * The app's Résumé on an iPhone: a capture of the real screen, rendered by the iOS app's own
 * views on its sample data (`TodayView` over `FixtureTodayClient`), so it is the product and not
 * a drawing of it. Re-capture it when Résumé changes (`-SharpitScreenDemo today` on a Debug
 * build, cropped under the status bar so no account's picture shows, then padded with 100 px of
 * the header's colour on top, where the status bar is drawn here); it shows example figures,
 * said in its label.
 */
export function Phone() {
  return (
    <figure
      aria-label="L’écran Résumé de l’app SharpIt, sur des données d’exemple"
      className="relative mx-auto w-[300px] shrink-0"
      data-phone
    >
      {/* Action, volume up, volume down on the left; the side button on the right. */}
      <span className={`${BUTTON} top-[112px] -left-[2px] h-[26px]`} aria-hidden />
      <span className={`${BUTTON} top-[162px] -left-[2px] h-[48px]`} aria-hidden />
      <span className={`${BUTTON} top-[222px] -left-[2px] h-[48px]`} aria-hidden />
      <span className={`${BUTTON} top-[188px] -right-[2px] h-[76px]`} aria-hidden />
      <div className={`${RIM} relative rounded-[3.3rem] p-[3px]`}>
        <div className="relative overflow-hidden rounded-[3.1rem] bg-black p-[9px]">
          <Image
            alt="Résumé : le verdict du jour « Reste en endurance facile », le sommeil et la récupération en anneaux, la séance prévue."
            className="block h-auto w-full rounded-[2.55rem]"
            sizes="300px"
            src={resume}
            priority
          />
          <div
            className="absolute inset-x-[9px] top-[9px] flex h-[50px] items-center justify-between px-7 text-white"
            aria-hidden
          >
            <span className="text-[13px] font-medium tabular-nums">9:41</span>
            <span className="absolute top-[11px] left-1/2 h-[26px] w-[84px] -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1">
              <Signal className="size-3.5" />
              <Wifi className="size-3.5" />
              <BatteryFull className="size-[18px]" />
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
