import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** The coach's prose (a weekly review), set as long-form reading. Rendered on the server. */
const components: Components = {
  h1: ({ children }) => <h3 className="text-section-title mt-8 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="text-section-title mt-8 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="text-card-title mt-6">{children}</h4>,
  h4: ({ children }) => <h5 className="text-label text-muted-foreground mt-6">{children}</h5>,
  p: ({ children }) => <p className="mt-3 text-pretty">{children}</p>,
  ul: ({ children }) => (
    <ul className="marker:text-muted-foreground/70 mt-3 list-disc space-y-1.5 ps-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="marker:text-muted-foreground/70 mt-3 list-decimal space-y-1.5 ps-5">
      {children}
    </ol>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children }) => <span>{children}</span>,
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="text-data w-full text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="text-muted-foreground border-border border-b py-1.5 pe-4 font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-border/50 border-b py-1.5 pe-4">{children}</td>,
};

export function CarnetMarkdown({ content }: { content: string }) {
  return (
    <div className="max-w-prose text-[0.9375rem] leading-relaxed">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
