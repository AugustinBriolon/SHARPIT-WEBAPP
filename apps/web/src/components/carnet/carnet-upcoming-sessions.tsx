'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActivityType, SessionIntensity } from '@prisma/client';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { SPORT_IDENTITY_HEX } from '@sharpit/app/lib/activity/sport-identity';
import {
  formatPlannedDuration,
  intensityLabel,
  intensityLabels,
  intensityOrder,
} from '@sharpit/app/lib/planned-session/sessions';
import { formatPlannedSessionRelativeDay } from '@sharpit/app/lib/planned-session/planned-session-dates';
import { isSet } from '@sharpit/shared/value';
import { Button } from '@sharpit/ui/components/ui/button';
import { sendJson } from '@/client/query/send-json';
import { Quiet, ReadingList } from '@/components/carnet/carnet-parts';
import type { SeasonSession } from '@/components/carnet/carnet-season';
import { longDayLabel } from '@/components/carnet/carnet-time';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SharpitDatePicker, SharpitTimePicker } from '@/components/ui/sharpit-datetime';
import { toast } from '@/components/ui/toast';

const fieldClass =
  'border-border bg-background text-foreground w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

type Draft = {
  title: string;
  date: string;
  startTime: string;
  durationMin: string;
  description: string;
  intensity: SessionIntensity | '';
};

function dayId(date: string): string {
  return date.slice(0, 10);
}

function draftFrom(session: SeasonSession): Draft {
  return {
    title: session.title ?? '',
    date: dayId(session.date),
    startTime: session.startTime ?? '',
    durationMin: isSet(session.durationMin) ? String(session.durationMin) : '',
    description: session.description ?? '',
    intensity: session.intensity ?? '',
  };
}

function sessionTitle(session: SeasonSession): string {
  return session.title?.trim() || (session.type ? activityTypeLabels[session.type] : 'Séance');
}

function applyDraft(session: SeasonSession, draft: Draft): SeasonSession {
  return {
    ...session,
    title: draft.title.trim() || null,
    date: draft.date,
    startTime: draft.startTime || null,
    durationMin: draft.durationMin ? Number(draft.durationMin) : null,
    description: draft.description.trim() || null,
    intensity: draft.intensity || null,
  };
}

function patchBody(draft: Draft) {
  return {
    title: draft.title.trim() || null,
    date: `${draft.date}T12:00:00`,
    startTime: draft.startTime || null,
    durationMin: draft.durationMin ? Number(draft.durationMin) : null,
    description: draft.description.trim() || null,
    intensity: draft.intensity || null,
  };
}

function SessionRow({
  session,
  today,
  onOpen,
}: {
  session: SeasonSession;
  today: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        className="pressable-lg hover:bg-muted/40 -mx-3 flex w-[calc(100%+1.5rem)] items-baseline justify-between gap-6 rounded-md px-3 py-3 text-left"
        type="button"
        onClick={onOpen}
      >
        <div className="flex min-w-0 items-baseline gap-3">
          <span
            className="mt-1.5 size-2 shrink-0 self-start rounded-full"
            style={{
              backgroundColor: SPORT_IDENTITY_HEX[session.type ?? ActivityType.OTHER],
            }}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{sessionTitle(session)}</p>
            <p className="text-muted-foreground mt-0.5 text-xs first-letter:uppercase">
              {formatPlannedSessionRelativeDay(session.date, new Date(`${today}T12:00:00`))}
              {session.type ? ` · ${activityTypeLabels[session.type]}` : ''}
              {session.isKey ? ' · clé' : ''}
            </p>
          </div>
        </div>
        <p className="text-data text-muted-foreground shrink-0 text-right text-xs">
          {[session.startTime, formatPlannedDuration(session.durationMin)]
            .filter((part) => part && part !== '—')
            .join(' · ')}
        </p>
      </button>
    </li>
  );
}

function Field({
  label,
  value,
  editing,
  input,
}: {
  label: string;
  value: string;
  editing: boolean;
  input: ReactNode;
}) {
  return (
    <div>
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
        {editing ? input : value}
      </dd>
    </div>
  );
}

function SessionFields({
  session,
  draft,
  editing,
  onChange,
}: {
  session: SeasonSession;
  draft: Draft;
  editing: boolean;
  onChange: (next: Draft) => void;
}) {
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  useEffect(() => {
    if (!editing) {
      setPicker(null);
    }
  }, [editing]);

  return (
    <dl className="space-y-4">
      <Field
        editing={editing}
        label="Titre"
        value={sessionTitle(session)}
        input={
          <input
            className={fieldClass}
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
          />
        }
      />
      <Field
        editing={editing}
        label="Date"
        value={longDayLabel(dayId(session.date))}
        input={
          <SharpitDatePicker
            open={picker === 'date'}
            value={draft.date}
            onChange={(date) => onChange({ ...draft, date })}
            onOpenChange={(open) => setPicker(open ? 'date' : null)}
          />
        }
      />
      <Field
        editing={editing}
        label="Heure"
        value={session.startTime ?? '—'}
        input={
          <SharpitTimePicker
            open={picker === 'time'}
            value={draft.startTime}
            onChange={(startTime) => onChange({ ...draft, startTime })}
            onOpenChange={(open) => setPicker(open ? 'time' : null)}
          />
        }
      />
      <Field
        editing={editing}
        label="Durée"
        value={formatPlannedDuration(session.durationMin)}
        input={
          <input
            className={fieldClass}
            inputMode="numeric"
            min={1}
            type="number"
            value={draft.durationMin}
            onChange={(event) => onChange({ ...draft, durationMin: event.target.value })}
          />
        }
      />
      <Field
        editing={editing}
        label="Intensité"
        value={intensityLabel(session.intensity ?? null)}
        input={
          <select
            className={fieldClass}
            value={draft.intensity}
            onChange={(event) =>
              onChange({
                ...draft,
                intensity: event.target.value as SessionIntensity | '',
              })
            }
          >
            <option value="">—</option>
            {intensityOrder.map((intensity) => (
              <option key={intensity} value={intensity}>
                {intensityLabels[intensity]}
              </option>
            ))}
          </select>
        }
      />
      {editing || session.description || session.rationale ? (
        <Field
          editing={editing}
          label="Détail"
          value={session.description ?? session.rationale ?? '—'}
          input={
            <textarea
              className={`${fieldClass} min-h-24 resize-y`}
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          }
        />
      ) : null}
    </dl>
  );
}

function SessionDetailDialog({
  session,
  draft,
  editing,
  busy,
  onOpenChange,
  onDraftChange,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  session: SeasonSession;
  draft: Draft;
  editing: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: Draft) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!editing}>
        <DialogHeader className={editing ? undefined : 'pr-10'}>
          <p className="text-label text-muted-foreground">
            {session.type ? activityTypeLabels[session.type] : 'Séance'}
            {session.isKey ? ' · clé' : ''}
          </p>
          <DialogTitle className="mt-1">{sessionTitle(session)}</DialogTitle>
          <DialogDescription>
            {longDayLabel(dayId(session.date))}
            {session.startTime ? ` · ${session.startTime}` : ''}
          </DialogDescription>
        </DialogHeader>

        <SessionFields draft={draft} editing={editing} session={session} onChange={onDraftChange} />

        <DialogFooter>
          {editing ? (
            <>
              <Button disabled={busy} type="button" variant="outline" onClick={onCancelEdit}>
                Annuler
              </Button>
              <Button disabled={busy} type="button" onClick={onSave}>
                Enregistrer
              </Button>
            </>
          ) : (
            <>
              <Button disabled={busy} type="button" variant="outline" onClick={onDelete}>
                Supprimer
              </Button>
              <Button disabled={busy} type="button" onClick={onEdit}>
                Modifier
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UpcomingSessions({
  sessions,
  today,
}: {
  sessions: SeasonSession[];
  today: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState(sessions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    setItems(sessions);
  }, [sessions]);

  const selected = items.find((session) => session.id === openId) ?? null;

  function open(session: SeasonSession) {
    if (!session.id) {
      return;
    }
    setOpenId(session.id);
    setDraft(draftFrom(session));
    setEditing(false);
  }

  function close() {
    setOpenId(null);
    setEditing(false);
    setDraft(null);
  }

  async function save() {
    if (!selected?.id || !draft) {
      return;
    }
    setBusy(true);
    try {
      await sendJson(`/api/v1/planned-sessions/${selected.id}`, 'PATCH', patchBody(draft));
      const next = applyDraft(selected, draft);
      setItems((current) =>
        current.map((session) => (session.id === selected.id ? next : session)),
      );
      setDraft(draftFrom(next));
      setEditing(false);
      toast.success('Séance mise à jour');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modification impossible');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected?.id) {
      return;
    }
    const ok = await confirm({
      title: 'Supprimer cette séance ?',
      description:
        'Elle disparaît du plan. Si elle était dans Google Agenda, SharpIt la retire aussi.',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'destructive',
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      const { id } = selected;
      await sendJson(`/api/v1/planned-sessions/${id}`, 'DELETE');
      setItems((current) => current.filter((session) => session.id !== id));
      close();
      toast.success('Séance supprimée');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {dialog}
      {items.length === 0 ? (
        <Quiet>Aucune séance à venir.</Quiet>
      ) : (
        <ReadingList>
          {items.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              today={today}
              onOpen={() => open(session)}
            />
          ))}
        </ReadingList>
      )}

      {selected && draft ? (
        <SessionDetailDialog
          busy={busy}
          draft={draft}
          editing={editing}
          session={selected}
          onDelete={() => void remove()}
          onDraftChange={setDraft}
          onEdit={() => setEditing(true)}
          onSave={() => void save()}
          onCancelEdit={() => {
            setDraft(draftFrom(selected));
            setEditing(false);
          }}
          onOpenChange={(next) => {
            if (!next && !busy) {
              close();
            }
          }}
        />
      ) : null}
    </>
  );
}
