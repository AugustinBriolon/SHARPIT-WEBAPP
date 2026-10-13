import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConnectOAuthOutcome } from '@/components/integrations/connect-oauth-outcome';
import { parseNativeOAuthHandoffStatus } from '@sharpit/app/lib/integrations/oauth-native-handoff';

export const metadata: Metadata = { title: 'Withings · SharpIt' };

type PageProps = {
  searchParams: Promise<{ withings?: string }>;
};

async function Outcome({ searchParams }: PageProps) {
  const { withings } = await searchParams;
  return (
    <ConnectOAuthOutcome provider="withings" status={parseNativeOAuthHandoffStatus(withings)} />
  );
}

/** Associated Domains URL that ends the iOS ASWebAuthenticationSession (`?withings=<status>`). */
export default function ConnectWithingsCallbackPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <Outcome searchParams={searchParams} />
    </Suspense>
  );
}
