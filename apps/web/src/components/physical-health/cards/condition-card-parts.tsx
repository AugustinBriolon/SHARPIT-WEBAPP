'use client';

import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { DiscussWithCoachButton } from '@/components/coach/discuss/discuss-with-coach-button';
import { CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { PhysicalHealthConditionCard } from '@sharpit/app/presentation/physical-health-view-model';
import { CORPS_TONE_TEXT, type CorpsTone } from '@sharpit/app/lib/ui/metric-tone';
import { corpsToneFromPhysicalSeverity } from '@sharpit/app/lib/health/health-status';
import { usePhysicalNotes } from '@/hooks/use-physical';
import {
  reassessmentDue,
  type ReassessmentDue,
} from '@sharpit/app/lib/physical-health/reassessment-due';
import { usePlannedSessions } from '@/hooks/use-planned-sessions';
import {
  auditUpcomingSessions,
  countSessionsLoadingZone,
  zoneAuditLabel,
} from '@sharpit/app/lib/physical-health/sensitive-zone-audit';
import {
  sensitiveZonesFrom,
  unmappedSensitiveZones,
  type SensitiveZone,
} from '@sharpit/app/lib/physical-health/sensitive-zones';
import { useClientNow } from '@/hooks/use-client-now';
import { ZoneFollowUpStrip } from '@/components/physical-health/cards/zone-follow-up-strip';
import { cn } from '@sharpit/app/lib/utils';

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'IMPROVING') {
    return <TrendingDown className="text-primary size-3.5" />;
  }
  if (trend === 'WORSENING') {
    return <TrendingUp className="text-signal-risk size-3.5" />;
  }
  return <Minus className="text-muted-foreground size-3.5" />;
}

function sparklineBarClass(tone: CorpsTone): string {
  if (tone === 'ok') {
    return 'bg-primary/60';
  }
  if (tone === 'watch') {
    return 'bg-amber-400/70';
  }
  if (tone === 'attention') {
    return 'bg-signal-risk/70';
  }
  return 'bg-muted-foreground/40';
}

function SeveritySparkline({
  points,
}: {
  points: Array<{ date: string; severity: number | null }>;
}) {
  const valid = points.filter((p) => p.severity !== null) as Array<{
    date: string;
    severity: number;
  }>;
  if (valid.length < 2) {
    return <p className="text-muted-foreground text-xs">Pas assez de données pour le graphe.</p>;
  }

  const max = Math.max(...valid.map((p) => p.severity), 1);

  return (
    <div className="flex items-end gap-px" style={{ height: 48 }}>
      {valid.map((p, i) => {
        const h = Math.max(2, (p.severity / max) * 48);
        const tone = corpsToneFromPhysicalSeverity(p.severity);
        return (
          <div
            key={i}
            className={cn('flex-1 rounded-t-sm', sparklineBarClass(tone))}
            style={{ height: h }}
            title={`${p.date}: ${p.severity}`}
          />
        );
      })}
    </div>
  );
}

export function ConditionCardHeader({
  condition,
  tone,
}: {
  condition: PhysicalHealthConditionCard;
  tone: CorpsTone;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="text-xs" variant="outline">
            {condition.typeLabel}
          </Badge>
          <Badge className="text-xs" variant="secondary">
            {condition.statusLabel}
          </Badge>
        </div>
        <h3 className="text-section-title">{condition.label}</h3>
        <p className="text-muted-foreground text-xs">
          {condition.bodyRegion}
          {condition.sideLabel ? ` · ${condition.sideLabel}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className={cn('text-data text-2xl font-semibold', CORPS_TONE_TEXT[tone])}>
          {condition.severity.toFixed(1)}
        </p>
        <p className="text-label text-muted-foreground">sévérité inférée</p>
      </div>
    </div>
  );
}

export function ConditionMetaChips({ condition }: { condition: PhysicalHealthConditionCard }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {condition.trendLabel ? (
        <span className="bg-muted/60 inline-flex items-center gap-1 rounded-full px-2.5 py-1">
          <TrendIcon trend={condition.trend} />
          {condition.trendLabel}
        </span>
      ) : null}
      {condition.functionalCapacityLabel ? (
        <span className="bg-muted/60 inline-flex items-center rounded-full px-2.5 py-1">
          {condition.functionalCapacityLabel}
        </span>
      ) : null}
      <span className="bg-muted/60 inline-flex items-center rounded-full px-2.5 py-1">
        Confiance {condition.confidencePct}%
      </span>
    </div>
  );
}

export function ConditionExpandedBody({ condition }: { condition: PhysicalHealthConditionCard }) {
  return (
    <CardContent className="space-y-3 pt-0">
      {condition.estimatedRecoveryDays !== null && condition.isActive ? (
        <p className="text-muted-foreground text-xs">
          Estimation de retour au baseline : ~{condition.estimatedRecoveryDays} jours
          <span className="block text-xs opacity-80">
            Estimation basée sur l&apos;évolution récente — pas une promesse médicale.
          </span>
        </p>
      ) : null}

      {condition.timelinePreview.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-label text-muted-foreground">Timeline récente</p>
          <ul className="space-y-1">
            {condition.timelinePreview.map((event, i) => (
              <li key={i} className="text-muted-foreground text-xs">
                <span className="text-foreground/80 font-medium">{event.at}</span> — {event.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CardContent>
  );
}

/**
 * Says the condition is owed news, and why — the follow-up no longer waits for
 * the coach model to think of asking (volet A).
 */
function ReassessmentDueChip({ due }: { due: ReassessmentDue }) {
  const label =
    due.trigger === 'after_session'
      ? 'Nouvelles attendues après ta séance'
      : `Sans nouvelles depuis ${due.daysSinceLastObservation} jours`;

  return (
    <span className="bg-signal-caution/12 text-signal-caution inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium">
      {label}
    </span>
  );
}

/** Deterministic follow-up state for the legacy note behind this condition. */
function useConditionReassessmentDue(
  legacyNoteId: string | null,
  now: Date | null,
): ReassessmentDue | null {
  const notesQuery = usePhysicalNotes();
  const note = legacyNoteId ? notesQuery.data?.find((n) => n.id === legacyNoteId) : undefined;
  if (!note || !now) {
    return null;
  }
  return reassessmentDue({ note, lastRealisedSessionAt: null, now });
}

function conditionZones(condition: PhysicalHealthConditionCard): SensitiveZone[] {
  return sensitiveZonesFrom([
    {
      label: condition.label,
      bodyRegion: condition.bodyRegion,
      severity: condition.severity,
      type: condition.type,
      affectsTraining: condition.affectsTraining,
      status: condition.isActive ? 'ACTIVE' : 'RESOLVED',
    },
  ]);
}

/**
 * Declaring an injury must change what the athlete sees about the plan they
 * already have — not only the sessions generated afterwards.
 */
function useUpcomingSessionsLoadingZone(
  condition: PhysicalHealthConditionCard,
  now: Date | null,
): number {
  const sessionsQuery = usePlannedSessions();
  const zones = conditionZones(condition);
  if (!now || zones.length === 0) {
    return 0;
  }
  const audits = auditUpcomingSessions({ sessions: sessionsQuery.data ?? [], zones, now });
  return countSessionsLoadingZone(audits, condition.label);
}

function ZoneLoadChip({ count }: { count: number }) {
  const label = zoneAuditLabel(count);
  if (!label) {
    return null;
  }
  return (
    <span className="bg-signal-vo2/12 text-signal-vo2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium">
      {label}
    </span>
  );
}

/**
 * The catalog vocabulary does not know this body region, so no automatic check
 * can fire on it. Silence here would read as an all-clear.
 */
function ZoneUnverifiableChip({ unverifiable }: { unverifiable: boolean }) {
  if (!unverifiable) {
    return null;
  }
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium">
      Zone non reconnue — vérification automatique indisponible
    </span>
  );
}

function ConditionCardChips({
  due,
  loadingCount,
  unverifiable,
}: {
  due: ReassessmentDue | null;
  loadingCount: number;
  unverifiable: boolean;
}) {
  if (!due && loadingCount <= 0 && !unverifiable) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5 pb-2">
      {due ? <ReassessmentDueChip due={due} /> : null}
      <ZoneLoadChip count={loadingCount} />
      <ZoneUnverifiableChip unverifiable={unverifiable} />
    </div>
  );
}

export function ConditionCardActions({
  condition,
  onEditLegacy,
}: {
  condition: PhysicalHealthConditionCard;
  onEditLegacy?: (legacyNoteId: string) => void;
}) {
  const now = useClientNow();
  const due = useConditionReassessmentDue(condition.legacyPhysicalNoteId, now);
  const loadingCount = useUpcomingSessionsLoadingZone(condition, now);
  const unverifiable = unmappedSensitiveZones(conditionZones(condition)).length > 0;

  return (
    <CardContent className="pt-0">
      <ZoneFollowUpStrip legacyNoteId={condition.legacyPhysicalNoteId} />
      <ConditionCardChips due={due} loadingCount={loadingCount} unverifiable={unverifiable} />
      <div className="flex flex-wrap gap-2 pt-1">
        {condition.legacyPhysicalNoteId && onEditLegacy ? (
          <button
            className="bg-highlight text-highlight-foreground hover:bg-highlight/90 inline-flex min-h-11 items-center rounded-full px-4 py-2 text-xs font-semibold transition-colors lg:min-h-9 lg:px-3.5 lg:py-1.5"
            type="button"
            onClick={() => onEditLegacy(condition.legacyPhysicalNoteId!)}
          >
            {due ? 'Donner des nouvelles' : 'Ajouter une observation'}
          </button>
        ) : null}
        {condition.legacyPhysicalNoteId && condition.isActive ? (
          <DiscussWithCoachButton
            size="sm"
            target={{
              kind: 'physical-condition',
              noteId: condition.legacyPhysicalNoteId,
            }}
          />
        ) : null}
        <ConditionDetailDialog condition={condition} />
      </div>
    </CardContent>
  );
}

function ConditionDetailDialogBody({ condition }: { condition: PhysicalHealthConditionCard }) {
  const tone = corpsToneFromPhysicalSeverity(condition.severity);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-baseline gap-3">
        <span className={cn('text-data text-3xl font-semibold', CORPS_TONE_TEXT[tone])}>
          {condition.severity.toFixed(1)}
        </span>
        <span className="text-muted-foreground text-sm">sévérité inférée</span>
      </div>

      <ConditionMetaChips condition={condition} />
      <span className="bg-muted/60 inline-flex items-center rounded-full px-2.5 py-1 text-xs">
        {condition.observationCount} observation{condition.observationCount > 1 ? 's' : ''}
      </span>

      <div className="space-y-1.5">
        <p className="text-label text-muted-foreground">Évolution de la sévérité</p>
        <SeveritySparkline points={condition.sparkline} />
      </div>

      {condition.timelinePreview.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-label text-muted-foreground">Observations récentes</p>
          <ul className="space-y-1">
            {condition.timelinePreview.map((event, i) => (
              <li key={i} className="text-muted-foreground text-xs">
                <span className="text-foreground/80 font-medium">{event.at}</span> — {event.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {condition.estimatedRecoveryDays !== null && condition.isActive ? (
        <p className="text-muted-foreground text-xs">
          Retour au baseline estimé : ~{condition.estimatedRecoveryDays} jours
        </p>
      ) : null}
    </div>
  );
}

function ConditionDetailDialog({ condition }: { condition: PhysicalHealthConditionCard }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="chip-surface text-foreground/80 hover:text-foreground inline-flex min-h-11 items-center rounded-full px-4 py-2 text-xs font-medium transition-colors lg:min-h-9 lg:px-3.5 lg:py-1.5">
        Voir le détail
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{condition.label}</DialogTitle>
          <p className="text-muted-foreground text-sm">
            {condition.bodyRegion}
            {condition.sideLabel ? ` · ${condition.sideLabel}` : ''} · {condition.typeLabel}
          </p>
        </DialogHeader>
        <ConditionDetailDialogBody condition={condition} />
      </DialogContent>
    </Dialog>
  );
}
