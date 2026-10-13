import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConnectOAuthOutcome } from '@/components/integrations/connect-oauth-outcome';
import { parseNativeOAuthHandoffStatus } from '@sharpit/app/lib/integrations/oauth-native-handoff';

export const metadata: Metadata = { title: 'Google Agenda · SharpIt' };

type PageProps = {
  searchParams: Promise<{ google?: string }>;
};

async function Outcome({ searchParams }: PageProps) {
  const { google } = await searchParams;
  return <ConnectOAuthOutcome provider="google" status={parseNativeOAuthHandoffStatus(google)} />;
}

/** Associated Domains URL that ends the iOS ASWebAuthenticationSession (`?google=<status>`). */
export default function ConnectGoogleCallbackPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <Outcome searchParams={searchParams} />
    </Suspense>
  );
}
