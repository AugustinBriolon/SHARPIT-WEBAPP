import { Suspense } from 'react';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';
import { Skeleton } from '@sharpit/ui/components/ui/skeleton';

/**
 * The page an account is opened from: the brand, then one card holding a title and the form,
 * and at most one quiet line under it. Nothing else competes with signing in.
 */
export function AuthShell({
  children,
  title = 'Connexion',
  subtitle,
  footer,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** One quiet line under the card: the way in without an account. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="auth-surface landing-canvas flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <p className="mb-8 flex items-center justify-center gap-2.5">
          <BrandMark className="size-6" />
          <span className="text-card-title">SharpIt</span>
        </p>
        <main className="bg-card border-border rounded-3xl border p-6 sm:p-8">
          <h1 className="font-heading text-2xl font-medium tracking-tight text-balance">{title}</h1>
          {subtitle ? (
            <p className="text-auth-muted mt-2 text-sm leading-relaxed text-pretty">{subtitle}</p>
          ) : null}
          {/* Clerk's widget reads the URL, so it can't be prerendered. The chrome around it
              can: the boundary sits here so the page paints at once. */}
          <div className="mt-6">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>{children}</Suspense>
          </div>
        </main>
        {footer ? <p className="text-auth-muted mt-6 text-center text-sm">{footer}</p> : null}
      </div>
    </div>
  );
}
