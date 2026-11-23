import type { Metadata, Viewport } from 'next';
import { AppClerkProvider } from '@sharpit/ui/providers/clerk-provider';
import { ThemeProvider } from '@sharpit/ui/providers/theme-provider';
import { Toaster } from '@/components/ui/toast';
import { THEME_DARK_COLOR, THEME_LIGHT_COLOR } from '@sharpit/app/lib/theme/theme';
import { RootLayoutHead } from '@/app/root-layout-head';
import { CarnetMotion } from '@/components/carnet/carnet-motion';
import { RegisterServiceWorker } from '@/components/carnet/register-service-worker';
import { cn } from '@sharpit/app/lib/utils';
import { FONT_VARIABLES } from '@sharpit/ui/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'SharpIt',
  description: 'Ton carnet d’entraînement : ta saison, tes séances et ton corps, à relire.',
  applicationName: 'SharpIt',
  // Opens without Safari's chrome once added to an iPhone's or iPad's home screen.
  appleWebApp: { capable: true, title: 'SharpIt', statusBarStyle: 'default' },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
      // Follows the viewer's theme itself (an embedded prefers-color-scheme rule).
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    // apple-icon.tsx generates 180/167/152 via generateImageMetadata —
    // leave `apple` unset so Next.js wires all three <link> tags.
  },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppClerkProvider>
      {/* The theme is resolved entirely on the client: THEME_INIT_SCRIPT below
          sets `dark` / colorScheme / theme-color before paint, and ThemeProvider
          re-reads the stored preference on mount. Reading the theme cookie here
          instead would make the root layout runtime-dependent, which costs every
          route its prerendered shell. */}
      <html
        className={cn(...FONT_VARIABLES, 'bg-background h-full antialiased')}
        lang="fr"
        suppressHydrationWarning
      >
        <head>
          <RootLayoutHead />
        </head>
        <body className="bg-background text-foreground min-h-full font-sans">
          <ThemeProvider>
            <CarnetMotion>{children}</CarnetMotion>
          </ThemeProvider>
          <Toaster />
          {/* Installable, with a page to show offline and no cached reading (ADR-145). */}
          <RegisterServiceWorker />
        </body>
      </html>
    </AppClerkProvider>
  );
}
