import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { publicPaths } from './site';

describe('the apex sitemap', () => {
  it('lists each public page once, on the apex, without the handoff or sign-in', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain('https://sharpit.app');
    expect(urls).toContain('https://sharpit.app/aide/sources/quelles-sources');
    expect(urls.every((url) => url.startsWith('https://sharpit.app'))).toBe(true);
    expect(urls.some((url) => /\/(connect|sign-in|sign-up)/.test(url))).toBe(false);
    expect(publicPaths().every((path) => path.startsWith('/'))).toBe(true);
  });

  it('points robots.txt at the sitemap and keeps crawlers out of the handoff', () => {
    const { rules, sitemap: location } = robots();
    expect(location).toBe('https://sharpit.app/sitemap.xml');
    expect(JSON.stringify(rules)).toContain('/connect/');
  });
});
