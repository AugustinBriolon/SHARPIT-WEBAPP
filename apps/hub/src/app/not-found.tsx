import Link from 'next/link';
import { CONTAINER, HEADING, LEAD, Brand } from '@/components/landing/landing-parts';

export default function NotFound() {
  return (
    <div className="landing-canvas flex min-h-screen flex-col justify-between py-10">
      <header className={CONTAINER}>
        <Link href="/">
          <Brand />
        </Link>
      </header>
      <main className={CONTAINER}>
        <p className="text-label text-muted-foreground">404</p>
        <h1 className={`${HEADING} mt-4 text-4xl sm:text-6xl`}>Page introuvable</h1>
        <p className={`${LEAD} mt-6 max-w-md`}>
          La page que vous recherchez n’existe pas ou a été déplacée.
        </p>
        <div className="mt-8 flex items-center gap-6">
          <Link
            className="bg-foreground text-background rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            href="/"
          >
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
      <footer className={CONTAINER}>
        <p className="text-muted-foreground text-xs">© 2026 SharpIt</p>
      </footer>
    </div>
  );
}
