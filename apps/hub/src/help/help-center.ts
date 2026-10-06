import { ACTIVITE } from './articles/activite';
import { COACH } from './articles/coach';
import { COMPTE } from './articles/compte';
import { CONFIDENTIALITE } from './articles/confidentialite';
import { CONTACT } from './articles/contact';
import { METHODE } from './articles/methode';
import { NUTRITION } from './articles/nutrition';
import { PLAN } from './articles/plan';
import { PREMIERS_PAS } from './articles/premiers-pas';
import { SANTE } from './articles/sante';
import { SCORES } from './articles/scores';
import { SOURCES } from './articles/sources';
import type { HelpArticle, HelpCategory } from './types';

/**
 * sharpit.app/aide, the help centre. Every answer describes what ships: the iPhone app
 * (SHARPIT-APP), the Core's models (`docs/models/*`), the ADRs and the landing's method. Change
 * an article with the code it describes.
 */
export const HELP_CATEGORIES: readonly HelpCategory[] = [
  PREMIERS_PAS,
  METHODE,
  SCORES,
  PLAN,
  COACH,
  ACTIVITE,
  SANTE,
  NUTRITION,
  SOURCES,
  CONFIDENTIALITE,
  COMPTE,
  CONTACT,
];

export const HELP_ROOT = '/aide';

/** The questions athletes ask first, shown on the help centre's home. */
const POPULAR: readonly [category: string, article: string][] = [
  ['sources', 'quelles-sources'],
  ['methode', 'verdict-du-jour'],
  ['plan', 'rattraper-une-seance'],
  ['scores', 'recuperation'],
  ['compte', 'sharpit-pro'],
  ['confidentialite', 'supprimer-ton-compte'],
];

export type HelpArticleRef = { category: HelpCategory; article: HelpArticle };

export function categoryHref(category: HelpCategory): string {
  return `${HELP_ROOT}/${category.slug}`;
}

export function articleHref(category: HelpCategory, article: HelpArticle): string {
  return `${HELP_ROOT}/${category.slug}/${article.slug}`;
}

export function findCategory(slug: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((category) => category.slug === slug);
}

export function findArticle(categorySlug: string, articleSlug: string): HelpArticleRef | undefined {
  const category = findCategory(categorySlug);
  const article = category?.articles.find((candidate) => candidate.slug === articleSlug);
  return category && article ? { category, article } : undefined;
}

export function allArticles(): HelpArticleRef[] {
  return HELP_CATEGORIES.flatMap((category) =>
    category.articles.map((article) => ({ category, article })),
  );
}

export function popularArticles(): HelpArticleRef[] {
  return POPULAR.flatMap(([category, article]) => findArticle(category, article) ?? []);
}

/** The articles before and after this one, across categories, in reading order. */
export function neighbours(ref: HelpArticleRef): {
  previous?: HelpArticleRef;
  next?: HelpArticleRef;
} {
  const all = allArticles();
  const index = all.findIndex((candidate) => candidate.article === ref.article);
  return { previous: all[index - 1], next: all[index + 1] };
}

export function articleCountLabel(count: number): string {
  return `${count} article${count > 1 ? 's' : ''}`;
}
