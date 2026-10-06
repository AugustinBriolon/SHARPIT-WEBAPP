'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { Button } from '@sharpit/ui/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { CONTROLLER_EMAIL, CURRENT_PRIVACY_VERSION } from '@sharpit/app/lib/privacy/constants';
import {
  consentWallHrefAfterHealthWithdraw,
  shouldRedirectToConsentWallAfterPatch,
} from '@sharpit/app/lib/privacy/consent-withdraw-ux';
import {
  deletePrivacyAccount,
  downloadPrivacyExport,
  postPrivacyConsent,
} from '@/client/query/fetchers/privacy';

type ConsentState = {
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  privacyVersion: string | null;
  healthDataConsentAt: string | null;
  aiProcessingConsentAt: string | null;
  unofficialProvidersAckAt: string | null;
  currentPrivacyVersion: string;
};

const HEALTH_DISCLAIMER =
  'Sharpit est un outil d’aide à l’entraînement. Ce n’est pas un dispositif médical et ça ne remplace pas un avis médical. Les signaux (récupération, fatigue, risques) sont des estimations d’entraînement, pas un diagnostic.';

function PrivacyDocumentsSection({ consents }: { consents: ConsentState | null }) {
  return (
    <section className="analysis-panel rounded-analysis-lg space-y-3 px-4 py-4">
      <p className="text-label">Documents</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-2" href="/privacy">
          Politique de confidentialité
        </Link>
        <Link className="underline underline-offset-2" href="/terms">
          Conditions d&apos;utilisation
        </Link>
      </div>
      <p className="text-muted-foreground text-xs">
        Version acceptée : {consents?.privacyVersion ?? '—'} · actuelle :{' '}
        {consents?.currentPrivacyVersion ?? CURRENT_PRIVACY_VERSION}
      </p>
      <p className="text-muted-foreground text-xs">Contact : {CONTROLLER_EMAIL}</p>
    </section>
  );
}

function PrivacyHealthConsentSection({
  checked,
  busy,
  onChange,
}: {
  checked: boolean;
  busy: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <section className="analysis-panel rounded-analysis-lg space-y-4 px-4 py-4">
      <div>
        <p className="text-label">Données de santé (requis)</p>
        <h2 className="mt-1 text-base font-semibold">Sync et traitements physiologiques</h2>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={checked}
          className="mt-0.5"
          disabled={busy}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <span>
          Synchronisation et traitement des données de santé / physiologiques (art. 9). Sans ce
          consentement, l&apos;accès à Today est bloqué.
        </span>
      </label>
      <blockquote className="border-border text-muted-foreground border-l-2 pl-3 text-xs leading-relaxed">
        {HEALTH_DISCLAIMER}
      </blockquote>
    </section>
  );
}

function PrivacyOptionalConsentsSection({
  aiChecked,
  unofficialChecked,
  busy,
  onAiChange,
  onUnofficialChange,
}: {
  aiChecked: boolean;
  unofficialChecked: boolean;
  busy: boolean;
  onAiChange: (checked: boolean) => void;
  onUnofficialChange: (checked: boolean) => void;
}) {
  return (
    <section className="analysis-panel rounded-analysis-lg space-y-4 px-4 py-4">
      <div>
        <p className="text-label">Consentements</p>
        <h2 className="mt-1 text-base font-semibold">Traitements optionnels</h2>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={aiChecked}
          className="mt-0.5"
          disabled={busy}
          onCheckedChange={(value) => onAiChange(value === true)}
        />
        <span>
          Traitement par IA (coach, bilans rédigés). Sans ce consentement, les moteurs déterministes
          restent disponibles.
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={unofficialChecked}
          className="mt-0.5"
          disabled={busy}
          onCheckedChange={(value) => onUnofficialChange(value === true)}
        />
        <span>
          J&apos;ai pris connaissance que certaines intégrations sont non officielles / « en
          l&apos;état ».
        </span>
      </label>
    </section>
  );
}

function PrivacyDataActionsSection({
  compact,
  consents,
  busy,
  pendingSignOut,
  onExport,
  onDelete,
}: {
  compact: boolean;
  consents: ConsentState | null;
  busy: boolean;
  pendingSignOut: boolean;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="analysis-panel rounded-analysis-lg space-y-3 px-4 py-4">
      <p className="text-label">Tes données</p>
      {compact ? (
        <p className="text-muted-foreground text-xs">
          Version acceptée : {consents?.privacyVersion ?? '—'} · actuelle :{' '}
          {consents?.currentPrivacyVersion ?? CURRENT_PRIVACY_VERSION}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} type="button" variant="outline" onClick={onExport}>
          Exporter JSON
        </Button>
        <Button disabled={busy} type="button" variant="destructive" onClick={onDelete}>
          Supprimer mon compte
        </Button>
        {pendingSignOut ? (
          <p aria-live="polite" className="text-muted-foreground self-center text-sm" role="status">
            Compte supprimé — déconnexion…
          </p>
        ) : null}
      </div>
    </section>
  );
}

const AFTER_DELETION_URL = '/welcome?compte=supprime';

/**
 * The Clerk identity is deleted with the account, so its session is already dead
 * server-side: leave now rather than let the next request fail. A full load either way.
 */
async function leaveDeletedAccount(signOut: ReturnType<typeof useClerk>['signOut']) {
  try {
    await signOut({ redirectUrl: AFTER_DELETION_URL });
  } catch {
    window.location.assign(AFTER_DELETION_URL);
  }
}

function usePrivacySettingsActions(initial: ConsentState | null) {
  const router = useRouter();
  const { signOut } = useClerk();
  const { confirm, dialog } = useConfirmDialog();
  const [consents, setConsents] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [pendingSignOut, setPendingSignOut] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') !== 'provider_consent_required') {
      return;
    }
    toast.error(
      'Accepte d’abord le consentement données de santé et l’accusé fournisseurs non officiels.',
    );
  }, []);

  async function patchConsent(body: Record<string, boolean>) {
    setBusy(true);
    try {
      const data = (await postPrivacyConsent(body)) as { consents: ConsentState };
      setConsents(data.consents);
      if (shouldRedirectToConsentWallAfterPatch(body)) {
        router.replace(consentWallHrefAfterHealthWithdraw());
        router.refresh();
        return;
      }
      toast.success('Consentement mis à jour');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onHealthConsentChange(checked: boolean) {
    if (!checked) {
      const ok = await confirm({
        title: 'Retirer le consentement santé ?',
        description:
          'Today et les traitements physiologiques seront bloqués immédiatement. Tu pourras réactiver le consentement sur l’écran dédié.',
        confirmLabel: 'Retirer',
        cancelLabel: 'Annuler',
        variant: 'destructive',
      });
      if (!ok) {
        return;
      }
    }
    await patchConsent({ healthDataConsent: checked });
  }

  async function handleExport() {
    setBusy(true);
    try {
      const blob = await downloadPrivacyExport();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sharpit-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Export téléchargé');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export impossible');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Supprimer mon compte ?',
      description:
        'Ton compte, ton identifiant de connexion et toutes tes données sont supprimés immédiatement et définitivement. Te reconnecter créera un nouveau compte vierge.',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'destructive',
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await deletePrivacyAccount();
      setPendingSignOut(true);
      await leaveDeletedAccount(signOut);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
      setBusy(false);
    }
  }

  return {
    dialog,
    consents,
    busy,
    pendingSignOut,
    patchConsent,
    onHealthConsentChange,
    handleExport,
    handleDelete,
  };
}

export function PrivacySettingsPanel({
  initial,
  compact = false,
}: {
  initial: ConsentState | null;
  /** When embedded in Profil: skip Documents (already under Mentions légales). */
  compact?: boolean;
}) {
  const {
    dialog,
    consents,
    busy,
    pendingSignOut,
    patchConsent,
    onHealthConsentChange,
    handleExport,
    handleDelete,
  } = usePrivacySettingsActions(initial);

  return (
    <div className="space-y-4">
      {dialog}
      {compact ? null : <PrivacyDocumentsSection consents={consents} />}
      <PrivacyHealthConsentSection
        busy={busy}
        checked={Boolean(consents?.healthDataConsentAt)}
        onChange={(checked) => void onHealthConsentChange(checked)}
      />
      <PrivacyOptionalConsentsSection
        aiChecked={Boolean(consents?.aiProcessingConsentAt)}
        busy={busy}
        unofficialChecked={Boolean(consents?.unofficialProvidersAckAt)}
        onAiChange={(checked) => void patchConsent({ aiProcessingConsent: checked })}
        onUnofficialChange={(checked) => void patchConsent({ unofficialProvidersAck: checked })}
      />
      <PrivacyDataActionsSection
        busy={busy}
        compact={compact}
        consents={consents}
        pendingSignOut={pendingSignOut}
        onDelete={() => void handleDelete()}
        onExport={() => void handleExport()}
      />
    </div>
  );
}
