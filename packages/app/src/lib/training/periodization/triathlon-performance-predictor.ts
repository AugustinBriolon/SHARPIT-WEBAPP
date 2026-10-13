/**
 * Triathlon formats (distances, race defaults) and the flat-road power → speed estimate the
 * race finish projection (goal-race-projection) builds on.
 */

export type TriathlonFormat = 'sprint' | 'olympic' | 'half' | 'full';

export type FormatSpec = {
  readonly swimM: number;
  readonly bikeM: number;
  readonly runM: number;
  /** Amateur age-group transition times, used until the athlete's own races replace them. */
  readonly defaultT1Sec: number;
  readonly defaultT2Sec: number;
  /** Race bike intensity vs FTP. */
  readonly bikeIf: number;
  /**
   * Off-the-bike slowdown on a Riegel'd standalone pace. Riegel already prices the distance, so
   * this is only the bike's fatigue: small on a sprint, growing with the ride (half ≈ 1.03–1.05).
   */
  readonly brickRunFactor: number;
};

const FORMAT_SPECS: Record<TriathlonFormat, FormatSpec> = {
  sprint: {
    swimM: 750,
    bikeM: 20_000,
    runM: 5000,
    defaultT1Sec: 180,
    defaultT2Sec: 120,
    bikeIf: 0.85,
    brickRunFactor: 1.02,
  },
  olympic: {
    swimM: 1500,
    bikeM: 40_000,
    runM: 10_000,
    defaultT1Sec: 240,
    defaultT2Sec: 150,
    bikeIf: 0.8,
    brickRunFactor: 1.03,
  },
  half: {
    swimM: 1900,
    bikeM: 90_000,
    runM: 21_097,
    defaultT1Sec: 360,
    defaultT2Sec: 240,
    bikeIf: 0.75,
    brickRunFactor: 1.04,
  },
  full: {
    swimM: 3800,
    bikeM: 180_000,
    runM: 42_195,
    defaultT1Sec: 480,
    defaultT2Sec: 300,
    bikeIf: 0.7,
    brickRunFactor: 1.06,
  },
};

function matchesHalfIron(haystack: string): boolean {
  return (
    /\b70\.3\b/.test(haystack) ||
    /\bhalf\s*iron/.test(haystack) ||
    /\bhalf[\s-]*im\b/.test(haystack) ||
    (/\btriathlon\b/.test(haystack) && /\bhalf\b/.test(haystack))
  );
}

function matchesFullIron(haystack: string): boolean {
  return /\bironman\b/.test(haystack) || /\bfull\s*(iron|distance)\b/.test(haystack);
}

function matchesOlympic(haystack: string): boolean {
  return /\bolympique\b/.test(haystack) || /\bolympic\b/.test(haystack);
}

function matchesSprint(haystack: string): boolean {
  return (
    /\bsprint\b/.test(haystack) && (/\btriathlon\b/.test(haystack) || /\btri\b/.test(haystack))
  );
}

/** Resolve Half / 70.3 / Olympic / Ironman / Sprint from free-text format or title. */
export function resolveTriathlonFormat(
  raceFormat: string | null,
  title: string | null,
): TriathlonFormat | null {
  const haystack = [raceFormat, title].filter(Boolean).join(' · ').toLowerCase();
  if (!haystack.trim()) {
    return null;
  }
  if (matchesHalfIron(haystack)) {
    return 'half';
  }
  if (matchesFullIron(haystack)) {
    return 'full';
  }
  if (matchesOlympic(haystack)) {
    return 'olympic';
  }
  if (matchesSprint(haystack)) {
    return 'sprint';
  }
  return null;
}

export function triathlonDistances(format: TriathlonFormat): FormatSpec {
  return FORMAT_SPECS[format];
}

/**
 * Flat-road power → speed (m/s). CdA / Crr are typical triathlon TT assumptions.
 * Iterative solve of P ≈ 0.5·ρ·CdA·v³ + Crr·m·g·v.
 */
export function estimateBikeSpeedMsFromPower(watts: number, weightKg: number): number {
  const rho = 1.225;
  const cda = 0.3;
  const crr = 0.005;
  const g = 9.81;
  let v = 10;
  for (let i = 0; i < 12; i++) {
    const aero = 0.5 * rho * cda * v * v * v;
    const roll = crr * weightKg * g * v;
    const p = aero + roll;
    const dp = 1.5 * rho * cda * v * v + crr * weightKg * g;
    if (dp <= 0) {
      break;
    }
    v = Math.max(1, v - (p - watts) / dp);
  }
  return v;
}
