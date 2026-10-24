import { AdherenceWeeks, formatAdherence } from '@/components/admin/adherence-weeks';
import { AthleteTierToggle } from '@/components/admin/athlete-tier-toggle';
import { ADHERENCE_TARGET, summarizeCohort } from '@sharpit/app/lib/admin/plan-adherence';
import type { AdminAthleteView } from '@sharpit/app/lib/web/payloads';
import { cachedServerApiJson } from '@sharpit/ui/server/api-client';

const formatUsd = (usd: number) =>
  usd.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' });

export default async function AdminPage() {
  const athletes =
    (await cachedServerApiJson<AdminAthleteView[]>('/api/web/admin-athletes', true)) ?? [];

  const costs = athletes.flatMap(({ aiCost }) => (aiCost ? [aiCost.totalUsd] : []));
  const meanCost =
    costs.length === 0 ? null : costs.reduce((sum, usd) => sum + usd, 0) / costs.length;
  const cohort = summarizeCohort(
    athletes.flatMap(({ adherence }) => (adherence ? [adherence] : [])),
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-label">Admin</p>
        <h1 className="text-page-title mt-1">Athlètes</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {athletes.length} compte{athletes.length > 1 ? 's' : ''} — bascule manuelle du palier en
          attendant Stripe.
        </p>
      </header>

      <section className="analysis-panel rounded-analysis-lg px-5 py-4">
        <p className="text-label">Adhérence au plan · semaines 1–4</p>
        <div className="mt-3 flex flex-wrap gap-6">
          {cohort.meanByWeek.map((mean, index) => (
            <div key={index}>
              <p className="text-muted-foreground text-xs">S{index + 1} · moyenne</p>
              <p className="text-data text-xl font-semibold">
                {mean === null ? '—' : formatAdherence(mean)}
              </p>
            </div>
          ))}
          <div>
            <p className="text-muted-foreground text-xs">
              S4 ≥ {formatAdherence(ADHERENCE_TARGET)}
            </p>
            <p className="text-data text-xl font-semibold">
              {cohort.weekFourOnTarget}/{cohort.weekFourClosed}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Séances faites (cochées ou liées à une activité) sur prévues, jours passés seulement,
          depuis la première séance planifiée. Moyennes sur les semaines terminées.
        </p>
      </section>

      <section className="analysis-panel rounded-analysis-lg px-5 py-4">
        <p className="text-label">Coût IA · 30 derniers jours</p>
        <div className="mt-3 flex flex-wrap gap-6">
          <div>
            <p className="text-muted-foreground text-xs">Moyenne par athlète actif</p>
            <p className="text-data text-xl font-semibold">
              {meanCost === null ? '—' : formatUsd(meanCost)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Athlètes avec un appel IA</p>
            <p className="text-data text-xl font-semibold">{costs.length}</p>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Prix catalogue de l&apos;AI Gateway (USD), coach et analyses écrites en arrière-plan. À
          mettre en face de SharpIt Pro : 12,99 €/mois.
        </p>
      </section>

      <div className="analysis-panel divide-analysis-border rounded-analysis-lg divide-y overflow-hidden">
        {athletes.map((athlete) => (
          <div
            key={athlete.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
          >
            <div className="min-w-0">
              <p className="text-card-title truncate">{athlete.email ?? athlete.clerkUserId}</p>
              <p className="text-muted-foreground text-data mt-0.5 text-xs">
                {athlete.id} · depuis le {athlete.createdAt.toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <AdherenceWeeks adherence={athlete.adherence} />
              <p
                className="text-data w-24 text-right text-sm"
                title={
                  athlete.aiCost ? `dont coach ${formatUsd(athlete.aiCost.coachUsd)}` : undefined
                }
              >
                {athlete.aiCost ? formatUsd(athlete.aiCost.totalUsd) : '—'}
                <span className="text-muted-foreground block text-[10px]">IA · 30 j</span>
              </p>
              <AthleteTierToggle athleteId={athlete.id} tier={athlete.tier} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
