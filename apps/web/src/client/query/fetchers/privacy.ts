/**
 * Privacy client fetchers.
 * Export (blob) and delete keep special semantics — not generic sendJson UX.
 */

import { sendJson } from '@/client/query/send-json';
import { apiFetch } from '@sharpit/ui/client/query/api-fetch';

export async function postPrivacyConsent(body: Record<string, unknown>): Promise<unknown> {
  return sendJson('/api/privacy/consent', 'POST', body);
}

export async function downloadPrivacyExport(): Promise<Blob> {
  const response = await apiFetch('/api/privacy/export');
  if (!response.ok) {
    throw new Error('Export impossible');
  }
  return response.blob();
}

export async function deletePrivacyAccount(): Promise<void> {
  const response = await apiFetch('/api/privacy/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'SUPPRIMER' }),
  });
  if (!response.ok) {
    throw new Error('Suppression impossible');
  }
}
