import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/components/privacy/legal-document-page';

export const metadata: Metadata = {
  title: 'Privacy — SharpIt',
  description: 'SharpIt privacy policy (EN).',
};

export default function PrivacyEnglishPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background text-muted-foreground flex min-h-dvh items-center justify-center text-sm">
          Loading…
        </div>
      }
    >
      <LegalDocumentPage page="privacy-en" />
    </Suspense>
  );
}
