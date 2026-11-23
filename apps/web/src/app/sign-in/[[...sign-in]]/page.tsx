import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { AuthShell } from '@sharpit/ui/components/auth/auth-shell';
import { authAppearance } from '@sharpit/app/lib/theme/clerk-appearance';
import { isDevClerkBypass } from '@sharpit/app/lib/dev/dev-auth';

export default function SignInPage() {
  if (isDevClerkBypass()) {
    redirect('/');
  }
  return (
    <AuthShell
      footer={
        <>
          Pas encore de compte ?{' '}
          <a className="text-foreground underline underline-offset-4" href="/demo">
            Essayer la démo
          </a>
        </>
      }
    >
      <SignIn appearance={authAppearance} />
    </AuthShell>
  );
}
