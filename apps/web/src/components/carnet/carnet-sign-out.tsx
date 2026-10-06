'use client';

import { SignOutButton } from '@clerk/nextjs';

const clerkBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_BYPASS_CLERK === 'true' && process.env.NODE_ENV === 'development';

export function CarnetSignOut() {
  if (clerkBypassEnabled) {
    return null;
  }
  return (
    <SignOutButton>
      <button
        className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        type="button"
      >
        Se déconnecter
      </button>
    </SignOutButton>
  );
}
