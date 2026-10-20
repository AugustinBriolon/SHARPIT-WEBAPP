import type { Metadata, Viewport } from 'next';
import {
  THEME_DARK_COLOR,
  THEME_INIT_SCRIPT,
  THEME_LIGHT_COLOR,
} from '@sharpit/app/lib/theme/theme';
import { cn } from '@sharpit/app/lib/utils';
import { FONT_VARIABLES } from '@sharpit/ui/fonts';
import { AppClerkProvider } from '@sharpit/ui/providers/clerk-provider';
import { ThemeProvider } from '@sharpit/ui/providers/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'SharpIt',
  description: 'Intelligence sportive — entraînement, récupération, décision.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_LIGHT_COLOR },
    { media: '(prefers-color-scheme: dark)', color: THEME_DARK_COLOR },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** The apex shell: no app chrome — the handoff and legal pages stand alone. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppClerkProvider>
      <html
        className={cn(...FONT_VARIABLES, 'bg-background h-full antialiased')}
        lang="fr"
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} id="theme-init" />
        </head>
        <body className="bg-background text-foreground min-h-full font-sans">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </AppClerkProvider>
  );
}
