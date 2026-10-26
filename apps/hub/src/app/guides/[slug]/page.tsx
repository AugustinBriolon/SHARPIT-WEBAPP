import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, ShieldCheck, ListOrdered } from 'lucide-react';
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
import { allGuideSlugs, findGuide } from '@/content/seo-guides';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return allGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) {
    return {};
  }

  return {
    title: `${guide.metaTitle} · Guide SharpIt`,
    description: guide.metaDescription,
    alternates: { canonical: `https://sharpit.app/guides/${guide.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${guide.metaTitle} · Guide SharpIt`,
      description: guide.metaDescription,
      url: `https://sharpit.app/guides/${guide.slug}`,
      siteName: 'SharpIt',
      type: 'article',
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = findGuide(slug);

  if (!guide) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide.h1,
        description: guide.metaDescription,
        author: {
          '@type': 'Organization',
          name: 'SharpIt',
          url: 'https://sharpit.app',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: guide.faq.map((item) => ({
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
            { label: 'Guides d’entraînement' },
            { label: guide.h1 },
          ]}
        />

        <header className="max-w-3xl">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Guide pratique d’endurance
          </p>
          <h1 className={cn(HEADING, 'mt-3 text-3xl leading-tight sm:text-5xl')}>{guide.h1}</h1>
          <p className={cn(LEAD, 'mt-4 text-base sm:text-xl')}>{guide.tagline}</p>
        </header>

        {/* 100-word direct answer (GEO / AI citation optimized) */}
        <DirectAnswerBox directAnswer={guide.directAnswer} sharpitPunchline={guide.calloutText} />

        {/* Step by step practical action plan */}
        <section aria-labelledby="steps-heading" className="my-16 max-w-3xl">
          <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <ListOrdered className="text-highlight size-4" aria-hidden />
            <span>Plan d’action recommandé</span>
          </div>
          <h2
            className={cn(HEADING, 'text-foreground mt-2 text-2xl sm:text-3xl')}
            id="steps-heading"
          >
            Comment procéder étape par étape
          </h2>

          <div className="mt-8 space-y-8">
            {guide.steps.map((step, idx) => (
              <div
                key={step.title}
                className="border-border/60 bg-muted/10 relative rounded-2xl border p-6 sm:p-8"
              >
                <div className="flex items-center gap-3">
                  <span className="bg-highlight text-highlight-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                    {idx + 1}
                  </span>
                  <h3 className="text-foreground text-lg font-semibold">{step.title}</h3>
                </div>
                <p className="text-muted-foreground mt-4 text-base leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Golden rules box */}
        <section
          aria-labelledby="rules-heading"
          className="border-border/60 bg-muted/20 my-16 max-w-3xl rounded-2xl border p-6 sm:p-8"
        >
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-5 text-emerald-500" aria-hidden />
            <h2 id="rules-heading">Les règles physiologiques indispensables</h2>
          </div>
          <ul className="text-muted-foreground mt-6 space-y-3 text-sm sm:text-base">
            {guide.goldenRules.map((rule) => (
              <li key={rule} className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-500" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ Section */}
        <SeoFaqSection items={guide.faq} />

        {/* CTA Banner */}
        <SeoCtaBanner
          subtitle="Découvrez comment SharpIt répare votre planning d’entraînement en 1 clic grâce à 15 garde-fous stricts."
          title="Ne laissez plus jamais un imprévu gâcher votre préparation."
        />
      </main>

      <SeoFooter />
    </div>
  );
}
