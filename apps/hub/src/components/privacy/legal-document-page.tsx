import { LegalMarkdownBody } from '@/components/privacy/legal-markdown-body';
import { LegalPageShell } from '@/components/privacy/legal-page-shell';
import { loadLegalPageMarkdown } from '@/legal/load-legal-page';

export async function LegalDocumentPage({ page }: { page: 'privacy' | 'privacy-en' | 'terms' }) {
  const doc = await loadLegalPageMarkdown(page);
  return (
    <LegalPageShell
      lang={page === 'privacy-en' ? 'en' : 'fr'}
      lastUpdatedLabel={doc.lastUpdatedLabel}
      title={doc.title}
      version={doc.version}
    >
      <LegalMarkdownBody markdown={doc.bodyMarkdown} />
    </LegalPageShell>
  );
}
