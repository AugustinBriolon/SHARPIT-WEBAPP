import Link from 'next/link';
import { ArrowUpRight, ChevronRight, HelpCircle } from 'lucide-react';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { cn } from '@sharpit/app/lib/utils';
import { HEADING, LEAD } from '@/components/landing/landing-parts';
import { SiteNav } from '@/components/site/site-chrome';

export type SeoCrumb = { label: string; href?: string };

export function SeoHeader() {
  return <SiteNav spacer />;
}

export function SeoBreadcrumbs({ trail }: { trail: readonly SeoCrumb[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="my-6">
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
        {trail.map((crumb, i) => (
          <li key={crumb.label} className="flex items-center gap-1.5">
            {i > 0 ? <ChevronRight className="size-3.5 opacity-40" aria-hidden /> : null}
            {crumb.href ? (
              <Link className="hover:text-foreground transition-colors" href={crumb.href}>
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground font-medium">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SeoFaqSection({
  items,
}: {
  items: readonly { question: string; answer: string }[];
}) {
  if (!items.length) {
    return null;
  }

  return (
    <section aria-labelledby="faq-heading" className="border-border/60 my-16 border-t pt-12">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <HelpCircle className="text-highlight size-4" aria-hidden />
        <span>Foire aux questions</span>
      </div>
      <h2 className={cn(HEADING, 'text-foreground mt-2 text-2xl sm:text-3xl')} id="faq-heading">
        Questions fréquentes
      </h2>

      <div className="divide-border/60 mt-8 divide-y">
        {items.map((item) => (
          <div key={item.question} className="py-6 first:pt-0">
            <h3 className="text-foreground text-base font-medium sm:text-lg">{item.question}</h3>
            <p className="text-muted-foreground mt-2 text-base leading-relaxed">{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SeoCtaBanner({
  title = 'Prêt à courir avec un plan qui s’adapte vraiment ?',
  subtitle = 'Testez SharpIt gratuitement : synchronisez votre montre Garmin et laissez le coach relire votre forme chaque matin.',
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <section
      aria-label="Appel à l'action"
      className="landing-night my-16 overflow-hidden rounded-3xl p-8 text-center sm:p-12"
    >
      <h2 className={cn(HEADING, 'text-foreground mx-auto max-w-2xl text-2xl sm:text-4xl')}>
        {title}
      </h2>
      <p className={cn(LEAD, 'mx-auto mt-4 max-w-xl text-sm sm:text-base')}>{subtitle}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <a
          className={buttonVariants({ size: 'lg', className: 'px-6 font-medium shadow-md' })}
          href="https://web.sharpit.app/demo"
        >
          <span>Essayer la démo sans inscription</span>
          <ArrowUpRight className="ml-1.5 size-4" aria-hidden />
        </a>
      </div>
    </section>
  );
}

export { SiteFooter as SeoFooter } from '@/components/site/site-chrome';
