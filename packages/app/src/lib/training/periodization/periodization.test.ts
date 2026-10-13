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

  it('writes the generator constraints for the days in the window', () => {
    const lines = stepRaceConstraintLines([bRace, cRace], addDays(bRace.date, -3), 7);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/mini-affûtage.*course le.*récupération/);
  });
});
