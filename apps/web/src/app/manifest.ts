import type { MetadataRoute } from 'next';
import { THEME_LIGHT_COLOR } from '@sharpit/app/lib/theme/theme';
import { PWA_ICONS } from '@/app/pwa-icon/pwa-icons';

/**
 * The carnet installs as an app (ADR-145): its own window, its icon on the home screen. The
 * icons are drawn from the brand mark's one SVG, like the favicon and the Apple touch icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SharpIt',
    short_name: 'SharpIt',
    description: 'Ton carnet d’entraînement : ta saison, tes séances et ton corps, à relire.',
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_LIGHT_COLOR,
    theme_color: THEME_LIGHT_COLOR,
    icons: PWA_ICONS.map((icon) => ({
      src: `/pwa-icon/${icon.file}`,
      sizes: `${icon.size}x${icon.size}`,
      type: 'image/png',
      purpose: icon.maskable ? 'maskable' : 'any',
    })),
  };
}
