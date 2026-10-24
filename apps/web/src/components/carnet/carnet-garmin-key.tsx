'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/client/query/send-json';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

const CREATE_KEY_URL = 'https://connect.garmin.com/app/settings/personalApiToken';

const fieldClass =
  'border-border bg-background text-foreground w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Garmin is linked by a Personal API key (ADR-103): the key goes from this field to one
 * request and is never shown again — the row only ever reads its last four characters.
 */
export function GarminKeyButton({ linked }: { linked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const key = apiKey.trim();
    if (!key || busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await sendJson('/api/garmin/connect', 'POST', { apiKey: key });
      setApiKey('');
      setOpen(false);
      toast.success('Garmin est relié. Import de tes données en cours.');
      // The first pull is long (up to 5 min); the row refreshes once it lands.
      void sendJson('/api/garmin/sync', 'POST')
        .then(() => router.refresh())
        .catch(() =>
          toast.error('L’import Garmin n’a pas abouti. Il reprendra à la prochaine synchro.'),
        );
      router.refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Connexion Garmin échouée. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={
          linked
            ? 'pressable border-border text-foreground shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium'
            : 'pressable bg-foreground text-background shrink-0 rounded-full px-3 py-1.5 text-sm font-medium'
        }
        onClick={() => setOpen(true)}
      >
        {linked ? 'Remplacer la clé' : 'Relier'}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setApiKey('');
            setFailure(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clé API Garmin</DialogTitle>
            <DialogDescription>
              Crée une clé personnelle sur Garmin Connect, puis colle-la ici. SharpIt la vérifie
              auprès de Garmin, la garde chiffrée et ne l’affiche plus jamais.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <a
              className="text-sm font-medium underline underline-offset-4"
              href={CREATE_KEY_URL}
              rel="noreferrer"
              target="_blank"
            >
              Créer ma clé sur Garmin Connect
            </a>
            <label className="block space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Clé API
              </span>
              <input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                className={fieldClass}
                placeholder="Colle ta clé ici"
                spellCheck={false}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            {failure ? (
              <p className="text-destructive text-sm" role="alert">
                {failure}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Tu peux la révoquer à tout moment sur Garmin Connect. Une nouvelle clé remplace
              l’ancienne.
            </p>
            <button
              className="pressable bg-foreground text-background w-full rounded-full px-3 py-2 text-sm font-medium disabled:opacity-50"
              disabled={busy || apiKey.trim().length === 0}
              type="submit"
            >
              {busy ? 'Vérification…' : 'Relier Garmin'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
