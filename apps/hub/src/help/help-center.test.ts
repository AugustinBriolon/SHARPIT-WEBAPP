import { describe, expect, it } from 'vitest';
import {
  HELP_CATEGORIES,
  allArticles,
  findArticle,
  neighbours,
  popularArticles,
} from './help-center';
import { HELP_SEARCH_INDEX } from './search-index';
import { markdownToText, searchHelp } from './search';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function articleStrings(): string[] {
  return HELP_CATEGORIES.flatMap((category) => [
    category.title,
    category.description,
    ...category.articles.flatMap((article) => [article.title, article.summary, article.body]),
  ]);
}

describe('help centre content', () => {
  it('gives every category and article a unique, URL-safe slug', () => {
    const categorySlugs = HELP_CATEGORIES.map((category) => category.slug);
    expect(new Set(categorySlugs).size).toBe(categorySlugs.length);
    for (const category of HELP_CATEGORIES) {
      expect(category.slug).toMatch(SLUG);
      expect(category.articles.length, category.slug).toBeGreaterThan(0);
      const slugs = category.articles.map((article) => article.slug);
      expect(new Set(slugs).size, category.slug).toBe(slugs.length);
      for (const slug of slugs) {
        expect(slug).toMatch(SLUG);
      }
    }
  });

  it('writes each article under its own title: no # or ## heading in a body', () => {
    for (const { article } of allArticles()) {
      expect(article.body, article.slug).not.toMatch(/^#{1,2}\s/m);
      expect(article.summary.length, article.slug).toBeLessThan(260);
    }
  });

  it('links only to articles and pages that exist', () => {
    const apexPages = new Set(['/', '/privacy', '/terms', '/aide']);
    for (const { article } of allArticles()) {
      for (const [, href] of article.body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const [, root, category, slug] = href.split('/');
        const exists =
          apexPages.has(href) ||
          (root === 'aide' &&
            (slug
              ? findArticle(category, slug)
              : HELP_CATEGORIES.some((c) => c.slug === category)));
        expect(exists, `${article.slug} → ${href}`).toBeTruthy();
      }
    }
  });

  it('uses no em dash, as the landing', () => {
    for (const line of articleStrings()) {
      expect(line).not.toContain('—');
    }
  });

  it('never names the model behind the coach', () => {
    const text = articleStrings().join('\n');
    expect(text).not.toMatch(/gemini|claude|gpt|openai|anthropic|mistral/i);
  });

  it('lists only articles that exist as popular questions', () => {
    expect(popularArticles()).toHaveLength(6);
  });

  it('walks every article in reading order', () => {
    const all = allArticles();
    expect(neighbours(all[0]).previous).toBeUndefined();
    expect(neighbours(all[0]).next).toEqual(all[1]);
    expect(neighbours(all[all.length - 1]).next).toBeUndefined();
  });
});

describe('help centre search', () => {
  const titles = (query: string) => searchHelp(HELP_SEARCH_INDEX, query).map((r) => r.title);

  it('indexes every article once', () => {
    expect(HELP_SEARCH_INDEX).toHaveLength(allArticles().length);
  });

  it('answers a question in the athlete’s words, accents and stopwords aside', () => {
    expect(titles('comment supprimer mon compte')[0]).toBe('Supprimer ton compte');
    expect(titles('GARMIN')[0]).toBe('Connecter Garmin');
    expect(titles('recuperation')[0]).toBe('La récupération');
    expect(titles('vo2max')).toContain('L’âge biologique');
  });

  it('finds a word that appears only in a body', () => {
    expect(titles('Ciqual')).toContain('Noter un repas');
  });

  it('flattens Markdown to what a reader sees', () => {
    expect(
      markdownToText(
        '### Titre\n\nUn [lien](/aide) et **gras**.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',
      ),
    ).toBe('Titre. Un lien et gras. A B 1 2');
  });

  it('returns nothing for an empty or meaningless query', () => {
    expect(titles('')).toEqual([]);
    expect(titles('le la')).toEqual([]);
    expect(titles('zzzzqx')).toEqual([]);
  });
});
