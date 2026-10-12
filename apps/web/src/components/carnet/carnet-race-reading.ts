import type { RaceAnalysisLeg, RaceLegPacing } from '@sharpit/app/lib/activity/race-analysis-types';
import { formatPace, formatSwimPace } from '@sharpit/app/lib/format';
import { formatChronoSeconds } from '@sharpit/app/lib/goals/goal-metric-config';

/** Same zone inks as the activity analysis (`--color-chart-1…5`), Z1 to Z5. */
export const HR_ZONES = [1, 2, 3, 4, 5].map((n) => ({
  label: `Z${n}`,
  color: `var(--color-chart-${n})`,
}));

/** « 2:12 sous l'objectif », « 3:05 au-dessus de l'objectif », « Pile sur l'objectif ». */
export function targetDeltaText(deltaSec: number | null): string | null {
  if (deltaSec === null) {
    return null;
  }
  const rounded = Math.round(deltaSec);
  if (rounded === 0) {
    return "Pile sur l'objectif";
  }
  const gap = formatChronoSeconds(Math.abs(rounded));
  return rounded < 0 ? `${gap} sous l'objectif` : `${gap} au-dessus de l'objectif`;
}

export function pacingValueText(value: number, unit: RaceLegPacing['unit']): string {
  switch (unit) {
    case 'sec_per_100m':
      return formatSwimPace(value);
    case 'sec_per_km':
      return formatPace(value);
    case 'kmh':
      return `${value.toFixed(1).replace('.', ',')} km/h`;
  }
}

/** A signed percentage in French: « +4,3 % », « −1,0 % » (zero reads « +0,0 % »). */
export function signedPctText(pct: number): string {
  const sign = pct < 0 ? '−' : '+';
  return `${sign}${Math.abs(pct).toFixed(1).replace('.', ',')} %`;
}

/** What the change between halves means: the sign is already « + = slower » for every sport. */
export function pacingVerdict(changePct: number): string {
  if (Math.abs(changePct) < 2) {
    return 'allure tenue';
  }
  return changePct > 0 ? 'ralenti en 2e moitié' : 'accéléré en 2e moitié';
}

/** Each zone's share of the leg's time with a heart rate, 0–1; empty when none was recorded. */
export function zoneShares(hrZonesSec: readonly number[]): number[] {
  const total = hrZonesSec.reduce((sum, sec) => sum + sec, 0);
  return total > 0 ? hrZonesSec.map((sec) => sec / total) : [];
}

/** Legs worth a row in a block: those carrying what the block reads. */
export function legsWithZones(legs: readonly RaceAnalysisLeg[]): RaceAnalysisLeg[] {
  return legs.filter((leg) => leg.hrZonesSec && zoneShares(leg.hrZonesSec).length > 0);
}

export function legsWithPacing(
  legs: readonly RaceAnalysisLeg[],
): Array<RaceAnalysisLeg & { pacing: RaceLegPacing }> {
  return legs.filter(
    (leg): leg is RaceAnalysisLeg & { pacing: RaceLegPacing } =>
      leg.kind !== 'transition' && leg.pacing !== null,
  );
}

/** Aerobic decoupling on the run, read for the athlete: under 5 % the heart held the pace. */
export function runDriftText(driftPct: number | null): string | null {
  if (driftPct === null) {
    return null;
  }
  const held = driftPct < 5;
  return `Découplage cardiaque en course à pied : ${signedPctText(driftPct)}. ${
    held
      ? "Le cœur a tenu l'allure jusqu'au bout."
      : "Le cœur a dérivé à allure égale : l'endurance en fin de course est une piste de progrès."
  }`;
}
