import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/seo/site';

/** Public pages open to every crawler; the native handoff and the sign-in are not content. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/connect/', '/sign-in', '/sign-up'] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
