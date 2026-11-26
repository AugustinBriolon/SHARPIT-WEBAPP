import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { cn } from '@sharpit/app/lib/utils';
import { CONTAINER, HEADING, LEAD, RULE } from '@/components/landing/landing-parts';
import { DirectAnswerBox } from '@/components/seo/direct-answer-box';
import {
  SeoBreadcrumbs,
  SeoCtaBanner,
  SeoFaqSection,
  SeoFooter,
  SeoHeader,
} from '@/components/seo/seo-shell';
import { allCompetitorSlugs, findCompetitor } from '@/content/seo-competitors';

type Props = { params: Promise<{ competitor: string }> };

export function generateStaticParams() {
  return allCompetitorSlugs().map((competitor) => ({ competitor }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitor: slug } = await params;
  const competitor = findCompetitor(slug);
  if (!competitor) {
    return {};
  }

  return {
    title: `${competitor.metaTitle} · SharpIt`,
    description: competitor.metaDescription,
    alternates: { canonical: `https://sharpit.app/alternatives/${competitor.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${competitor.metaTitle} · SharpIt`,
      description: competitor.metaDescription,
      url: `https://sharpit.app/alternatives/${competitor.slug}`,
      siteName: 'SharpIt',
      type: 'article',
    },
  };
}

export default async function AlternativePage({ params }: Props) {
  const { competitor: slug } = await params;
  const competitor = findCompetitor(slug);

  if (!competitor) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'SharpIt',
        applicationCategory: 'HealthAndFitnessApplication',
        operatingSystem: 'iOS, Web',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
        },
        description:
          'Coach d’endurance adaptatif : plan qui se répare et décision chaque matin basée sur le sommeil et la VFC.',
      },
      {
        '@type': 'FAQPage',
        mainEntity: competitor.faq.map((item) => ({
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
          trail={[
            { label: 'Accueil', href: '/' },
            { label: 'Alternatives' },
            { label: competitor.name },
          ]}
        />

        <header className="max-w-3xl">
          <p className="text-muted-foreground text-xs font-medium">Comparatif & Alternative</p>
          <h1 className={cn(HEADING, 'mt-3 text-3xl leading-tight sm:text-5xl')}>
            {competitor.h1}
          </h1>
          <p className={cn(LEAD, 'mt-4 text-base sm:text-xl')}>{competitor.tagline}</p>
        </header>

        {/* 100-word direct answer (GEO / AI citation optimized) */}
        <DirectAnswerBox
          directAnswer={competitor.directAnswer}
          sharpitPunchline={competitor.sharpitSolution}
        />

        {/* Where the competitor shines; its limits stay out until a source backs them. */}
        <section
          aria-labelledby="competitor-pros"
          className="border-border/60 bg-muted/10 my-12 max-w-3xl rounded-2xl border p-6"
        >
          <div className="text-foreground flex items-center gap-2 text-sm font-medium">
            <Check className="text-foreground size-4" aria-hidden />
            <h2 id="competitor-pros">Ce que {competitor.name} fait de bien</h2>
          </div>
          <ul className="text-muted-foreground mt-4 space-y-3 text-sm">
            {competitor.honestCompetitorStrengths.map((pro) => (
              <li key={pro} className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500/60" />
                <span>{pro}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Detailed feature matrix */}
        <section aria-labelledby="comparison-matrix" className="my-16">
          <h2 className={cn(HEADING, 'text-2xl sm:text-3xl')} id="comparison-matrix">
            Tableau comparatif : SharpIt vs {competitor.name}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            SharpIt et {competitor.name}, fonction par fonction.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className={cn(RULE, 'text-muted-foreground border-b')}>
                  <th className="py-3 pr-4 font-medium">Fonctionnalité</th>
                  <th className="text-foreground px-4 py-3 font-medium">SharpIt</th>
                  <th className="px-4 py-3 font-medium">{competitor.name}</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {competitor.comparisonRows.map((row) => (
                  <tr key={row.feature} className="hover:bg-muted/10 transition-colors">
                    <td className="text-foreground py-4 pr-4 font-medium">{row.feature}</td>
                    <td className="text-foreground px-4 py-4">
                      <div className="flex items-center gap-2">
                        {row.winner === 'sharpit' ? (
                          <span className="text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                            <Check className="size-3" />
                          </span>
                        ) : null}
                        <span>{row.sharpit}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-4 py-4">
                      <div className="flex items-center gap-2">
                        {row.winner === 'competitor' ? (
                          <span className="text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                            <Check className="size-3" />
                          </span>
                        ) : null}
                        <span>{row.competitor}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ Section */}
        <SeoFaqSection items={competitor.faq} />

        {/* CTA Banner */}
        <SeoCtaBanner
          subtitle="Teste la démo sans inscription : une semaine réelle, recalée sous tes yeux."
          title="Ton plan, recalé chaque fois que la semaine déraille."
        />
      </main>

      <SeoFooter />
    </div>
  );
}
