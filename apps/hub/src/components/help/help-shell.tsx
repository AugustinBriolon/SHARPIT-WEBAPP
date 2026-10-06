import Link from 'next/link';
import {
  Activity,
  CalendarDays,
  Cable,
  ChevronRight,
  Compass,
  Gauge,
  HeartPulse,
  LifeBuoy,
  MessageCircle,
  ShieldCheck,
  UserRound,
  UtensilsCrossed,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { Brand, CONTAINER, HEADING, LEAD, RULE } from '@/components/landing/landing-parts';
import { HELP_ROOT } from '@/help/help-center';
import type { HelpIcon } from '@/help/types';
import { HelpSearch } from './help-search';

const ICONS: Record<HelpIcon, LucideIcon> = {
  start: Compass,
  method: Workflow,
  scores: Gauge,
  plan: CalendarDays,
  coach: MessageCircle,
  activity: Activity,
  health: HeartPulse,
  nutrition: UtensilsCrossed,
  sources: Cable,
  privacy: ShieldCheck,
  account: UserRound,
  contact: LifeBuoy,
};

export function CategoryIcon({ icon, className }: { icon: HelpIcon; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

/** The bar every help page shares: the brand, the way home, and the search off the home page. */
export function HelpHeader({ withSearch = true }: { withSearch?: boolean }) {
  return (
    <header className="bg-background/75 sticky top-0 z-20 backdrop-blur-md">
      <div className={cn(CONTAINER, 'flex h-16 items-center justify-between gap-4')}>
        <div className="flex items-center gap-3">
          <Link aria-label="SharpIt, accueil" href="/">
            <Brand />
          </Link>
          <span className="bg-foreground/20 h-5 w-px" aria-hidden />
          <Link
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            href={HELP_ROOT}
          >
            Aide
          </Link>
        </div>
        {withSearch ? (
          <div className="flex min-w-0 flex-1 justify-end">
            <HelpSearch />
          </div>
        ) : null}
      </div>
    </header>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  return (
    <nav aria-label="Fil d’Ariane" data-help-fade>
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
        {trail.map((crumb, i) => (
          <li key={crumb.label} className="flex items-center gap-1.5">
            {i > 0 ? <ChevronRight className="size-3.5 opacity-50" aria-hidden /> : null}
            {crumb.href ? (
              <Link className="hover:text-foreground transition-colors" href={crumb.href}>
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A title that rises line by line on arrival (`HelpMotion`). */
export function RisingTitle({
  lines,
  className,
}: {
  lines: readonly string[];
  className?: string;
}) {
  return (
    <h1 className={cn(HEADING, className)}>
      {lines.map((line) => (
        <span key={line} className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
          <span className="block" data-help-line>
            {line}
          </span>
        </span>
      ))}
    </h1>
  );
}

/** Where an answer was not enough: the way to write to the team. */
export function HelpContact() {
  return (
    <section aria-label="Nous contacter" className="landing-night">
      <div
        className={cn(CONTAINER, 'grid gap-8 py-20 sm:grid-cols-[1fr_auto] sm:items-end sm:py-28')}
      >
        <div data-help-reveal>
          <h2 className={cn(HEADING, 'max-w-2xl text-[clamp(2rem,4.5vw,3.5rem)] leading-[0.98]')}>
            Pas trouvé ta réponse ?
          </h2>
          <p className={cn(LEAD, 'mt-5 max-w-xl')}>
            Écris-nous depuis l’app, dans Paramètres › Donner un avis. Ton message arrive à l’équipe
            avec la version de ton app, et on lit tout.
          </p>
        </div>
        <Link
          className="bg-highlight text-highlight-foreground inline-flex h-11 items-center gap-2 justify-self-start rounded-full px-5 text-sm font-medium transition-transform hover:-translate-y-0.5"
          href={`${HELP_ROOT}/contact`}
          data-help-reveal
        >
          <LifeBuoy className="size-4" aria-hidden />
          Nous contacter
        </Link>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  { label: 'Accueil', href: '/' },
  { label: 'Aide', href: HELP_ROOT },
  { label: 'Carnet web', href: 'https://web.sharpit.app' },
  { label: 'Confidentialité', href: '/privacy' },
  { label: 'Conditions', href: '/terms' },
] as const;

export function HelpFooter() {
  return (
    <footer className="landing-night">
      <div
        className={cn(
          CONTAINER,
          RULE,
          'text-muted-foreground flex flex-wrap items-center justify-between gap-4 border-t py-8 text-sm',
        )}
      >
        <Brand />
        <nav className="flex flex-wrap gap-5">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} className="underline-offset-4 hover:underline" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
