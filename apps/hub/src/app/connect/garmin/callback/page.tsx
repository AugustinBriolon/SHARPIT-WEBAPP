import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConnectOAuthOutcome } from '@/components/integrations/connect-oauth-outcome';
import { parseNativeOAuthHandoffStatus } from '@sharpit/app/lib/integrations/oauth-native-handoff';

export const metadata: Metadata = { title: 'Garmin · SharpIt' };

type PageProps = {
  searchParams: Promise<{ garmin?: string }>;
};

async function Outcome({ searchParams }: PageProps) {
  const { garmin } = await searchParams;
  return <ConnectOAuthOutcome provider="garmin" status={parseNativeOAuthHandoffStatus(garmin)} />;
}

/** Associated Domains URL that ends the iOS ASWebAuthenticationSession (`?garmin=<status>`). */
export default function ConnectGarminCallbackPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <Outcome searchParams={searchParams} />
    </Suspense>
  );
}
