'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { frFR } from '@clerk/localizations';
import { useEffect, useState } from 'react';
import { ENTRY_PATH } from '@sharpit/app/lib/onboarding/entry-path';
import { clerkAppearance } from '@sharpit/app/lib/theme/clerk-appearance';

/**
 * After sign-in/up with no `redirect_url`: `/start`, which sends the athlete straight to
 * consent, onboarding or Today — never through the teaser — `/welcome` is
 * signed-out only (the proxy enforces it). A `redirect_url` Clerk carries (e.g. back into
 * the Garmin handoff) still wins: fallbacks, not force redirects. sharpit.app is the
 * primary domain — no `isSatellite` / `domain` here.
 *
 * Wrapper client : en dev, autorise l'origine courante (IP LAN, localhost…)
 * pour les redirects Clerk — sans config dashboard ni RegExp.
 */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const [allowedRedirectOrigins, setAllowedRedirectOrigins] = useState<string[] | undefined>(
    undefined,
  );

  // If DEV_BYPASS_CLERK is enabled or publishable key is missing in dev, skip Clerk entirely
  const hasPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (
    process.env.NODE_ENV === 'development' &&
    (process.env.NEXT_PUBLIC_DEV_BYPASS_CLERK === 'true' || !hasPublishableKey)
  ) {
    return <>{children}</>;
  }

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }
    const port = window.location.port || '3000';
    const origins = new Set<string>([`http://localhost:${port}`, window.location.origin]);
    setAllowedRedirectOrigins([...origins]);
  }, []);

  return (
    <ClerkProvider
      afterSignOutUrl="/welcome"
      allowedRedirectOrigins={allowedRedirectOrigins}
      appearance={clerkAppearance}
      localization={frFR}
      signInFallbackRedirectUrl={ENTRY_PATH}
      signInUrl="/sign-in"
      signUpFallbackRedirectUrl={ENTRY_PATH}
      signUpUrl="/sign-up"
    >
      {children}
    </ClerkProvider>
  );
}
