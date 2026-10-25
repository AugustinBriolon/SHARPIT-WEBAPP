import type { MetadataRoute } from 'next';
import { publicPaths, SITE_ORIGIN } from '@/seo/site';

/** No `lastModified`: no page here carries a real edit date, and a made-up one is worse than none. */
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths().map((path) => ({
    url: path === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`,
  }));
}
