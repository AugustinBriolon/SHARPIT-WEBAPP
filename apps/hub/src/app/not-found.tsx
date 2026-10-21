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
            href="/"
            className="rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Retour à l’accueil
          </Link>
          <Link
            href="/aide"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Centre d’aide
          </Link>
        </div>
      </main>
      <footer className={CONTAINER}>
        <p className="text-xs text-muted-foreground">© 2026 SharpIt</p>
      </footer>
    </div>
  );
}
