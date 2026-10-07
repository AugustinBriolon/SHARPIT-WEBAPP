import { Suspense } from 'react';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { Skeleton } from '@sharpit/ui/components/ui/skeleton';

export function AuthShell({
  children,
  subtitle = "Connecte-toi pour accéder à ton espace d'entraînement.",
  beforeForm,
}: {
  children: React.ReactNode;
  subtitle?: string;
  /** Renders above the Clerk widget's Suspense boundary — e.g. a demo callout —
   * so it paints with the rest of the static chrome instead of waiting on Clerk. */
  beforeForm?: React.ReactNode;
}) {
  return (
    <div className="auth-surface landing-canvas relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12">
      <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="brand-tile size-14" aria-hidden>
            <BrandMark className="size-7" />
          </div>
          <div>
            <h1 className="font-heading text-[clamp(2rem,6vw,2.75rem)] leading-[0.98] font-semibold tracking-[-0.035em]">
              SharpIt
            </h1>
            <p className="text-auth-muted mt-3 max-w-sm text-base leading-relaxed text-pretty">
              {subtitle}
            </p>
          </div>
        </div>
        {beforeForm ? <div className="w-full">{beforeForm}</div> : null}
        {/* Clerk's widget reads the URL, so it can't be prerendered. The
            branding above it can — keep the boundary here so the auth page
            paints its chrome immediately. */}
        <div className="w-full">
          <Suspense fallback={<Skeleton className="h-[26rem] w-full" />}>{children}</Suspense>
        </div>
      </div>
    </div>
  );
}
