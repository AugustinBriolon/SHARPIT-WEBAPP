import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { AuthShell } from '@sharpit/ui/components/auth/auth-shell';
import { authAppearance } from '@sharpit/app/lib/theme/clerk-appearance';
import { buttonVariants } from '@sharpit/ui/components/ui/button';
import { isDevClerkBypass } from '@sharpit/app/lib/dev/dev-auth';
import { cn } from '@sharpit/app/lib/utils';

function DemoCallout() {
  return (
    <div className="border-foreground/15 flex flex-col items-center gap-3 border-t border-b py-6 text-center">
      <p className="text-label text-auth-muted">Sans inscription</p>
      <p className="text-foreground text-sm leading-relaxed text-pretty">
        Explore SharpIt avec des données réalistes, en lecture seule.
      </p>
      <a
        href="/demo"
        className={cn(
          buttonVariants({ variant: 'accent', size: 'lg' }),
          'mt-1 w-full motion-safe:duration-150 motion-safe:ease-out motion-safe:active:not-disabled:scale-[0.96]',
        )}
      >
        Essayer la démo
      </a>
    </div>
  );
}

function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="bg-auth-divider h-px flex-1" />
      <span className="text-auth-muted text-xs tracking-wider uppercase">ou connecte-toi</span>
      <span className="bg-auth-divider h-px flex-1" />
    </div>
  );
}

export default function SignInPage() {
  if (isDevClerkBypass()) {
    redirect('/');
  }
  return (
    <AuthShell
      beforeForm={
        <div className="flex flex-col gap-5">
          <DemoCallout />
          <AuthDivider />
        </div>
      }
    >
      <SignIn appearance={authAppearance} />
    </AuthShell>
  );
}
