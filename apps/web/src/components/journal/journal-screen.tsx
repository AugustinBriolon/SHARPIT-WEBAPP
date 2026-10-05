'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import {
  ChartLine,
  Car,
  Coffee,
  Droplets,
  Minus,
  Pencil,
  Plus,
  Smile,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  JournalAutoChecklistSection,
  JournalNutritionSection,
} from '@/components/journal/journal-derived-sections';
import { JournalPrefsDrawer, useJournalPrefs } from '@/components/journal/journal-prefs-drawer';
import { SignalSegment } from '@/components/journal/signal-segment';
import { MobileDrillDownHeader } from '@/components/layout/header/mobile-drill-down-header';
import { Button } from '@sharpit/ui/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { DAY_CONTEXT_FACTORS } from '@sharpit/app/lib/journal/day-context-factors';
import {
  emptyDayJournalEntry,
  formatDrivingMinutes,
  loadDayJournalEntry,
  readDayJournalStore,
  type DayJournalEntry,
  type DayJournalFactorKey,
  type DayJournalFactorState,
  upsertDayJournalEntry,
  writeDayJournalStore,
} from '@sharpit/app/lib/journal/day-journal';
import { splitJournalFactorIdsForScreen } from '@sharpit/app/lib/journal/journal-screen-sections';
import {
  flushDayJournalPersist,
  scheduleDayJournalPersist,
} from '@sharpit/app/lib/journal/day-journal-persist';
import type { JournalDaySignals } from '@sharpit/app/lib/journal/journal-day-signals';
import {
  JOURNAL_CATEGORY_HEADER,
  JOURNAL_METRIC_ICON,
  journalCategoryIcon,
} from '@sharpit/app/lib/journal/journal-category-surface';
import {
  enabledFactorIds,
  showAutoChecklist,
  showDayBasics,
  showNutritionPanel,
  type JournalPrefs,
} from '@sharpit/app/lib/journal/journal-prefs';
import { journalTrackableById } from '@sharpit/app/lib/journal/journal-trackables';
import { fetchJournalDaySignals } from '@/client/query/fetchers';
import { queryKeys } from '@/client/query/keys';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import {
  JOURNAL_RECOVERY_CALLOUT,
  isJournalFieldWeightedInRecoveryV1,
  journalWeightBadgeLabel,
} from '@sharpit/app/lib/journal/reliability-weighting';
import { STATUS_SURFACE } from '@sharpit/app/lib/presentation/coaching/status-surface';
import { cn } from '@sharpit/app/lib/utils';

const MorningWellnessDialog = dynamic(
  () =>
    import('@/components/today/dashboard/morning-wellness-dialog').then(
      (mod) => mod.MorningWellnessDialog,
    ),
  { ssr: false },
);

function factorLabel(id: DayJournalFactorKey, prefs: JournalPrefs): string {
  const builtin = DAY_CONTEXT_FACTORS.find((factor) => factor.id === id);
  if (builtin) {
    return builtin.label;
  }
  return prefs.customItems.find((item) => item.id === id)?.label ?? id;
}

function factorHint(id: DayJournalFactorKey): string {
  return DAY_CONTEXT_FACTORS.find((factor) => factor.id === id)?.hint ?? 'Élément personnalisé';
}

function JournalWeightBadge({ fieldId }: { fieldId: string }) {
  if (!isJournalFieldWeightedInRecoveryV1(fieldId)) {
    return null;
  }
  return (
    <span
      className={cn(
        'mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
        STATUS_SURFACE.doneBadge,
      )}
    >
      {journalWeightBadgeLabel(fieldId)}
    </span>
  );
}

function JournalRecoveryCallout() {
  return (
    <p
      className="border-analysis-border/80 bg-muted/40 text-muted-foreground rounded-analysis border px-3 py-2.5 text-sm text-pretty"
      role="note"
    >
      {JOURNAL_RECOVERY_CALLOUT}
    </p>
  );
}

function JournalMetricRow({
  icon: Icon,
  iconClassName,
  label,
  value,
  action,
  weightFieldId,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  label: string;
  value: string;
  action: ReactNode;
  weightFieldId?: string;
}) {
  return (
    <div className="border-analysis-border/60 flex items-center gap-3 border-b px-3 py-3 last:border-b-0">
      <span
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-xl',
          iconClassName ?? 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-data mt-0.5 text-xs tabular-nums">{value}</p>
        {weightFieldId ? <JournalWeightBadge fieldId={weightFieldId} /> : null}
      </div>
      {action}
    </div>
  );
}

function FactorListRow({
  id,
  entry,
  prefs,
  onChange,
}: {
  id: DayJournalFactorKey;
  entry: DayJournalEntry;
  prefs: JournalPrefs;
  onChange: (id: DayJournalFactorKey, next: DayJournalFactorState) => void;
}) {
  const state = entry.factors[id] ?? 'unset';
  const trackable = journalTrackableById(id);
  const Icon = trackable?.icon ?? Sparkles;
  const iconTone = journalCategoryIcon(
    trackable?.category ?? (id.startsWith('custom_') ? 'personnalise' : undefined),
  );
  const label = factorLabel(id, prefs);

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="flex min-w-0 flex-1 items-start gap-3 pr-1">
        <span
          className={cn(
            'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
            iconTone,
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs text-pretty">
            {factorHint(id)}
          </p>
          {/* Unweighted factors stay quiet — no per-line failure badge. */}
          <JournalWeightBadge fieldId={id} />
        </div>
      </div>
      <div className="shrink-0 self-center">
        <SignalSegment label={label} state={state} onChange={(next) => onChange(id, next)} />
      </div>
    </li>
  );
}

function FactorListSection({
  titleId,
  title,
  hint,
  ids,
  entry,
  prefs,
  onChange,
}: {
  titleId: string;
  title: string;
  hint?: string;
  ids: readonly DayJournalFactorKey[];
  entry: DayJournalEntry;
  prefs: JournalPrefs;
  onChange: (id: DayJournalFactorKey, next: DayJournalFactorState) => void;
}) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby={titleId}
      className="analysis-panel border-analysis-border/80 rounded-analysis overflow-hidden border"
    >
      <div className="border-analysis-border/60 border-b px-3 py-2.5">
        <h2 className="text-label" id={titleId}>
          {title}
        </h2>
        {hint ? <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{hint}</p> : null}
      </div>
      <ul className="divide-analysis-border/60 divide-y">
        {ids.map((id) => (
          <FactorListRow key={id} entry={entry} id={id} prefs={prefs} onChange={onChange} />
        ))}
      </ul>
    </section>
  );
}

function useDayJournal(trainingDayId: string | null) {
  const [entry, setEntry] = useState<DayJournalEntry | null>(null);

  useEffect(() => {
    if (!trainingDayId) {
      return;
    }
    let cancelled = false;
    const local = readDayJournalStore().byDay[trainingDayId] ?? emptyDayJournalEntry(trainingDayId);
    setEntry(local);
    void loadDayJournalEntry(trainingDayId).then((next) => {
      if (!cancelled) {
        setEntry(next);
        writeDayJournalStore(upsertDayJournalEntry(readDayJournalStore(), next));
      }
    });
    return () => {
      cancelled = true;
      void flushDayJournalPersist(trainingDayId);
    };
  }, [trainingDayId]);

  const persist = useCallback((next: DayJournalEntry) => {
    const local = scheduleDayJournalPersist(next);
    setEntry(local);
  }, []);

  return { entry, persist };
}

function MoodAction({
  moodLabel,
  onMoodChange,
}: {
  moodLabel: string | null;
  onMoodChange: (label: string) => void;
}) {
  const saved = Boolean(moodLabel);

  return (
    <MorningWellnessDialog
      triggerLabel={saved ? 'modifier' : 'Ressenti'}
      triggerAriaLabel={
        saved
          ? `Humeur enregistrée : ${moodLabel}. Appuyer pour modifier`
          : 'Saisir le ressenti du matin'
      }
      triggerChildren={
        saved ? (
          <>
            <Check
              className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              strokeWidth={2.25}
              aria-hidden
            />
            <span>modifier</span>
            <Pencil
              className="text-muted-foreground size-3 shrink-0 opacity-70"
              strokeWidth={1.8}
              aria-hidden
            />
          </>
        ) : (
          'Ressenti'
        )
      }
      triggerClassName={
        saved
          ? 'border-border bg-muted/60 text-foreground hover:bg-muted gap-1.5 dark:bg-muted/40'
          : 'border-border bg-background text-foreground hover:bg-muted gap-1.5'
      }
      debugBypassCompleted
      onCompleted={(result) => onMoodChange(result.moodLabel)}
    />
  );
}

function useClientTrainingDayId(): string | null {
  const [trainingDayId, setTrainingDayId] = useState<string | null>(null);

  useEffect(() => {
    setTrainingDayId(trainingDayIdForNow());
  }, []);

  return trainingDayId;
}

function JournalLoadingSkeleton({ heightClass }: { heightClass: string }) {
  return (
    <div
      aria-label="Chargement du journal"
      className={cn(
        'analysis-panel border-analysis-border/80 rounded-analysis animate-pulse border',
        heightClass,
      )}
      aria-busy
    />
  );
}

function MetricStepper({
  onDecrement,
  onIncrement,
  decrementDisabled = false,
}: {
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled?: boolean;
}) {
  return (
    <div className="flex gap-1">
      <Button
        disabled={decrementDisabled}
        size="xs"
        type="button"
        variant="outline"
        onClick={onDecrement}
      >
        <Minus className="size-3" aria-hidden />
        <span className="sr-only">Diminuer</span>
      </Button>
      <Button size="xs" type="button" variant="outline" onClick={onIncrement}>
        <Plus className="size-3" aria-hidden />
        <span className="sr-only">Augmenter</span>
      </Button>
    </div>
  );
}

function CaffeineMetricRow({
  entry,
  persist,
}: {
  entry: DayJournalEntry;
  persist: (next: DayJournalEntry) => void;
}) {
  const caffeineMg = entry.caffeineMg ?? 0;
  return (
    <JournalMetricRow
      icon={Coffee}
      iconClassName={JOURNAL_METRIC_ICON.caffeine}
      label="Caféine"
      value={`${caffeineMg} mg`}
      weightFieldId="metric_caffeine"
      action={
        <MetricStepper
          decrementDisabled={caffeineMg <= 0}
          onDecrement={() => persist({ ...entry, caffeineMg: Math.max(0, caffeineMg - 40) })}
          onIncrement={() => persist({ ...entry, caffeineMg: caffeineMg + 40 })}
        />
      }
    />
  );
}

function MoodMetricRow({
  entry,
  persist,
}: {
  entry: DayJournalEntry;
  persist: (next: DayJournalEntry) => void;
}) {
  return (
    <JournalMetricRow
      icon={Smile}
      iconClassName={JOURNAL_METRIC_ICON.mood}
      label="Humeur"
      value={entry.moodLabel ?? 'Non renseignée'}
      weightFieldId="metric_mood"
      action={
        <MoodAction
          moodLabel={entry.moodLabel}
          onMoodChange={(label) => persist({ ...entry, moodLabel: label })}
        />
      }
    />
  );
}

function HydrationMetricRow({
  entry,
  persist,
}: {
  entry: DayJournalEntry;
  persist: (next: DayJournalEntry) => void;
}) {
  const hydrationMl = entry.hydrationMl ?? 0;
  return (
    <JournalMetricRow
      icon={Droplets}
      iconClassName={JOURNAL_METRIC_ICON.hydration}
      label="Hydratation"
      value={entry.hydrationMl !== null ? `${entry.hydrationMl} ml` : '— ml'}
      weightFieldId="metric_hydration"
      action={
        <MetricStepper
          decrementDisabled={hydrationMl <= 0}
          onDecrement={() => persist({ ...entry, hydrationMl: Math.max(0, hydrationMl - 250) })}
          onIncrement={() => persist({ ...entry, hydrationMl: hydrationMl + 250 })}
        />
      }
    />
  );
}

/** Minutes behind the wheel, by quarter hours. */
function DrivingMetricRow({
  entry,
  persist,
}: {
  entry: DayJournalEntry;
  persist: (next: DayJournalEntry) => void;
}) {
  const minutes = entry.drivingMinutes ?? 0;
  return (
    <JournalMetricRow
      icon={Car}
      iconClassName={JOURNAL_METRIC_ICON.driving}
      label="Conduite"
      value={formatDrivingMinutes(entry.drivingMinutes ?? null)}
      weightFieldId="metric_driving"
      action={
        <MetricStepper
          decrementDisabled={minutes <= 0}
          onDecrement={() => persist({ ...entry, drivingMinutes: Math.max(0, minutes - 15) })}
          onIncrement={() => persist({ ...entry, drivingMinutes: minutes + 15 })}
        />
      }
    />
  );
}

function JournalDayMetricsSection({
  entry,
  prefs,
  persist,
}: {
  entry: DayJournalEntry;
  prefs: JournalPrefs;
  persist: (next: DayJournalEntry) => void;
}) {
  if (!showDayBasics(prefs)) {
    return null;
  }

  return (
    <section
      aria-labelledby="journal-day-metrics"
      className="analysis-panel border-analysis-border/80 rounded-analysis overflow-hidden border"
    >
      <h2
        id="journal-day-metrics"
        className={cn(
          'text-label border-analysis-border/60 border-b px-3 py-2.5',
          JOURNAL_CATEGORY_HEADER.bien_etre,
        )}
      >
        Journée
      </h2>
      <div>
        {prefs.enabled.metric_caffeine ? (
          <CaffeineMetricRow entry={entry} persist={persist} />
        ) : null}
        {prefs.enabled.metric_mood ? <MoodMetricRow entry={entry} persist={persist} /> : null}
        {prefs.enabled.metric_hydration ? (
          <HydrationMetricRow entry={entry} persist={persist} />
        ) : null}
        {prefs.enabled.metric_driving ? <DrivingMetricRow entry={entry} persist={persist} /> : null}
      </div>
    </section>
  );
}

function JournalDerivedPanels({
  prefs,
  signals,
}: {
  prefs: JournalPrefs;
  signals: JournalDaySignals | undefined;
}) {
  const showChecklist = showAutoChecklist(prefs);
  const showNutrition = showNutritionPanel(prefs);
  if (!showChecklist && !showNutrition) {
    return null;
  }

  if (!signals) {
    return (
      <>
        {showChecklist ? <JournalLoadingSkeleton heightClass="h-28" /> : null}
        {showNutrition ? <JournalLoadingSkeleton heightClass="h-28" /> : null}
      </>
    );
  }

  return (
    <>
      {showChecklist ? <JournalAutoChecklistSection items={signals.checklist} /> : null}
      {showNutrition ? (
        <JournalNutritionSection dietLabels={signals.dietLabels} nutrition={signals.nutrition} />
      ) : null}
    </>
  );
}

function JournalLoadedContent({
  entry,
  prefs,
  persist,
  signals,
}: {
  entry: DayJournalEntry;
  prefs: JournalPrefs;
  persist: (next: DayJournalEntry) => void;
  signals: JournalDaySignals | undefined;
}) {
  const factorIds = useMemo(() => enabledFactorIds(prefs), [prefs]);
  const { priorNightIds, dayFactorIds } = useMemo(
    () => splitJournalFactorIdsForScreen(factorIds),
    [factorIds],
  );

  function setFactor(id: DayJournalFactorKey, next: DayJournalFactorState) {
    persist({
      ...entry,
      factors: { ...entry.factors, [id]: next },
    });
  }

  // Order: day_metrics → derived_panels → prior_night → day_signals
  // (see JOURNAL_LOADED_CONTENT_ORDER).
  return (
    <>
      <JournalDayMetricsSection entry={entry} persist={persist} prefs={prefs} />
      <JournalDerivedPanels prefs={prefs} signals={signals} />
      <FactorListSection
        entry={entry}
        hint="De la veille au réveil (J-1 → J)."
        ids={priorNightIds}
        prefs={prefs}
        title="Nuit dernière"
        titleId="journal-prior-night"
        onChange={setFactor}
      />
      <FactorListSection
        entry={entry}
        ids={dayFactorIds}
        prefs={prefs}
        title="Signaux du jour"
        titleId="journal-day-signals"
        onChange={setFactor}
      />
    </>
  );
}

function JournalScreenToolbar({
  isPro,
  prefs,
  onIsProChange,
  onPrefsChange,
}: {
  isPro: boolean;
  prefs: JournalPrefs;
  onIsProChange: (value: boolean) => void;
  onPrefsChange: (prefs: JournalPrefs) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <p className="text-muted-foreground min-w-0 text-sm text-pretty sm:max-w-md lg:max-w-lg">
        Contexte du jour pour le coach. Active seulement les éléments que tu veux suivre.
      </p>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
        <LinkButton href="/journal/analyses" size="sm" variant="outline">
          <ChartLine className="size-3.5" aria-hidden />
          Analyses
        </LinkButton>
        <JournalPrefsDrawer
          isPro={isPro}
          prefs={prefs}
          onIsProChange={onIsProChange}
          onPrefsChange={onPrefsChange}
        />
      </div>
    </div>
  );
}

function useJournalDaySignals(trainingDayId: string | null, prefs: JournalPrefs) {
  const needsSignals = showAutoChecklist(prefs) || showNutritionPanel(prefs);

  return useQuery({
    queryKey: queryKeys.journalDaySignals(trainingDayId ?? 'pending'),
    queryFn: async (): Promise<JournalDaySignals> =>
      (await fetchJournalDaySignals(trainingDayId!)) as JournalDaySignals,
    enabled: Boolean(trainingDayId) && needsSignals,
    staleTime: 60_000,
  });
}

export function JournalScreen() {
  const trainingDayId = useClientTrainingDayId();
  const { entry, persist } = useDayJournal(trainingDayId);
  const { prefs, setPrefs, isPro, setIsPro } = useJournalPrefs();
  const signalsQuery = useJournalDaySignals(trainingDayId, prefs);
  const isReady = Boolean(entry && trainingDayId);

  return (
    <div className="space-y-4 sm:space-y-5">
      <MobileDrillDownHeader backHref="/" backLabel="Résumé" title="Journal" />
      {/* Single Recovery callout: Journal header only — never under Analyses / Today / dialogs. */}
      <JournalRecoveryCallout />
      <JournalScreenToolbar
        isPro={isPro}
        prefs={prefs}
        onIsProChange={setIsPro}
        onPrefsChange={setPrefs}
      />
      {!isReady ? (
        <JournalLoadingSkeleton heightClass="h-40" />
      ) : (
        <JournalLoadedContent
          entry={entry!}
          persist={persist}
          prefs={prefs}
          signals={signalsQuery.data}
        />
      )}
    </div>
  );
}
