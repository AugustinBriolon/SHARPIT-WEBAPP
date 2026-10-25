import { allCompetitorSlugs } from '@/content/seo-competitors';
import { allGuideSlugs } from '@/content/seo-guides';
import { allRoundupSlugs } from '@/content/seo-roundups';
import {
  allArticles,
  articleHref,
  categoryHref,
  HELP_CATEGORIES,
  HELP_ROOT,
} from '@/help/help-center';

export const SITE_ORIGIN = 'https://sharpit.app';

/** Every public, indexable page of the apex, as a path. The sitemap is this list and nothing else. */
export function publicPaths(): string[] {
  return [
    '/',
    HELP_ROOT,
    ...HELP_CATEGORIES.map(categoryHref),
    ...allArticles().map(({ category, article }) => articleHref(category, article)),
    ...allGuideSlugs().map((slug) => `/guides/${slug}`),
    ...allRoundupSlugs().map((slug) => `/comparatifs/${slug}`),
    ...allCompetitorSlugs().map((slug) => `/alternatives/${slug}`),
    '/privacy',
    '/privacy/en',
    '/terms',
  ];
}
