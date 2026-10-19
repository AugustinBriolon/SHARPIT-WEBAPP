import type { AthleteLocale } from '@sharpit/shared/locale';
import { ActivityType, SessionIntensity } from '@prisma/client';

export const intensityOrder: SessionIntensity[] = [
  'RECOVERY',
  'ENDURANCE',
  'TEMPO',
  'THRESHOLD',
  'VO2MAX',
  'RACE',
];

export const intensityLabels: Record<SessionIntensity, string> = {
  RECOVERY: 'Récupération',
  ENDURANCE: 'Endurance',
  TEMPO: 'Tempo',
  THRESHOLD: 'Seuil',
  VO2MAX: 'VO2max',
  RACE: 'Compétition',
};

/** The same intensities in each language SharpIt speaks (ADR-096). */
export const intensityLabelsIn: Record<AthleteLocale, Record<SessionIntensity, string>> = {
  fr: intensityLabels,
  en: {
    RECOVERY: 'Recovery',
    ENDURANCE: 'Endurance',
    TEMPO: 'Tempo',
    THRESHOLD: 'Threshold',
    VO2MAX: 'VO2max',
    RACE: 'Race',
  },
};

/** Classes Tailwind (texte) par intensité — alignées sur les signaux Seed. */
export const intensityTextColors: Record<SessionIntensity, string> = {
  RECOVERY: 'text-[var(--color-signal-recovery)]',
  ENDURANCE: 'text-[var(--color-signal-base)]',
  TEMPO: 'text-[var(--color-signal-tempo)]',
  THRESHOLD: 'text-[var(--color-signal-threshold)]',
  VO2MAX: 'text-[var(--color-signal-vo2)]',
  RACE: 'text-primary',
};

/** Couleur de référence (CSS) par intensité, pour les accents/points. */
export const intensityAccent: Record<SessionIntensity, string> = {
  RECOVERY: 'var(--color-signal-recovery)',
  ENDURANCE: 'var(--color-signal-base)',
  TEMPO: 'var(--color-signal-tempo)',
  THRESHOLD: 'var(--color-signal-threshold)',
  VO2MAX: 'var(--color-signal-vo2)',
  RACE: 'var(--color-primary)',
};

/** Sports autorisés pour une étape de brick (pas triathlon ni muscu). */
export const brickLegActivityTypes: ActivityType[] = [
  ActivityType.BIKE,
  ActivityType.RUN,
  ActivityType.SWIM,
  ActivityType.OTHER,
];

export function intensityLabel(intensity: SessionIntensity | null): string {
  return intensity ? intensityLabels[intensity] : '—';
}

export const exposureLabels: Record<'INDOOR' | 'OUTDOOR' | 'UNKNOWN', string> = {
  UNKNOWN: 'À confirmer',
  OUTDOOR: 'Extérieur',
  INDOOR: 'Intérieur / home trainer',
};

export function formatPlannedDuration(min?: number | null): string {
  if (min === undefined || min === null) {
    return '—';
  }
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) {
    return `${h}h${m.toString().padStart(2, '0')}`;
  }
  return `${m} min`;
}
