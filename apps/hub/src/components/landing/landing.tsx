import { SiteFooter, SiteNav } from '@/components/site/site-chrome';
import { LandingMotion } from './landing-motion';
import {
  Closing,
  Faq,
  Hero,
  Model,
  Morning,
  Plan,
  Pricing,
  Sources,
  Statement,
} from './landing-sections';

/**
 * sharpit.app's home (ADR-148): the composition and motion of `docs/design/LANDING_STYLE.md` in
 * the app's own tokens. A field of ink holds the promise and the app, then the product is shown
 * as widgets on white cards. Markup is complete without script; motion lives in
 * `LandingMotion`, the one interaction in `MorningWidget`.
 */
export function Landing() {
  return (
    <LandingMotion>
      <SiteNav />
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
      <SiteFooter />
    </LandingMotion>
  );
}
