import Link from 'next/link';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import {
  LANDING_CLOSING,
  LANDING_FOOTER_LINKS,
  LANDING_HERO,
  LANDING_SOCIAL_LINKS,
} from '@sharpit/app/lib/landing/landing-copy';
import { cn } from '@sharpit/app/lib/utils';
import { Brand, CONTAINER, HEADING } from './landing-parts';
import {
  DownloadButton,
  Faq,
  Hero,
  Morning,
  Repair,
  SourcesAndPricing,
  Trust,
} from './landing-sections';

const FOOTER_LINK = 'underline-offset-4 hover:underline';

function Header() {
  return (
    <header className="bg-background border-border sticky top-0 z-20 border-b">
      <div className={cn(CONTAINER, 'flex h-16 items-center justify-between')}>
        <Brand />
        <div className="flex items-center gap-1.5">
          <a
            className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            href={LANDING_HERO.signIn.href}
          >
            {LANDING_HERO.signIn.label}
          </a>
          <a className={buttonVariants({ size: 'sm' })} href={LANDING_HERO.download.href}>
            {LANDING_HERO.download.label}
          </a>
        </div>
      </div>
    </header>
  );
}

function Closing() {
  return (
    <section aria-labelledby="closing-title" className="border-border border-t py-20 sm:py-28">
      <div className={CONTAINER}>
        <h2
          className={cn(HEADING, 'max-w-3xl text-3xl leading-tight text-balance sm:text-5xl')}
          id="closing-title"
        >
          {LANDING_CLOSING.title}
        </h2>
        <div className="mt-9">
          <DownloadButton />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-border border-t">
      <div
        className={cn(
          CONTAINER,
          'text-muted-foreground flex flex-wrap items-center justify-between gap-4 py-8 text-sm',
        )}
      >
        <Brand />
        <nav aria-label="Pied de page" className="flex flex-wrap gap-x-5 gap-y-2">
          {LANDING_FOOTER_LINKS.map((link) => (
            <Link key={link.href} className={FOOTER_LINK} href={link.href}>
              {link.label}
            </Link>
          ))}
          {LANDING_SOCIAL_LINKS.map((link) => (
            <a
              key={link.href}
              className={FOOTER_LINK}
              href={link.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

/**
 * sharpit.app, the public landing: the promise, a morning, a repaired week, why to trust it,
 * what it plugs into and costs, then the questions. Server-rendered markup with no script of
 * its own; `docs/design/DESIGN_RULES.md` is the law it is checked against.
 */
export function Landing() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Morning />
        <Repair />
        <Trust />
        <SourcesAndPricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
