import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const loadOutcomeReport = vi.fn();
const sendTransactionalEmail = vi.fn().mockResolvedValue(true);

vi.mock('@sharpit/db/client', () => ({ prisma: { athleteFeedback: { findMany } } }));
vi.mock('@sharpit/server/lib/planned-session/adherence/plan-adherence-service', () => ({
  loadOutcomeReport,
}));
vi.mock('@sharpit/server/lib/email/transactional-email', () => ({ sendTransactionalEmail }));

const { formatWeeklyBetaReport, sendWeeklyBetaReport } = await import('./weekly-beta-report');

const outcome = {
  target: 0.7,
  finished: 1,
  meetingTarget: 1,
  share: 1,
  rows: [
    {
      athleteId: 'a1',
      start: '2026-09-01',
      planned: 10,
      done: 8,
      rate: 0.8,
      key: { planned: 4, done: 4, rate: 1 },
      complete: true,
      meetsTarget: true,
    },
    {
      athleteId: 'a2',
      start: '2026-09-28',
      planned: 0,
      done: 0,
      rate: null,
      key: { planned: 0, done: 0, rate: null },
      complete: false,
      meetsTarget: null,
    },
  ],
};

const note = {
  createdAt: new Date('2026-10-03T08:00:00.000Z'),
  athleteId: 'a2',
  context: 'settings',
  appVersion: '1.0 (42)',
  message: 'La notif du matin\nest top',
};

describe('weekly beta report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadOutcomeReport.mockResolvedValue(outcome);
    findMany.mockResolvedValue([note]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('says the outcome, every athlete and the week’s notes', () => {
    const report = formatWeeklyBetaReport(outcome, [note], '2026-10-05');
    expect(report.subject).toBe('SharpIt bêta · semaine du 2026-10-05 — 1/1 à 70 %');
    expect(report.text).toContain(
      '1 sur 1 athlète(s) ayant fini leurs 4 semaines l’atteignent (100 %).',
    );
    expect(report.text).toContain(
      '- a1 · depuis le 2026-09-01 · 8/10 (80 %) · clés 4/4 (100 %) · 4 semaines finies · atteint',
    );
    expect(report.text).toContain(
      '- a2 · depuis le 2026-09-28 · 0/0 (—) · clés 0/0 (—) · en cours',
    );
    expect(report.text).toContain(
      '- 2026-10-03 · a2 · settings · 1.0 (42)\n  La notif du matin\n  est top',
    );
  });

  it('says when nobody finished yet and nothing was written', () => {
    const report = formatWeeklyBetaReport(
      { target: 0.7, finished: 0, meetingTarget: 0, share: null, rows: [] },
      [],
      '2026-10-05',
    );
    expect(report.subject).toContain('personne n’a fini ses 4 semaines');
    expect(report.text).toContain('Avis de la semaine : aucun.');
  });

  it('mails it to FEEDBACK_EMAIL, reading the last seven days of notes', async () => {
    vi.stubEnv('FEEDBACK_EMAIL', 'team@example.com');
    expect(await sendWeeklyBetaReport('2026-10-05')).toEqual({ sent: true, athletes: 2, notes: 1 });
    expect(findMany.mock.calls[0][0].where.createdAt.gte).toEqual(
      new Date('2026-09-28T00:00:00.000Z'),
    );
    expect(sendTransactionalEmail.mock.calls[0][0].to).toBe('team@example.com');
  });

  it('sends nothing without an address', async () => {
    vi.stubEnv('FEEDBACK_EMAIL', '');
    expect((await sendWeeklyBetaReport('2026-10-05')).sent).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
