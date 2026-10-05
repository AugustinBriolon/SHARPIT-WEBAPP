import { BodySide, PhysicalCategory, PhysicalStatus } from '@prisma/client';
import { corpsToneFromPhysicalSeverity } from '@sharpit/app/lib/health/health-status';
import { CORPS_TONE_TEXT } from '@sharpit/app/lib/ui/metric-tone';

export const categoryLabels: Record<PhysicalCategory, string> = {
  PAIN: 'Douleur',
  INJURY: 'Blessure',
  MOBILITY: 'Mobilité',
  POSTURE: 'Posture',
  OTHER: 'Autre',
};

export const categoryOrder: PhysicalCategory[] = ['PAIN', 'INJURY', 'MOBILITY', 'POSTURE', 'OTHER'];

export const statusLabels: Record<PhysicalStatus, string> = {
  ACTIVE: 'Active',
  MONITORING: 'Sous surveillance',
  RESOLVED: 'Résolue',
};

export const statusOrder: PhysicalStatus[] = ['ACTIVE', 'MONITORING', 'RESOLVED'];

/** Badge de workflow (statut de suivi) — neutre, distinct des teintes de sévérité. */
export const statusBadgeClass: Record<PhysicalStatus, string> = {
  ACTIVE: 'bg-muted text-muted-foreground',
  MONITORING: 'bg-muted text-foreground/75',
  RESOLVED: 'bg-muted/70 text-muted-foreground/80',
};

export const sideLabels: Record<BodySide, string> = {
  LEFT: 'Gauche',
  RIGHT: 'Droit',
  BILATERAL: 'Bilatéral',
  NA: '—',
};

export const sideOrder: BodySide[] = ['NA', 'LEFT', 'RIGHT', 'BILATERAL'];

/**
 * The body parts offered when declaring a zone. Every one is known to the region lexicon
 * (`catalogGroupsForRegion`), so a zone picked here is always checked against the plan — a
 * free-text region the lexicon misses escapes that check silently.
 */
export const COMMON_BODY_PARTS = [
  'Pied',
  'Cheville',
  "Tendon d'Achille",
  'Mollet',
  'Tibia',
  'Genou',
  'Quadriceps',
  'Ischio',
  'Adducteurs',
  'Hanche',
  'Fessier',
  'Psoas',
  'Bassin',
  'Abdominaux',
  'Lombaires',
  'Dos',
  'Trapèzes',
  'Épaule',
  'Pectoraux',
  'Cou',
  'Bras',
  'Coude',
  'Poignet',
];

/** Couleur de sévérité 0–10 — via corpsToneFromPhysicalSeverity (health-status). */
export function severityColor(severity?: number | null): string {
  return CORPS_TONE_TEXT[corpsToneFromPhysicalSeverity(severity)];
}
