import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConnectOAuthOutcome } from '@/components/integrations/connect-oauth-outcome';
import { parseNativeOAuthHandoffStatus } from '@sharpit/app/lib/integrations/oauth-native-handoff';

export const metadata: Metadata = { title: 'Strava · SharpIt' };

type PageProps = {
  searchParams: Promise<{ strava?: string }>;
};

async function Outcome({ searchParams }: PageProps) {
  const { strava } = await searchParams;
  return <ConnectOAuthOutcome provider="strava" status={parseNativeOAuthHandoffStatus(strava)} />;
}

/** Associated Domains URL that ends the iOS ASWebAuthenticationSession (`?strava=<status>`). */
export default function ConnectStravaCallbackPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <Outcome searchParams={searchParams} />
    </Suspense>
  );
}
