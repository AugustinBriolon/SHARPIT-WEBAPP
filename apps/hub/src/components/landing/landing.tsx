import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { LANDING_HERO } from '@sharpit/app/lib/landing/landing-copy';
import { Hero } from './landing-hero';
import { Method } from './landing-method';
import { Morning } from './landing-morning';
import { LandingMotion } from './landing-motion';
import { Brand } from './landing-parts';
import { Product } from './landing-product';
import { Story } from './landing-story';
import { Trust } from './landing-trust';

/**
 * sharpit.app, the public landing: the promise, the problem, the method, a morning, the
 * guardrails and the honesty that make it trustworthy, then the app. Markup only; motion lives
 * in `LandingMotion`, and every section reads complete without it.
 */
export function Landing() {
  return (
    <LandingMotion>
      <header className="bg-background/80 fixed inset-x-0 top-0 z-10 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <a
            className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            href={LANDING_HERO.signIn.href}
          >
            {LANDING_HERO.signIn.label}
          </a>
        </div>
        <span
          className="bg-foreground absolute inset-x-0 bottom-0 h-px origin-left"
          style={{ transform: 'scaleX(0)' }}
          aria-hidden
          data-scroll-progress
        />
      </header>
      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <Hero />
        <Story />
        <Method />
        <Morning />
        <Trust />
        <Product />
      </main>
    </LandingMotion>
  );
}
