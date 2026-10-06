import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { CONTAINER, DATA, HEADING, LEAD, RULE, pad } from '@/components/landing/landing-parts';
import { HelpMotion } from '@/components/help/help-motion';
import { HelpSearch } from '@/components/help/help-search';
import {
  CategoryIcon,
  HelpContact,
  HelpFooter,
  HelpHeader,
  RisingTitle,
} from '@/components/help/help-shell';
import {
  HELP_CATEGORIES,
  allArticles,
  articleCountLabel,
  articleHref,
  categoryHref,
  popularArticles,
} from '@/help/help-center';

export const metadata: Metadata = {
  title: 'Aide · SharpIt',
  description:
    'Le centre d’aide de SharpIt : la méthode, tes scores, ton plan, tes sources connectées, tes données et SharpIt Pro.',
  alternates: { canonical: 'https://sharpit.app/aide' },
  robots: { index: true, follow: true },
};

function Categories() {
  return (
    <section aria-label="Rubriques" className={cn(CONTAINER, 'py-20 sm:py-28')}>
      <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-help-reveal>
        Rubriques
      </p>
      <ul className="mt-10 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {HELP_CATEGORIES.map((category, i) => (
          <li key={category.slug} data-help-reveal>
            <Link
              className={cn(RULE, 'group flex h-full flex-col gap-3 border-b py-8')}
              href={categoryHref(category)}
            >
              <span className="flex items-center justify-between">
                <span className="bg-muted grid size-10 place-items-center rounded-full">
                  <CategoryIcon className="size-5" icon={category.icon} />
                </span>
                <span className={cn(DATA, 'text-muted-foreground text-xs')}>{pad(i + 1)}</span>
              </span>
              <span
                className={cn(
                  HEADING,
                  'mt-3 text-2xl transition-transform duration-500 ease-out group-hover:translate-x-1',
                )}
              >
                {category.title}
              </span>
              <span className="text-muted-foreground text-sm leading-relaxed text-pretty">
                {category.description}
              </span>
              <span
                className={cn(
                  DATA,
                  'text-muted-foreground mt-auto flex items-center gap-2 pt-2 text-xs',
                )}
              >
                {articleCountLabel(category.articles.length)}
                <ArrowRight
                  className="size-3.5 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:opacity-100"
                  aria-hidden
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Popular() {
  return (
    <section aria-label="Questions fréquentes" className="landing-canvas">
      <div className={cn(CONTAINER, 'py-20 sm:py-28')}>
        <p className={cn(RULE, 'text-label text-muted-foreground border-t pt-4')} data-help-reveal>
          Questions fréquentes
        </p>
        <ul className={cn(RULE, 'mt-10 border-t')}>
          {popularArticles().map(({ category, article }) => (
            <li key={article.slug} data-help-reveal>
              <Link
                href={articleHref(category, article)}
                className={cn(
                  RULE,
                  'group grid gap-2 border-b py-6 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8',
                )}
              >
                <span>
                  <span
                    className={cn(
                      HEADING,
                      'block text-xl transition-transform duration-500 ease-out group-hover:translate-x-1 sm:text-2xl',
                    )}
                  >
                    {article.title}
                  </span>
                  <span className="text-muted-foreground mt-2 block max-w-3xl text-sm leading-relaxed text-pretty">
                    {article.summary}
                  </span>
                </span>
                <span className="text-label text-muted-foreground flex items-center gap-2">
                  {category.title}
                  <ArrowRight
                    className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-1"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** sharpit.app/aide: the search first, then the categories and the questions asked most. */
export default function HelpHomePage() {
  const articleCount = allArticles().length;
  return (
    <HelpMotion>
      <HelpHeader withSearch={false} />
      <main>
        <section aria-label="Centre d’aide" className="landing-canvas">
          <div className={cn(CONTAINER, 'pt-16 pb-20 sm:pt-24 sm:pb-28')}>
            <p className="text-label text-muted-foreground" data-help-fade>
              Centre d’aide
            </p>
            <RisingTitle
              className="mt-6 text-[clamp(2.6rem,6.4vw,5.6rem)] leading-[0.93]"
              lines={['Une question ?', 'Voici comment SharpIt marche.']}
            />
            <p className={cn(LEAD, 'mt-8 max-w-2xl')} data-help-fade>
              La méthode, tes scores, ton plan, tes sources et tes données. Chaque réponse décrit ce
              que fait l’app, rien de plus.
            </p>
            {/* Above the sections below: their entrance transforms would paint over the answers. */}
            <div className="relative z-10 mt-10" data-help-fade>
              <HelpSearch size="hero" />
            </div>
            <p className={cn(DATA, 'text-muted-foreground mt-6 text-xs')} data-help-fade>
              {articleCount} articles · {HELP_CATEGORIES.length} rubriques
            </p>
          </div>
        </section>
        <Categories />
        <Popular />
        <HelpContact />
      </main>
      <HelpFooter />
    </HelpMotion>
  );
}
