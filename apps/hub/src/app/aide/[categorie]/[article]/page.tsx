import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { CONTAINER, LEAD, RULE } from '@/components/landing/landing-parts';
import { HelpMarkdown } from '@/components/help/help-markdown';
import { HelpMotion } from '@/components/help/help-motion';
import {
  Breadcrumbs,
  HelpContact,
  HelpFooter,
  HelpHeader,
  RisingTitle,
} from '@/components/help/help-shell';
import {
  HELP_ROOT,
  allArticles,
  articleHref,
  categoryHref,
  findArticle,
  neighbours,
  type HelpArticleRef,
} from '@/help/help-center';

type Props = { params: Promise<{ categorie: string; article: string }> };

export function generateStaticParams() {
  return allArticles().map(({ category, article }) => ({
    categorie: category.slug,
    article: article.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorie, article } = await params;
  const ref = findArticle(categorie, article);
  if (!ref) {
    return {};
  }
  return {
    title: `${ref.article.title} · Aide SharpIt`,
    description: ref.article.summary,
    alternates: { canonical: `https://sharpit.app${articleHref(ref.category, ref.article)}` },
  };
}

/** The other articles of the category, the one read marked: the way sideways. */
function CategoryIndex({ category, article }: HelpArticleRef) {
  return (
    <nav aria-label={`Dans ${category.title}`} className="lg:sticky lg:top-28" data-help-fade>
      <Link
        className="text-label text-muted-foreground hover:text-foreground transition-colors"
        href={categoryHref(category)}
      >
        {category.title}
      </Link>
      <ul className={cn(RULE, 'mt-4 border-l')}>
        {category.articles.map((sibling) => {
          const current = sibling === article;
          return (
            <li key={sibling.slug}>
              <Link
                aria-current={current ? 'page' : undefined}
                href={articleHref(category, sibling)}
                className={cn(
                  '-ml-px block border-l py-2 ps-4 text-sm leading-snug transition-colors',
                  current
                    ? 'border-foreground text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {sibling.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Neighbour({ to, direction }: { to?: HelpArticleRef; direction: 'previous' | 'next' }) {
  if (!to) {
    return <span />;
  }
  const next = direction === 'next';
  const Arrow = next ? ArrowRight : ArrowLeft;
  return (
    <Link
      className={cn('group flex flex-col gap-2 py-6', next && 'items-end text-right')}
      href={articleHref(to.category, to.article)}
    >
      <span className="text-label text-muted-foreground flex items-center gap-2">
        {next ? null : (
          <Arrow className="size-3.5 transition-transform group-hover:-translate-x-1" aria-hidden />
        )}
        {next ? 'Suivant' : 'Précédent'}
        {next ? (
          <Arrow className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
        ) : null}
      </span>
      <span className="font-medium text-pretty">{to.article.title}</span>
    </Link>
  );
}

export default async function HelpArticlePage({ params }: Props) {
  const { categorie, article } = await params;
  const ref = findArticle(categorie, article);
  if (!ref) {
    notFound();
  }
  const { previous, next } = neighbours(ref);
  return (
    <HelpMotion key={articleHref(ref.category, ref.article)}>
      <HelpHeader />
      <main>
        <div
          className={cn(
            CONTAINER,
            'grid gap-14 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-20',
          )}
        >
          <article className="max-w-3xl">
            <Breadcrumbs
              trail={[
                { label: 'Aide', href: HELP_ROOT },
                { label: ref.category.title, href: categoryHref(ref.category) },
                { label: ref.article.title },
              ]}
            />
            <RisingTitle
              className="mt-10 text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[0.98]"
              lines={[ref.article.title]}
            />
            <p className={cn(LEAD, 'mt-6')} data-help-fade>
              {ref.article.summary}
            </p>
            <div className={cn(RULE, 'mt-10 border-t pt-10')} data-help-fade>
              <HelpMarkdown markdown={ref.article.body} />
            </div>
            <nav
              aria-label="Articles voisins"
              className={cn(RULE, 'mt-16 grid grid-cols-2 gap-6 border-t')}
              data-help-reveal
            >
              <Neighbour direction="previous" to={previous} />
              <Neighbour direction="next" to={next} />
            </nav>
          </article>
          <aside>
            <CategoryIndex {...ref} />
          </aside>
        </div>
        <HelpContact />
      </main>
      <HelpFooter />
    </HelpMotion>
  );
}
