import Link from 'next/link';
import {
  LANDING_FOOTER_LINKS,
  LANDING_HERO,
  LANDING_SOCIAL_LINKS,
} from '@sharpit/app/lib/landing/landing-copy';
import { LandingMotion } from './landing-motion';
import { Brand } from './landing-parts';
import {
  Closing,
  DownloadPill,
  Faq,
  Hero,
  Model,
  Morning,
  Plan,
  Pricing,
  Sources,
  Statement,
} from './landing-sections';

const FOOTER_LINK =
  'text-lg font-medium underline-offset-4 transition-opacity duration-150 hover:opacity-60';

/** A white capsule floating over the page, there from the hero to the footer. */
function FloatingNav() {
  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-4 z-30 flex justify-center px-3"
      data-nav
    >
      <div className="bg-card/85 float-lift pointer-events-auto flex h-14 items-center gap-4 rounded-[32px] pr-2 pl-5 backdrop-blur-xl">
        <Link className="mr-2" href="/">
          <Brand />
        </Link>
        <a
          className="text-muted-foreground hover:text-foreground hidden text-base font-medium transition-colors duration-150 sm:block"
          href={LANDING_HERO.demo.href}
        >
          {LANDING_HERO.demo.label}
        </a>
        <a
          className="text-muted-foreground hover:text-foreground text-base font-medium transition-colors duration-150"
          href={LANDING_HERO.signIn.href}
        >
          {LANDING_HERO.signIn.label}
        </a>
        <DownloadPill className="h-10 px-4" />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start justify-between gap-10 px-5 py-20 sm:px-8 sm:py-32">
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

/**
 * sharpit.app's home (ADR-148): the composition and motion of `docs/design/LANDING_STYLE.md` in
 * the app's own tokens. A field of ink holds the promise and the app, then the product is shown
 * as widgets on white cards. Markup is complete without script; motion lives in
 * `LandingMotion`, the one interaction in `MorningWidget`.
 */
export function Landing() {
  return (
    <LandingMotion>
      <FloatingNav />
      <main>
        <Hero />
        <Sources />
        <Statement />
        <Morning />
        <Plan />
        <Model />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </LandingMotion>
  );
}
