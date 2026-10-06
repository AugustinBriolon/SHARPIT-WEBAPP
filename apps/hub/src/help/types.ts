/** The glyph a category is drawn with; the components map it to an icon. */
export type HelpIcon =
  | 'start'
  | 'method'
  | 'scores'
  | 'plan'
  | 'coach'
  | 'activity'
  | 'health'
  | 'nutrition'
  | 'sources'
  | 'privacy'
  | 'account'
  | 'contact';

export type HelpArticle = {
  /** Part of the URL: lowercase, no accent, words joined by hyphens. Never renamed once live. */
  slug: string;
  title: string;
  /** One or two sentences: the answer in brief, shown under the title and in the lists. */
  summary: string;
  /** Markdown: `###` headings, lists, bold, tables and links. No `#` or `##`. */
  body: string;
};

export type HelpCategory = {
  slug: string;
  title: string;
  description: string;
  icon: HelpIcon;
  articles: readonly HelpArticle[];
};
