import { cacheLife } from 'next/cache';
import type { Metadata } from 'next';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ConnectLink } from '@sharpit/ui/components/settings/integrations/connect-link';
import { IntegrationLogo } from '@sharpit/ui/components/settings/integrations/logos';
import type { IntegrationId } from '@sharpit/app/lib/integrations/shared/client-sync';
import type {
  IntegrationProviderView,
  IntegrationsHubPayload,
} from '@sharpit/app/lib/web/payloads';
import {
  CarnetPage,
  CarnetSection,
  InApp,
  Quiet,
  ReadingList,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { CARNET_FRESHNESS, readSection } from '@/components/carnet/carnet-read';

export const metadata: Metadata = { title: 'Sources de données' };

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

/** Where `api.`'s OAuth callbacks send the athlete back (through `/settings/integrations`). */
const RETURN_TO = '/settings/integrations';

type Source = {
  id: IntegrationId;
  key: 'withings' | 'google' | 'strava' | 'garmin' | 'renpho' | 'myfitnesspal';
  name: string;
  /** Linked here: its OAuth runs in the browser. Otherwise it is linked in the app. */
  connectPath?: string;
};

const SOURCES: Source[] = [
  { id: 'garmin', key: 'garmin', name: 'Garmin' },
  { id: 'withings', key: 'withings', name: 'Withings', connectPath: '/api/withings/connect' },
  { id: 'google', key: 'google', name: 'Google Agenda', connectPath: '/api/google/connect' },
  { id: 'strava', key: 'strava', name: 'Strava', connectPath: '/api/strava/connect' },
];

const OUTCOMES: Record<string, string> = {
  connected: 'est relié.',
  denied: "a refusé l'accès.",
  invalid_state: "n'a pas pu être relié : la session a expiré, réessaie.",
  no_refresh: "n'a pas donné d'accès durable : réessaie en autorisant l'accès hors ligne.",
  error: "n'a pas pu être relié pour le moment.",
};

function sinceLine(view: IntegrationProviderView): string {
  const synced = view.account?.lastSyncAt;
  if (view.needsReconnect) {
    return "L'accès a expiré : relie-le à nouveau.";
  }
  return synced
    ? `Relié · dernière synchro le ${format(new Date(synced), 'd MMMM', { locale: fr })}`
    : 'Relié';
}

/**
 * Linking a source whose OAuth runs in the browser stays on the web (ADR-072). The OAuth
 * callbacks of `api.` still answer `/settings/integrations?…`, which redirects here with its
 * query, so the outcome of the link shows at the top. The query (URL data) is read outside
 * the private cache and handed in as plain values: read inside, it would keep the route's App
 * Shell from ever settling.
 */
export default async function CarnetSourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <SourcesReading params={await searchParams} />;
}

async function SourcesReading({ params }: { params: Record<string, string | undefined> }) {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const hub = await readSection<IntegrationsHubPayload>('/api/web/integrations-hub', true);
  const outcomes = SOURCES.flatMap((source) => {
    const outcome = params[source.key];
    return outcome && OUTCOMES[outcome] ? [`${source.name} ${OUTCOMES[outcome]}`] : [];
  });

  return (
    <CarnetPage
      back={{ href: '/compte', label: 'Compte' }}
      kicker="Compte"
      lead="Ce que tu relies ici alimente aussi l'app."
      title="Sources de données"
    >
      {outcomes.length > 0 ? (
        <p className="bg-highlight rounded-md px-4 py-3 text-sm" role="status">
          {outcomes.join(' ')}
        </p>
      ) : null}
      <CarnetSection label="Sources" title="Tes appareils et tes comptes">
        {hub ? (
          <ReadingList>
            {SOURCES.map((source) => {
              const view = hub[source.key];
              const linked = Boolean(view.account) && !view.needsReconnect;
              const canLink =
                source.connectPath && (!('configured' in view) || view.configured !== false);
              return (
                <li key={source.key} className="flex items-center justify-between gap-6 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IntegrationLogo className="size-8 shrink-0" id={source.id} />
                    <div className="min-w-0">
                      <p className="font-medium">{source.name}</p>
                      <p className="text-muted-foreground mt-0.5 text-sm">
                        {view.account || view.needsReconnect ? sinceLine(view) : 'Pas relié'}
                      </p>
                    </div>
                  </div>
                  {!linked && canLink ? (
                    <ConnectLink
                      className="bg-foreground text-background shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-transform active:scale-[0.97] motion-reduce:active:scale-100"
                      href={`${source.connectPath}?returnTo=${RETURN_TO}`}
                    >
                      {view.needsReconnect ? 'Relier à nouveau' : 'Relier'}
                    </ConnectLink>
                  ) : !linked ? (
                    <span className="text-muted-foreground shrink-0 text-xs">Dans l&apos;app</span>
                  ) : null}
                </li>
              );
            })}
            <li className="flex items-center gap-3 py-3">
              <IntegrationLogo className="size-8 shrink-0" id="apple-health" />
              <div className="min-w-0">
                <p className="font-medium">Apple Santé</p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {hub.appleHealth.linkedAt ? 'Relié depuis ton iPhone' : 'Pas relié'}
                </p>
              </div>
            </li>
          </ReadingList>
        ) : (
          <Unreadable what="L'état de tes sources" />
        )}
        <Quiet>Garmin et Apple Santé se relient depuis ton iPhone.</Quiet>
        <InApp>Délier une source, choisir la source principale de chaque donnée</InApp>
      </CarnetSection>
    </CarnetPage>
  );
}
