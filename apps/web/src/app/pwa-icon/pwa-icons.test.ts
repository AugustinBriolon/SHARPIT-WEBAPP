import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { PWA_ICONS, pwaIconOf } from './pwa-icons';

describe('installed app', () => {
  it('opens in its own window at the carnet', () => {
    const app = manifest();
    expect(app.display).toBe('standalone');
    expect(app.start_url).toBe('/');
    expect(app.scope).toBe('/');
  });

  it('offers a 192, a 512 and a maskable icon, each one the route can draw', () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const icon of icons) {
      expect(pwaIconOf(icon.src.replace('/pwa-icon/', ''))).toBeDefined();
    }
  });

  it('names every icon as a png, which the proxy serves without a session', () => {
    for (const icon of PWA_ICONS) {
      expect(icon.file).toMatch(/\.png$/);
    }
    expect(pwaIconOf('nope.png')).toBeUndefined();
  });
});
