import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CarnetPage, InApp, Quiet } from '@/components/carnet/carnet-parts';
import { readViewer } from '@/components/carnet/carnet-read';

/**
 * The reading pages need an account that is ready to read: consents given and the first week
 * set up (ADR-072). An account that still owes one is told where to go instead of meeting
 * empty pages: the consents are given in Compte, which stays open, the onboarding in the app.
 */
export default async function ReadingLayout({ children }: { children: ReactNode }) {
  const viewer = await readViewer();
  if (viewer?.deleted) {
    redirect('/sign-in');
  }
  if (viewer && (viewer.consentWallHref || viewer.needsOnboarding)) {
    return (
      <CarnetPage
        kicker="Bienvenue"
        lead="Ton carnet se remplit dès que ton compte est prêt."
        title="Encore une étape"
      >
        <div className="max-w-xl space-y-4">
          <Quiet>
            {viewer.consentWallHref
              ? 'Les conditions de SharpIt ont changé : accepte-les pour que ton carnet reprenne.'
              : 'Ton compte attend ses premières réponses : tes sports, ton objectif et tes sources.'}
          </Quiet>
          {viewer.consentWallHref ? (
            <Link
              className="text-sm font-medium underline underline-offset-4"
              href="/compte/donnees"
            >
              Accepter les conditions ici
            </Link>
          ) : (
            <InApp>La mise en route</InApp>
          )}
        </div>
      </CarnetPage>
    );
  }
  return children;
}
