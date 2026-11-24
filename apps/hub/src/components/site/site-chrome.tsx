import Link from 'next/link';
import {
  LANDING_FOOTER_LINKS,
  LANDING_HERO,
  LANDING_SOCIAL_LINKS,
} from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { Brand } from '@/components/landing/landing-parts';

const PILL =
  'focus-visible:ring-ring inline-flex h-11 items-center rounded-full px-5 text-base font-medium transition-transform duration-200 ease-out hover:scale-[1.04] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none';

/** The one conversion control: a short ink capsule, or a white one on the ink ground. */
export function DownloadPill({
  onNight = false,
  className,
}: {
  onNight?: boolean;
  className?: string;
}) {
  return (
    <a
      href={LANDING_HERO.download.href}
      className={cn(
        PILL,
        onNight
          ? 'bg-(--landing-night-foreground) text-(--landing-night)'
          : 'bg-primary text-primary-foreground focus-visible:ring-offset-2',
        className,
      )}
    >
      {LANDING_HERO.download.label}
    </a>
  );
}

const NAV_LINK =
  'text-muted-foreground hover:text-foreground text-base font-medium transition-colors duration-150';

/**
 * The site's navigation on every public page: a white capsule floating over the page. The
 * landing lets its hero run under it; every other page asks for the `spacer` that keeps its
 * first line clear of the capsule.
 */
export function SiteNav({ spacer = false }: { spacer?: boolean }) {
  return (
    <>
      <header
        className="pointer-events-none fixed inset-x-0 top-4 z-30 flex justify-center px-3 print:hidden"
        data-nav
      >
        <div className="bg-card/85 float-lift pointer-events-auto flex h-14 items-center gap-4 rounded-[32px] pr-2 pl-5 backdrop-blur-xl">
          <Link aria-label="SharpIt, accueil" className="mr-2" href="/">
            <Brand />
          </Link>
          <Link className={cn(NAV_LINK, 'hidden sm:block')} href="/aide">
            Aide
          </Link>
          <a className={NAV_LINK} href={LANDING_HERO.signIn.href}>
            {LANDING_HERO.signIn.label}
          </a>
          <DownloadPill className="h-10 px-4" />
        </div>
      </header>
      {spacer ? <div className="h-24 print:hidden" aria-hidden /> : null}
    </>
  );
}

const FOOTER_LINK =
  'text-lg font-medium underline-offset-4 transition-opacity duration-150 hover:opacity-60';

/** The site's footer on every public page: the brand, the pages, the social accounts. */
export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start justify-between gap-10 px-5 py-20 sm:px-8 sm:py-32 print:hidden">
      <Brand />
      <nav aria-label="Pied de page" className="flex flex-wrap gap-x-16 gap-y-8">
        <ul className="space-y-4">
          {LANDING_FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link className={FOOTER_LINK} href={link.href}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="space-y-4">
          {LANDING_SOCIAL_LINKS.map((link) => (
            <li key={link.href}>
              <a className={FOOTER_LINK} href={link.href} rel="noopener noreferrer" target="_blank">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
