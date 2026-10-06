import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { CONTAINER, DATA, HEADING, LEAD, RULE, pad } from '@/components/landing/landing-parts';
import { HelpMotion } from '@/components/help/help-motion';
import {
  Breadcrumbs,
  CategoryIcon,
  HelpContact,
  HelpFooter,
  HelpHeader,
  RisingTitle,
} from '@/components/help/help-shell';
import {
  HELP_CATEGORIES,
  HELP_ROOT,
  articleCountLabel,
  articleHref,
  categoryHref,
  findCategory,
} from '@/help/help-center';

type Props = { params: Promise<{ categorie: string }> };

export function generateStaticParams() {
  return HELP_CATEGORIES.map((category) => ({ categorie: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = findCategory((await params).categorie);
  if (!category) {
    return {};
  }
  return {
    title: `${category.title} · Aide SharpIt`,
    description: category.description,
    alternates: { canonical: `https://sharpit.app${categoryHref(category)}` },
  };
}

export default async function HelpCategoryPage({ params }: Props) {
  const category = findCategory((await params).categorie);
  if (!category) {
    notFound();
  }
  return (
    <HelpMotion key={category.slug}>
      <HelpHeader />
      <main>
        <section aria-label={category.title} className="landing-canvas">
          <div className={cn(CONTAINER, 'pt-12 pb-16 sm:pt-16 sm:pb-20')}>
            <Breadcrumbs trail={[{ label: 'Aide', href: HELP_ROOT }, { label: category.title }]} />
            <span
              className="bg-card mt-10 grid size-12 place-items-center rounded-full shadow-sm"
              data-help-fade
            >
              <CategoryIcon className="size-6" icon={category.icon} />
            </span>
            <RisingTitle
              className="mt-6 text-[clamp(2.4rem,5.5vw,4.5rem)] leading-[0.95]"
              lines={[category.title]}
            />
            <p className={cn(LEAD, 'mt-6 max-w-2xl')} data-help-fade>
              {category.description}
            </p>
            <p className={cn(DATA, 'text-muted-foreground mt-6 text-xs')} data-help-fade>
              {articleCountLabel(category.articles.length)}
            </p>
          </div>
        </section>
        <section aria-label="Articles" className={cn(CONTAINER, 'py-16 sm:py-24')}>
          <ol className={cn(RULE, 'border-t')}>
            {category.articles.map((article, i) => (
              <li key={article.slug} data-help-reveal>
                <Link
                  href={articleHref(category, article)}
                  className={cn(
                    RULE,
                    'group grid gap-2 border-b py-7 sm:grid-cols-[4rem_1fr_auto] sm:items-baseline sm:gap-6',
                  )}
                >
                  <span className={cn(DATA, 'text-muted-foreground text-xs')}>{pad(i + 1)}</span>
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
                  <ArrowRight
                    className="text-muted-foreground hidden size-4 transition-transform duration-300 ease-out group-hover:translate-x-1 sm:block"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <HelpContact />
      </main>
      <HelpFooter />
    </HelpMotion>
  );
}
