import { addTrainingDays } from '@sharpit/core/training/training-day';
import { prisma } from '@sharpit/db/client';
import { sendTransactionalEmail } from '@sharpit/server/lib/email/transactional-email';
import {
  loadOutcomeReport,
  type OutcomeReport,
} from '@sharpit/server/lib/planned-session/adherence/plan-adherence-service';

export type FeedbackNote = {
  createdAt: Date;
  athleteId: string;
  context: string | null;
  appVersion: string | null;
  message: string;
};

const REPORT_DAYS = 7;

/**
 * Monday's mail to the team: where the outcome stands (≥ 70 % of planned sessions over the first
 * four weeks) and what athletes wrote through « Donner un avis » this week — the two reports the
 * beta is run on, without anyone running a script. Sent to `FEEDBACK_EMAIL`; athlete ids only.
 */
export async function sendWeeklyBetaReport(
  today: string,
): Promise<{ sent: boolean; athletes: number; notes: number }> {
  const report = await loadWeeklyBetaReport(today);
  const to = process.env.FEEDBACK_EMAIL;
  const sent = to
    ? await sendTransactionalEmail({ to, subject: report.subject, text: report.text })
    : false;
  return { sent, athletes: report.athletes, notes: report.notes };
}

/** The report as mailed, also printed on demand by `scripts/reports/beta-report.ts`. */
export async function loadWeeklyBetaReport(today: string) {
  const [outcome, notes] = await Promise.all([
    loadOutcomeReport(today),
    prisma.athleteFeedback.findMany({
      where: {
        createdAt: { gte: new Date(`${addTrainingDays(today, -REPORT_DAYS)}T00:00:00.000Z`) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, athleteId: true, context: true, appVersion: true, message: true },
    }),
  ]);
  return {
    ...formatWeeklyBetaReport(outcome, notes, today),
    athletes: outcome.rows.length,
    notes: notes.length,
  };
}

export function formatWeeklyBetaReport(
  outcome: OutcomeReport,
  notes: readonly FeedbackNote[],
  today: string,
): { subject: string; text: string } {
  const headline =
    outcome.share === null
      ? 'personne n’a fini ses 4 semaines'
      : `${outcome.meetingTarget}/${outcome.finished} à ${percent(outcome.target)}`;
  return {
    subject: `SharpIt bêta · semaine du ${today} — ${headline}`,
    text: [outcomeSection(outcome), athletesSection(outcome), notesSection(notes)].join('\n\n'),
  };
}

function outcomeSection(outcome: OutcomeReport): string {
  const result =
    outcome.share === null
      ? 'Personne n’a encore fini ses 4 premières semaines.'
      : `${outcome.meetingTarget} sur ${outcome.finished} athlète(s) ayant fini leurs 4 semaines ` +
        `l’atteignent (${percent(outcome.share)}).`;
  return `Objectif : au moins ${percent(outcome.target)} des séances prévues faites sur les 4 premières semaines.\n${result}`;
}

function athletesSection(outcome: OutcomeReport): string {
  if (outcome.rows.length === 0) {
    return 'Athlètes : aucun avec une séance prévue.';
  }
  const lines = outcome.rows.map((row) => {
    const window = row.complete ? '4 semaines finies' : 'en cours';
    const key = `clés ${row.key.done}/${row.key.planned} (${percent(row.key.rate)})`;
    return `- ${row.athleteId} · depuis le ${row.start} · ${row.done}/${row.planned} (${percent(row.rate)}) · ${key} · ${window}${targetMark(row.meetsTarget)}`;
  });
  return `Athlètes (${outcome.rows.length}) :\n${lines.join('\n')}`;
}

function notesSection(notes: readonly FeedbackNote[]): string {
  if (notes.length === 0) {
    return 'Avis de la semaine : aucun.';
  }
  const lines = notes.map((note) => {
    const where = [note.context, note.appVersion].filter(Boolean).join(' · ');
    const day = note.createdAt.toISOString().slice(0, 10);
    return `- ${day} · ${note.athleteId}${where ? ` · ${where}` : ''}\n  ${note.message.replace(/\n/g, '\n  ')}`;
  });
  return `Avis de la semaine (${notes.length}) :\n${lines.join('\n')}`;
}

function targetMark(meetsTarget: boolean | null): string {
  if (meetsTarget === null) {
    return '';
  }
  return meetsTarget ? ' · atteint' : ' · manqué';
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)} %`;
}
