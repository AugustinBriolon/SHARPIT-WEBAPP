import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@sharpit/app/lib/utils';
import { HEADING, RULE } from '@/components/landing/landing-parts';

const BODY = 'text-muted-foreground text-base leading-relaxed text-pretty sm:text-[1.0625rem]';

const components: Components = {
  h3: ({ children }) => (
    <h3 className={cn(HEADING, 'text-foreground mt-12 text-2xl first:mt-0')}>{children}</h3>
  ),
  p: ({ children }) => <p className={cn(BODY, 'mt-4')}>{children}</p>,
  ul: ({ children }) => (
    <ul className={cn(BODY, 'marker:text-foreground/40 mt-4 list-disc space-y-2 ps-5')}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className={cn(BODY, 'marker:text-foreground/40 mt-4 list-decimal space-y-2 ps-5')}>
      {children}
    </ol>
  ),
  strong: ({ children }) => <strong className="text-foreground font-medium">{children}</strong>,
  a: ({ href = '', children }) => {
    const className =
      'text-foreground decoration-highlight underline decoration-2 underline-offset-4';
    // Articles and the apex's own pages navigate inside the app; anything else opens apart.
    return href.startsWith('/') ? (
      <Link className={className} href={href}>
        {children}
      </Link>
    ) : (
      <a
        className={className}
        href={href}
        rel="noreferrer"
        target={href.startsWith('http') ? '_blank' : undefined}
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className={cn(RULE, 'text-label border-b px-3 py-3 font-medium first:ps-0')}>{children}</th>
  ),
  td: ({ children }) => (
    <td
      className={cn(
        RULE,
        'text-muted-foreground border-b px-3 py-3 align-top leading-relaxed first:ps-0',
      )}
    >
      {children}
    </td>
  ),
};

/** An article's body, rendered on the server: no Markdown parser reaches the browser. */
export function HelpMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {markdown}
    </ReactMarkdown>
  );
}
