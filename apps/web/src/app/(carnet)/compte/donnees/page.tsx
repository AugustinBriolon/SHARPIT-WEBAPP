import { cacheLife } from 'next/cache';
import type { Metadata } from 'next';
import { CarnetPage, Quiet } from '@/components/carnet/carnet-parts';
import { CARNET_FRESHNESS, readSection, readViewer } from '@/components/carnet/carnet-read';
import { Reading, Skel } from '@/components/carnet/carnet-reading';
import { PrivacySettingsPanel } from '@/components/privacy/privacy-settings-panel';
import type { ConsentSnapshot } from '@sharpit/app/lib/privacy/consent-serialize';
import { CONTROLLER_EMAIL } from '@sharpit/app/lib/privacy/constants';

export const metadata: Metadata = { title: 'Confidentialité et données' };

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

type DataRights = { isDemo: boolean; consents: ConsentSnapshot | null };

async function readDataRights(): Promise<DataRights> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const [viewer, body] = await Promise.all([
    readViewer(),
    readSection<{ consents: ConsentSnapshot }>('/api/privacy/consent'),
  ]);
  return { isDemo: Boolean(viewer?.isDemo), consents: body?.consents ?? null };
}

/** The athlete's data rights stay reachable from a browser (ADR-072): consents, export, deletion. */
export default function CarnetDataRightsPage() {
  return (
    <CarnetPage
      back={{ href: '/compte', label: 'Compte' }}
      kicker="Compte"
      lead={`Tes consentements, l'export de tes données et la suppression du compte. Contact : ${CONTROLLER_EMAIL}.`}
      title="Confidentialité et données"
    >
      <div className="max-w-2xl">
        <Reading fallback={<Skel className="block h-48 w-full" />} read={readDataRights}>
          {({ isDemo, consents }) =>
            isDemo ? (
              <Quiet>
                Les consentements et la suppression concernent un compte réel : ils sont désactivés
                sur la démo partagée.
              </Quiet>
            ) : (
              <PrivacySettingsPanel initial={consents} />
            )
          }
        </Reading>
      </div>
    </CarnetPage>
  );
}
