/**
 * The installed app's icons. A file name ends in `.png` so the proxy lets it through without a
 * session: the browser reads the manifest's icons before anyone signs in.
 */
export const PWA_ICONS = [
  { file: '192.png', size: 192, maskable: false },
  { file: '512.png', size: 512, maskable: false },
  // Full bleed: the platform cuts its own shape, the mark sits inside the safe zone.
  { file: 'maskable.png', size: 512, maskable: true },
] as const;

export type PwaIcon = (typeof PWA_ICONS)[number];

export function pwaIconOf(file: string): PwaIcon | undefined {
  return PWA_ICONS.find((icon) => icon.file === file);
}
