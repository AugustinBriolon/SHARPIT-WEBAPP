import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cacheLife } from 'next/cache';
import { CURRENT_PRIVACY_VERSION } from '@sharpit/app/lib/privacy/constants';

const LEGAL_FILES = {
  privacy: 'PRIVACY_PAGE_FR_V0.md',
  'privacy-en': 'PRIVACY_PAGE_EN_V0.md',
  terms: 'TERMS_PAGE_FR_V0.md',
} as const;

export type LegalPageId = keyof typeof LEGAL_FILES;

/**
 * Loads FR legal draft from content/legal (Privacy Santé source of truth).
 * Strips the status meta blockquote so athletes only see the published page body.
 * Cached so /privacy and /terms stay in the static shell (Cache Components).
 */
export async function loadLegalPageMarkdown(page: LegalPageId): Promise<{
  title: string;
  version: string;
  lastUpdatedLabel: string;
  bodyMarkdown: string;
}> {
  'use cache';
  cacheLife('max');

  const filePath = path.join(process.cwd(), 'content/legal', LEGAL_FILES[page]);
  const raw = await readFile(filePath, 'utf8');
  const bodyMarkdown = stripLegalMetaHeader(raw);
  const titleMatch = bodyMarkdown.match(/^##\s+(.+)$/m);
  const updatedMatch = bodyMarkdown.match(
    /\*\*(?:Dernière mise à jour|Last updated)\s*:\*\*\s*(.+)$/m,
  );

  return {
    title:
      titleMatch?.[1]?.trim() ??
      (page === 'terms'
        ? 'CGU'
        : page === 'privacy-en'
          ? 'Privacy Policy'
          : 'Politique de confidentialité'),
    version: CURRENT_PRIVACY_VERSION,
    lastUpdatedLabel: updatedMatch?.[1]?.trim() ?? '2 septembre 2026',
    bodyMarkdown,
  };
}

/** Drop leading `# …` title + `> **Statut**` blockquote meta; keep `##` page body. */
export function stripLegalMetaHeader(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let index = 0;
  // Optional H1
  if (lines[index]?.startsWith('# ')) {
    index += 1;
    while (lines[index] === '') {
      index += 1;
    }
  }
  // Status / audience blockquotes
  while (lines[index]?.startsWith('>')) {
    index += 1;
  }
  while (lines[index] === '' || lines[index] === '---') {
    index += 1;
  }
  return lines.slice(index).join('\n').trim();
}
