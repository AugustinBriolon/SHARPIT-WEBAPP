import Link from 'next/link';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { CONTAINER, HEADING, LEAD } from '@/components/landing/landing-parts';
import { SiteFooter, SiteNav } from '@/components/site/site-chrome';

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <SiteNav spacer />
      <main className={`${CONTAINER} flex flex-1 flex-col justify-center py-16`}>
        <h1 className={`${HEADING} text-4xl sm:text-6xl`}>Page introuvable</h1>
        <p className={`${LEAD} mt-6 max-w-md`}>
          La page que tu cherches n’existe pas ou a été déplacée.
        </p>
        <div className="mt-8 flex items-center gap-6">
          <Link className={buttonVariants({ size: 'lg' })} href="/">
            Retour à l’accueil
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            href="/aide"
          >
            Centre d’aide
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
