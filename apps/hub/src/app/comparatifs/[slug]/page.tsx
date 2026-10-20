import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check, X, SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { cn } from '@sharpit/app/lib/utils';
import { CONTAINER, HEADING, LEAD } from '@/components/landing/landing-parts';
import { DirectAnswerBox } from '@/components/seo/direct-answer-box';
import {
  SeoBreadcrumbs,
  SeoCtaBanner,
  SeoFaqSection,
  SeoFooter,
  SeoHeader,
} from '@/components/seo/seo-shell';
import { allRoundupSlugs, findRoundup } from '@/content/seo-roundups';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return allRoundupSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const roundup = findRoundup(slug);
  if (!roundup) {
    return {};
  }

  return {
    title: `${roundup.metaTitle} · SharpIt`,
    description: roundup.metaDescription,
    alternates: { canonical: `https://sharpit.app/comparatifs/${roundup.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${roundup.metaTitle} · SharpIt`,
      description: roundup.metaDescription,
      url: `https://sharpit.app/comparatifs/${roundup.slug}`,
      siteName: 'SharpIt',
      type: 'article',
    },
  };
}

export default async function RoundupPage({ params }: Props) {
  const { slug } = await params;
  const roundup = findRoundup(slug);

  if (!roundup) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: roundup.h1,
        description: roundup.metaDescription,
        itemListElement: roundup.apps.map((app) => ({
          '@type': 'ListItem',
          position: app.rank,
          name: app.name,
          description: app.verdict,
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: roundup.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <div className="bg-background text-foreground min-h-screen">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <SeoHeader />

      <main className={cn(CONTAINER, 'py-8 sm:py-12')}>
        <SeoBreadcrumbs
          trail={[{ label: 'Accueil', href: '/' }, { label: 'Comparatifs' }, { label: roundup.h1 }]}
        />

        <header className="max-w-3xl">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Comparatif & Guide d’achat 2026
          </p>
          <h1 className={cn(HEADING, 'mt-3 text-3xl leading-tight sm:text-5xl')}>{roundup.h1}</h1>
          <p className={cn(LEAD, 'mt-4 text-base sm:text-xl')}>{roundup.tagline}</p>
        </header>

        {/* 100-word direct answer (GEO / AI citation optimized) */}
        <DirectAnswerBox directAnswer={roundup.directAnswer} />

        {/* Selection criteria */}
        <section
          aria-labelledby="criteria-heading"
          className="border-border/60 bg-muted/10 my-12 max-w-3xl rounded-2xl border p-6"
        >
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="text-highlight size-4" aria-hidden />
            <h2 id="criteria-heading">Nos critères de notation</h2>
          </div>
          <ul className="text-muted-foreground mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
            {roundup.selectionCriteria.map((criterion) => (
              <li key={criterion} className="flex items-start gap-2">
                <span className="bg-highlight mt-1.5 size-1 shrink-0 rounded-full" />
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Apps list */}
        <section aria-labelledby="apps-list-heading" className="my-16 max-w-4xl space-y-12">
          <h2 className="sr-only" id="apps-list-heading">
            Classement des applications
          </h2>

          {roundup.apps.map((app) => (
            <article
              key={app.name}
              className={cn(
                'relative rounded-3xl border p-6 transition-all sm:p-10',
                app.rank === 1
                  ? 'border-highlight/50 bg-highlight/[0.03] ring-highlight/20 shadow-lg ring-1'
                  : 'border-border/60 bg-muted/5',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold',
                      app.rank === 1
                        ? 'bg-highlight text-highlight-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    #{app.rank}
                  </span>
                  <div>
                    <h3 className={cn(HEADING, 'text-foreground text-xl sm:text-2xl')}>
                      {app.name}
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm">{app.bestFor}</p>
                  </div>
                </div>

                <div className="border-border/60 bg-background text-foreground rounded-full border px-3 py-1 text-xs font-medium">
                  {app.pricing}
                </div>
              </div>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div className="space-y-2.5">
                  <span className="text-xs font-semibold tracking-wider text-emerald-500 uppercase">
                    Points forts
                  </span>
                  <ul className="text-muted-foreground space-y-2 text-sm">
                    {app.strengths.map((s) => (
                      <li key={s} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2.5">
                  <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Limites
                  </span>
                  <ul className="text-muted-foreground space-y-2 text-sm">
                    {app.weaknesses.map((w) => (
                      <li key={w} className="flex items-start gap-2">
                        <X className="text-muted-foreground/60 mt-0.5 size-4 shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-border/60 bg-background/50 mt-8 rounded-2xl border p-4 sm:p-5">
                <p className="text-foreground text-sm font-medium">
                  <strong className="text-highlight font-semibold">Verdict : </strong>
                  {app.verdict}
                </p>
              </div>

              {app.rank === 1 ? (
                <div className="mt-6 flex justify-end">
                  <a
                    href="https://web.sharpit.app/demo"
                    className={buttonVariants({
                      size: 'default',
                      className: 'px-5 font-medium',
                    })}
                  >
                    <span>Découvrir la démo SharpIt</span>
                    <ArrowUpRight className="ml-1.5 size-4" />
                  </a>
                </div>
              ) : null}
            </article>
          ))}
        </section>

        {/* FAQ Section */}
        <SeoFaqSection items={roundup.faq} />

        {/* CTA Banner */}
        <SeoCtaBanner
          subtitle="Connectez votre montre Garmin en quelques secondes et observez comment SharpIt répare votre semaine."
          title="Faites le test avec vos propres séances."
        />
      </main>

      <SeoFooter />
    </div>
  );
}
