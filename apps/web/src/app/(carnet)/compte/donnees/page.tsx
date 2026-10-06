import type { Metadata } from 'next';
import Link from 'next/link';
import { CarnetPage, Quiet } from '@/components/carnet/carnet-parts';
import { readSection, readViewer } from '@/components/carnet/carnet-read';
import { PrivacySettingsPanel } from '@/components/privacy/privacy-settings-panel';
import type { ConsentSnapshot } from '@sharpit/app/lib/privacy/consent-serialize';
import { CONTROLLER_EMAIL } from '@sharpit/app/lib/privacy/constants';

export const metadata: Metadata = { title: 'Confidentialité et données' };

// Reads the signed-in athlete on every request (ADR-072).
export const instant = false;

/** The athlete's data rights stay reachable from a browser (ADR-072): consents, export, deletion. */
export default async function CarnetDataRightsPage() {
  const [viewer, body] = await Promise.all([
    readViewer(),
    readSection<{ consents: ConsentSnapshot }>('/api/privacy/consent'),
  ]);

  return (
    <CarnetPage
      aside={
        <Link className="text-muted-foreground hover:text-foreground text-sm" href="/compte">
          ← Compte
        </Link>
      }
      kicker="Compte"
      lead={`Tes consentements, l'export de tes données et la suppression du compte. Contact : ${CONTROLLER_EMAIL}.`}
      title="Confidentialité et données"
    >
      <div className="max-w-2xl">
        {viewer?.isDemo ? (
          <Quiet>
            Les consentements et la suppression concernent un compte réel : ils sont désactivés sur
            la démo partagée.
          </Quiet>
        ) : (
          <PrivacySettingsPanel initial={body?.consents ?? null} />
        )}
      </div>
    </CarnetPage>
  );
}
