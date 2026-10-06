import { HELP_CATEGORIES, articleHref } from './help-center';
import { markdownToText, prepareEntries } from './search';

/**
 * Every article, ready to search. Imported on demand by the search field, so the articles'
 * text is downloaded only once a reader starts to search.
 */
export const HELP_SEARCH_INDEX = prepareEntries(
  HELP_CATEGORIES.flatMap((category) =>
    category.articles.map((article) => ({
      href: articleHref(category, article),
      title: article.title,
      category: category.title,
      summary: article.summary,
      text: markdownToText(article.body),
    })),
  ),
);
