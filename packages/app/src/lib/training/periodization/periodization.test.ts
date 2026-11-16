import { addDays, addWeeks } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  B_RACE_RECOVERY_DAYS,
  B_RACE_TAPER_DAYS,
  findPlanWeekForDate,
  generateMacroPlan,
  stepRaceConstraintLines,
  stepRaceDayModifiers,
} from './periodization';

const START = new Date('2026-01-05T00:00:00'); // un lundi

describe('generateMacroPlan', () => {
  it("génère une semaine par semaine jusqu'à la course incluse", () => {
    const raceDate = addWeeks(START, 11); // 12 semaines
    const plan = generateMacroPlan({ raceDate, startDate: START, baselineCtl: 50 });
    expect(plan.totalWeeks).toBe(12);
    expect(plan.weeks).toHaveLength(12);
    expect(plan.weeks[0].weekIndex).toBe(0);
  });

  it('termine toujours par une semaine de course et un taper avant', () => {
    const plan = generateMacroPlan({
      raceDate: addWeeks(START, 15),
      startDate: START,
      baselineCtl: 45,
    });
    const phases = plan.weeks.map((w) => w.phase);
    expect(phases[phases.length - 1]).toBe('RACE');
    expect(phases).toContain('TAPER');
    expect(phases).toContain('BASE');
    expect(phases).toContain('BUILD');
  });

  it('borne la charge cible et réduit pendant le taper', () => {
    const plan = generateMacroPlan({
      raceDate: addWeeks(START, 11),
      startDate: START,
      baselineCtl: 60,
    });
    for (const w of plan.weeks) {
      expect(w.targetLoad).toBeGreaterThanOrEqual(20);
      expect(w.targetLoad).toBeLessThanOrEqual(900);
    }
    const peak = plan.weeks.find((w) => w.phase === 'PEAK')?.targetLoad ?? 0;
    const race = plan.weeks.find((w) => w.phase === 'RACE')?.targetLoad ?? 0;
    expect(race).toBeLessThan(peak);
  });

  it('lève une erreur si la course est dans le passé', () => {
    expect(() =>
      generateMacroPlan({
        raceDate: addWeeks(START, -2),
        startDate: START,
        baselineCtl: 40,
      }),
    ).toThrow();
  });
});

describe('findPlanWeekForDate', () => {
  it('retrouve la semaine contenant la date', () => {
    const plan = generateMacroPlan({
      raceDate: addWeeks(START, 11),
      startDate: START,
      baselineCtl: 50,
    });
    const target = addWeeks(START, 3);
    const week = findPlanWeekForDate(plan.weeks, target);
    expect(week?.weekIndex).toBe(3);
  });

  it('renvoie undefined hors plan', () => {
    const plan = generateMacroPlan({
      raceDate: addWeeks(START, 5),
      startDate: START,
      baselineCtl: 50,
    });
    expect(findPlanWeekForDate(plan.weeks, addWeeks(START, 40))).toBeUndefined();
  });
});

describe('step races (B/C)', () => {
  const raceDate = addWeeks(START, 23);
  const bRace = { title: 'Triathlon L', date: addDays(START, 7 * 8 + 6), priority: 'B' as const };
  const cRace = { title: '10 km', date: addDays(START, 7 * 4 + 5), priority: 'C' as const };

  it('gives a B race a mini-taper before and recovery after', () => {
    const days = stepRaceDayModifiers(bRace);
    expect(days.filter((d) => d.kind === 'MINI_TAPER')).toHaveLength(B_RACE_TAPER_DAYS);
    expect(days.filter((d) => d.kind === 'RECOVERY')).toHaveLength(B_RACE_RECOVERY_DAYS);
    for (const d of days.filter((day) => day.kind === 'MINI_TAPER')) {
      expect(d.loadFactor).toBeGreaterThanOrEqual(0.6);
      expect(d.loadFactor).toBeLessThanOrEqual(0.7);
    }
  });

  it('gives a C race no taper — it is the hard session', () => {
    expect(stepRaceDayModifiers(cRace).map((d) => d.kind)).toEqual(['HARD_SESSION']);
  });

  it('lowers the B race week and the next, keeps the A target and leaves C load alone', () => {
    const plain = generateMacroPlan({ raceDate, startDate: START, baselineCtl: 50 });
    const stepped = generateMacroPlan({
      raceDate,
      startDate: START,
      baselineCtl: 50,
      stepRaces: [bRace, cRace],
    });
    expect(stepped.weeks).toHaveLength(plain.weeks.length);
    expect(stepped.weeks[8].targetLoad).toBeLessThan(plain.weeks[8].targetLoad);
    expect(stepped.weeks[9].targetLoad).toBeLessThan(plain.weeks[9].targetLoad);
    expect(stepped.weeks[8].focus).toContain('Course étape');
    expect(stepped.weeks[4].targetLoad).toBe(plain.weeks[4].targetLoad);
    expect(stepped.weeks[4].focus).toContain("Course d'entraînement");
    expect(stepped.weeks.at(-1)).toEqual(plain.weeks.at(-1));
    expect(stepped.summary).toContain('Triathlon L');
  });

  it('drops the deload that follows a B race recovery week', () => {
    const start = new Date('2026-11-16T00:00:00');
    const plan = generateMacroPlan({
      raceDate: new Date('2027-10-10T00:00:00'),
      startDate: start,
      baselineCtl: 34,
      demands: { peakWeeklyHours: 13, longRideHours: 5, longRunHours: 2.5 },
      stepRaces: [{ title: 'L', date: new Date('2027-04-25T10:00:00'), priority: 'B' }],
    });
    const [steady, raceWeek, recovery, held, next] = plan.weeks.slice(21, 26);
    expect(raceWeek.focus).toContain('Course étape');
    expect(recovery.targetLoad).toBeLessThan(steady.targetLoad);
    expect(held.isDeload).toBe(false);
    expect(held.targetLoad).toBeGreaterThanOrEqual(steady.targetLoad);
    expect(next.targetLoad / held.targetLoad).toBeLessThanOrEqual(1.08);
    // Deloads away from the race are untouched.
    expect(plan.weeks[20].isDeload).toBe(true);
    expect(plan.weeks[28].isDeload).toBe(true);
  });

  it('writes the generator constraints for the days in the window', () => {
    const lines = stepRaceConstraintLines([bRace, cRace], addDays(bRace.date, -3), 7);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/mini-affûtage.*course le.*récupération/);
  });
});

// ADR-133: a race with known demands pulls the plan toward them.
describe('generateMacroPlan toward a race’s demands', () => {
  const XXL = { peakWeeklyHours: 13, longRideHours: 5, longRunHours: 2.5 };
  // The prod case: 47 weeks to a full-distance triathlon, from a CTL of 46 (about 5 h 45 a week).
  const plan = generateMacroPlan({
    raceDate: addWeeks(START, 46),
    startDate: START,
    baselineCtl: 46,
    demands: XXL,
  });
  const growth = plan.weeks.filter((w) => ['BASE', 'BUILD', 'PEAK'].includes(w.phase));
  const steady = growth.filter((w) => !w.isDeload);

  it('starts from what the athlete does today', () => {
    expect(plan.weeks[0]!.targetHours).toBeCloseTo((46 * 7) / 55, 1);
  });

  it('reaches the race’s peak on the last specific week', () => {
    expect(growth[growth.length - 1]!.targetHours).toBeCloseTo(13, 1);
    expect(Math.max(...plan.weeks.map((w) => w.targetHours))).toBeCloseTo(13, 1);
  });

  it('never drops between two steady weeks, nor climbs faster than the cap', () => {
    for (let i = 1; i < steady.length; i++) {
      expect(steady[i]!.targetLoad).toBeGreaterThanOrEqual(steady[i - 1]!.targetLoad);
      expect(steady[i]!.targetLoad).toBeLessThanOrEqual(steady[i - 1]!.targetLoad * 1.08 + 1);
    }
  });

  // Seen on the first regenerated prod plan: from a low start, the step across a deload week
  // reached +10 % because the deload took a slot of the line.
  it('holds the cap from one steady week to the next across a deload, from a low start', () => {
    const low = generateMacroPlan({
      raceDate: addWeeks(START, 46),
      startDate: START,
      baselineCtl: 34,
      demands: XXL,
    });
    const steadyLow = low.weeks.filter(
      (w) => ['BASE', 'BUILD', 'PEAK'].includes(w.phase) && !w.isDeload,
    );
    for (let i = 1; i < steadyLow.length; i++) {
      expect(steadyLow[i]!.targetLoad).toBeLessThanOrEqual(steadyLow[i - 1]!.targetLoad * 1.08 + 1);
    }
    expect(steadyLow[steadyLow.length - 1]!.targetHours).toBeCloseTo(13, 1);
  });

  it('keeps deload weeks lighter than the week before', () => {
    const deloads = growth.filter((w) => w.isDeload);
    expect(deloads.length).toBeGreaterThan(5);
    for (const deload of deloads) {
      expect(deload.targetLoad).toBeLessThan(plan.weeks[deload.weekIndex - 1]!.targetLoad);
    }
  });

  it('reads the taper and the race week from the peak reached', () => {
    const taper = plan.weeks.filter((w) => w.phase === 'TAPER').map((w) => w.targetHours);
    expect(taper[0]).toBeLessThan(13);
    expect(taper[taper.length - 1]).toBeCloseTo(13 * 0.35, 0);
    expect(plan.weeks[plan.weeks.length - 1]!.targetHours).toBeCloseTo(13 * 0.25, 0);
  });

  it('names the long ride and run to reach, growing to the race-prep length', () => {
    expect(steady[0]!.focus).toContain(
      "Sortie longue vélo jusqu'à 2 h 30, course longue jusqu'à 1 h 15",
    );
    expect(steady[steady.length - 1]!.focus).toContain(
      "Sortie longue vélo jusqu'à 5 h, course longue jusqu'à 2 h 30",
    );
    expect(growth.find((w) => w.isDeload)!.focus).not.toContain('Sortie longue');
  });

  it('says in the summary where the volume goes', () => {
    expect(plan.summary).toContain('Volume porté de 5 h 45 à 13 h par semaine.');
  });

  it('stops under the peak, and says so, when the race is too close', () => {
    const short = generateMacroPlan({
      raceDate: addWeeks(START, 9),
      startDate: START,
      baselineCtl: 46,
      demands: XXL,
    });
    const top = Math.max(...short.weeks.map((w) => w.targetHours));
    expect(top).toBeLessThan(13);
    expect(short.summary).toContain('le temps restant ne permet pas d');
  });

  it('holds the volume of an athlete already above the peak', () => {
    const fit = generateMacroPlan({
      raceDate: addWeeks(START, 30),
      startDate: START,
      baselineCtl: 120,
      demands: XXL,
    });
    const steadyFit = fit.weeks.filter(
      (w) => ['BASE', 'BUILD', 'PEAK'].includes(w.phase) && !w.isDeload,
    );
    expect(new Set(steadyFit.map((w) => w.targetLoad)).size).toBe(1);
  });

  it('leaves a plan without demands exactly as before', () => {
    const before = generateMacroPlan({
      raceDate: addWeeks(START, 46),
      startDate: START,
      baselineCtl: 46,
    });
    const explicit = generateMacroPlan({
      raceDate: addWeeks(START, 46),
      startDate: START,
      baselineCtl: 46,
      demands: null,
    });
    expect(explicit).toEqual(before);
    expect(Math.max(...before.weeks.map((w) => w.targetHours))).toBeLessThan(7);
  });
});
