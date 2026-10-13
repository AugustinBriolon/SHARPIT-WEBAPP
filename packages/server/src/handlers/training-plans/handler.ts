import { startOfDay } from 'date-fns';
import { NextResponse } from 'next/server';
import { loadAthletePmcAnchor } from '@sharpit/server/lib/training/pmc/pmc-server';
import { generateMacroPlan, type StepRace } from '@sharpit/app/lib/training/periodization';
import {
  planStepRaces,
  planTargetRace,
  toPrioritizedRaces,
} from '@sharpit/app/lib/goals/goal-priority';
import { prisma } from '@sharpit/db/client';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  archiveActiveTrainingPlans,
  createTrainingPlan,
  getActiveTrainingPlan,
  getGoalById,
  getGoals,
} from '@sharpit/server/lib/queries';
import { listTravelContexts } from '@sharpit/server/lib/travel-context/service';
import { applyTravelConstraintsToMacroWeeks } from '@sharpit/app/lib/travel-context/training-constraint';
import { z } from 'zod';

const createPlanSchema = z.object({
  goalId: z.string().min(1),
});

async function buildTravelAdjustedPlan(
  athleteId: string,
  raceDate: Date,
  baselineCtl: number,
  stepRaces: StepRace[],
) {
  const draft = generateMacroPlan({ raceDate, baselineCtl, stepRaces });
  const travels = await listTravelContexts(prisma, athleteId);
  const weeks = applyTravelConstraintsToMacroWeeks(
    draft.weeks,
    travels.map((t) => ({
      startDate: t.startDate,
      endDate: t.endDate,
      label: t.label,
      trainingConstraint: t.trainingConstraint,
      allowedDisciplines: t.allowedDisciplines,
    })),
  );
  const travelAdjusted = weeks.some(
    (w, i) => w.targetLoad !== draft.weeks[i]?.targetLoad || w.focus !== draft.weeks[i]?.focus,
  );
  const summary = travelAdjusted
    ? `${draft.summary} Semaines ajustées selon les déplacements (contrainte d’entraînement).`
    : draft.summary;
  return { draft, weeks, summary };
}

export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    const plan = await getActiveTrainingPlan(athleteId);
    return NextResponse.json(plan);
  } catch (error) {
    console.error('[training-plans]', error);
    return NextResponse.json({ error: 'Impossible de charger le macro-plan' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'goalId requis' }, { status: 400 });
    }

    const athleteId = await getCurrentAthleteId();
    const [requested, goals] = await Promise.all([
      getGoalById(athleteId, parsed.data.goalId),
      getGoals(athleteId),
    ]);
    if (!requested?.targetDate) {
      return NextResponse.json(
        { error: 'Objectif introuvable ou sans date cible' },
        { status: 400 },
      );
    }

    // ADR-084: a plan asked for a B/C race builds toward its A race, the B/C races become steps.
    const races = toPrioritizedRaces(goals);
    const requestedRace = races.find((r) => r.id === requested.id);
    const target = requestedRace ? planTargetRace(requestedRace, races) : null;
    const goal = goals.find((g) => g.id === target?.id && g.targetDate) ?? requested;
    const raceDate = startOfDay(goal.targetDate ?? requested.targetDate);
    const stepRaces = target ? planStepRaces(target, races, startOfDay(new Date())) : [];

    if (raceDate < startOfDay(new Date())) {
      return NextResponse.json({ error: 'La date de course est passée' }, { status: 400 });
    }

    // This scales the entire macro-plan: periodization derives the weekly load as
    // baselineCtl * 7. A truncated history here understates every week of the plan.
    const anchor = await loadAthletePmcAnchor(athleteId);
    const baselineCtl = anchor ? Math.round(anchor.ctl) : 40;

    const { draft, weeks, summary } = await buildTravelAdjustedPlan(
      athleteId,
      raceDate,
      baselineCtl,
      stepRaces,
    );

    await archiveActiveTrainingPlans(athleteId);

    const plan = await createTrainingPlan(athleteId, {
      goalId: goal.id,
      raceDate,
      startDate: draft.startDate,
      baselineCtl: draft.baselineCtl,
      summary,
      status: 'ACTIVE',
      weeks: weeks.map((w) => ({
        weekStart: w.weekStart,
        weekIndex: w.weekIndex,
        phase: w.phase,
        targetLoad: w.targetLoad,
        targetHours: w.targetHours,
        focus: w.focus,
        isDeload: w.isDeload,
      })),
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    console.error('[training-plans]', error);
    const message = error instanceof Error ? error.message : 'Génération impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
