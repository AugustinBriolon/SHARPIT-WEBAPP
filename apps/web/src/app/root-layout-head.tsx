import { THEME_INIT_SCRIPT } from '@sharpit/app/lib/theme/theme';

export function RootLayoutHead() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} id="theme-init" />
      <link crossOrigin="anonymous" href="https://basemaps.cartocdn.com" rel="preconnect" />
      <link href="https://basemaps.cartocdn.com" rel="dns-prefetch" />
    </>
  );
}
