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
    <AuthShell
      subtitle="L'app te pose quelques questions, relie ta montre et prépare ta première semaine. Le site sert ensuite à relire ta saison sur grand écran."
      title="Ton compte se crée dans l'app iPhone"
      footer={
        <a className="text-foreground underline underline-offset-4" href="/demo">
          Voir la démo
        </a>
      }
    >
      <Link className={cn(buttonVariants({ size: 'lg' }), 'w-full')} href="/sign-in">
        J&apos;ai déjà un compte
      </Link>
    </AuthShell>
  );
}
