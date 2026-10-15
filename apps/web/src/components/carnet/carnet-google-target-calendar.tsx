'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@sharpit/ui/client/query/api-fetch';
import { sendJson } from '@/client/query/send-json';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

type GoogleCalendarRow = {
  id: string;
  summary: string;
  primary: boolean;
  isTarget: boolean;
  hidden: boolean;
};

async function loadCalendars(): Promise<GoogleCalendarRow[]> {
  const res = await apiFetch('/api/google/calendars');
  if (!res.ok) {
    throw new Error('Impossible de lister tes agendas');
  }
  const rows = (await res.json()) as GoogleCalendarRow[];
  return rows.filter((row) => !row.hidden);
}

function CalendarList({
  busy,
  calendars,
  targetId,
  onSelect,
}: {
  busy: boolean;
  calendars: GoogleCalendarRow[] | null;
  targetId: string | null;
  onSelect: (calendar: GoogleCalendarRow) => void;
}) {
  if (busy && !calendars) {
    return <p className="text-muted-foreground text-sm">Chargement…</p>;
  }
  if (calendars && calendars.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun agenda accessible.</p>;
  }
  return (
    <ul className="divide-border divide-y">
      {(calendars ?? []).map((calendar) => {
        const selected = calendar.id === targetId;
        return (
          <li key={calendar.id}>
            <button
              className="pressable flex w-full items-center justify-between gap-3 py-3 text-left text-sm disabled:opacity-50"
              disabled={busy}
              type="button"
              onClick={() => onSelect(calendar)}
            >
              <span className="min-w-0">
                <span className="font-medium">{calendar.summary}</span>
                {calendar.primary ? (
                  <span className="text-muted-foreground ml-2 text-xs">Principal</span>
                ) : null}
              </span>
              {selected ? (
                <span className="text-muted-foreground shrink-0 text-xs">Actuel</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Once Google is linked, SharpIt still needs a target calendar before it writes
 * planned sessions. The iPhone already had this; the carnet exposes the same
 * `/api/google/select-calendar` contract so the OAuth demo stays web-only.
 */
export function GoogleTargetCalendarButton({
  targetCalendarId,
  targetCalendarName,
}: {
  targetCalendarId: string | null | undefined;
  targetCalendarName: string | null | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendarRow[] | null>(null);
  const [targetId, setTargetId] = useState(targetCalendarId ?? null);
  const [targetName, setTargetName] = useState(targetCalendarName ?? null);

  async function openPicker() {
    setOpen(true);
    if (calendars) {
      return;
    }
    setBusy(true);
    try {
      setCalendars(await loadCalendars());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agendas indisponibles');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function select(calendar: GoogleCalendarRow) {
    setBusy(true);
    try {
      await sendJson('/api/google/select-calendar', 'POST', {
        calendarId: calendar.id,
        calendarName: calendar.summary,
      });
      setTargetId(calendar.id);
      setTargetName(calendar.summary);
      setOpen(false);
      toast.success(`Agenda : ${calendar.summary}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  const label = targetName?.trim() || (targetId ? 'Agenda choisi' : 'Choisir un agenda');

  return (
    <>
      <button
        className="pressable border-border text-foreground shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium"
        type="button"
        onClick={() => void openPicker()}
      >
        {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agenda Google</DialogTitle>
            <DialogDescription>
              SharpIt y crée et met à jour tes séances planifiées.
            </DialogDescription>
          </DialogHeader>

          <CalendarList
            busy={busy}
            calendars={calendars}
            targetId={targetId}
            onSelect={(calendar) => void select(calendar)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
