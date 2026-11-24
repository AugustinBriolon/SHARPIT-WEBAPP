import { SiteFooter, SiteNav } from '@/components/site/site-chrome';

export function LegalPageShell({
  title,
  version,
  lastUpdatedLabel,
  lang = 'fr',
  children,
}: {
  title: string;
  version: string;
  lastUpdatedLabel: string;
  lang?: 'fr' | 'en';
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <SiteNav spacer />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-page-title">{title}</h1>
          <p className="text-muted-foreground text-sm">
            {lang === 'en'
              ? `Version ${version} · updated ${lastUpdatedLabel}`
              : `Version ${version} · mise à jour ${lastUpdatedLabel}`}
          </p>
          {lang === 'fr' ? (
            <p className="text-muted-foreground text-xs">
              {/* Source: content/legal/*_PAGE_FR_V0.md — Privacy Santé drafts */}
              Brouillon V0 — source content/legal (Privacy Santé).
            </p>
          ) : null}
        </header>
        <div>{children}</div>
      </div>
      <SiteFooter />
    </div>
  );
}
