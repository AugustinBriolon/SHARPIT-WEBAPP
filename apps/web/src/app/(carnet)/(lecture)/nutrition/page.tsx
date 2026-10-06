import { connection } from 'next/server';
import type {
  NutritionDaySummary,
  NutritionViewModel,
} from '@sharpit/app/presentation/nutrition-view-model';
import { CHART_BASE_STROKE } from '@sharpit/app/lib/theme/chart-theme';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { CarnetBarChart } from '@/components/carnet/carnet-charts';
import {
  CarnetPage,
  CarnetSection,
  Figure,
  Figures,
  InApp,
  Quiet,
  ReadingList,
  ReadingRow,
  Reasons,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { readViewModel } from '@/components/carnet/carnet-read';
import { longDayLabel } from '@/components/carnet/carnet-time';

// Reads the signed-in athlete on every request (ADR-072).
export const instant = false;

function average(days: NutritionDaySummary[], pick: (d: NutritionDaySummary) => number): number {
  return days.length === 0 ? 0 : days.reduce((sum, d) => sum + pick(d), 0) / days.length;
}

function shortDay(dayId: string): string {
  const [, month, day] = dayId.slice(0, 10).split('-');
  return `${Number(day)}/${Number(month)}`;
}

function Regularity({ history }: { history: NutritionDaySummary[] }) {
  const logged = history.filter((d) => d.calories > 0);
  if (logged.length === 0) {
    return <Quiet>Rien de noté ces derniers jours.</Quiet>;
  }
  const goal = logged.find((d) => d.goalsProgress?.calories.goal)?.goalsProgress?.calories.goal;
  const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <Figures>
        <Figure
          label="Énergie moyenne"
          unit="kcal"
          value={Math.round(average(logged, (d) => d.calories))}
        />
        <Figure label="Protéines" unit="g" value={Math.round(average(logged, (d) => d.protein))} />
        <Figure
          label="Glucides"
          unit="g"
          value={Math.round(average(logged, (d) => d.carbohydrates))}
        />
        <Figure label="Lipides" unit="g" value={Math.round(average(logged, (d) => d.fat))} />
      </Figures>
      <Quiet>
        Moyenne des {logged.length} jour{logged.length > 1 ? 's' : ''} notés
        {goal ? `, pour un objectif de ${Math.round(goal)} kcal (ligne pointillée)` : ''}.
      </Quiet>
      <CarnetBarChart
        average={goal ?? null}
        data={ordered.map((d) => ({ label: shortDay(d.date), kcal: d.calories || null }))}
        series={[{ key: 'kcal', name: 'Énergie', stroke: CHART_BASE_STROKE, unit: 'kcal' }]}
        title="Énergie par jour"
      />
    </>
  );
}

function Day({ day }: { day: NutritionDaySummary }) {
  if (day.meals.length === 0) {
    return <Quiet>Rien de noté ce jour-là.</Quiet>;
  }
  return (
    <ReadingList>
      {day.meals.map((meal) => (
        <ReadingRow key={meal.name} href={null}>
          <div className="min-w-0">
            <p className="font-medium">{meal.label}</p>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {meal.entries.map((e) => e.name).join(', ')}
            </p>
          </div>
          <p className="text-data text-muted-foreground shrink-0 text-right text-xs">
            {Math.round(meal.calories)} kcal · P {Math.round(meal.protein)} · G{' '}
            {Math.round(meal.carbs)} · L {Math.round(meal.fat)}
          </p>
        </ReadingRow>
      ))}
    </ReadingList>
  );
}

export default async function CarnetNutritionPage() {
  await connection();
  const today = trainingDayIdForNow();
  const vm = await readViewModel<NutritionViewModel>(
    `/api/presentation/nutrition?trainingDayId=${encodeURIComponent(today)}`,
  );

  if (!vm) {
    return (
      <CarnetPage kicker="La nutrition" title="Ce que tu manges">
        <Unreadable what="La nutrition" />
      </CarnetPage>
    );
  }

  const reading = vm.coachReading?.state === 'ready' ? vm.coachReading : null;
  const day = vm.selectedDay ?? vm.today;

  return (
    <CarnetPage
      kicker="La nutrition"
      lead={vm.diet.labels.length > 0 ? `Régime : ${vm.diet.labels.join(', ')}.` : undefined}
      title="Ce que tu manges"
    >
      <CarnetSection label="Les derniers jours" title="La régularité">
        <Regularity history={vm.history} />
      </CarnetSection>

      {reading ? (
        <CarnetSection label="La lecture du coach" title={reading.verdict.headline}>
          <Reasons items={reading.findings.map((f) => f.text)} />
          <Quiet>
            <span className="text-foreground font-medium">À faire.</span> {reading.action.text}
          </Quiet>
        </CarnetSection>
      ) : null}

      <CarnetSection label="Aujourd'hui" title={longDayLabel(today)}>
        {day ? <Day day={day} /> : <Quiet>Rien de noté aujourd&apos;hui.</Quiet>}
        <InApp>Noter un repas</InApp>
      </CarnetSection>
    </CarnetPage>
  );
}
