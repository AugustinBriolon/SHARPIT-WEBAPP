import Link from 'next/link';
import { AuthShell } from '@sharpit/ui/components/auth/auth-shell';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { cn } from '@sharpit/app/lib/utils';

/**
 * An account is made in the iPhone app, where its first week is set up (ADR-072): the web
 * only reads. Kept as a page so the landing's and Clerk's « Créer un compte » links land
 * somewhere that says so.
 */
export default function SignUpPage() {
  return (
    <AuthShell subtitle="Ton compte se crée dans l'app SharpIt sur iPhone.">
      <div className="border-auth-panel rounded-analysis-lg flex flex-col gap-4 border bg-[var(--color-analysis-surface)] px-5 py-6 text-center">
        <p className="text-foreground text-sm leading-relaxed">
          L&apos;app te pose quelques questions, relie ta montre et prépare ta première semaine. Le
          site sert ensuite à relire ta saison sur grand écran.
        </p>
        <Link
          className={cn(buttonVariants({ variant: 'accent', size: 'lg' }), 'w-full')}
          href="/sign-in"
        >
          J&apos;ai déjà un compte
        </Link>
        <a className="text-auth-muted hover:text-foreground text-sm" href="/demo">
          Voir la démo
        </a>
      </div>
    </AuthShell>
  );
}
