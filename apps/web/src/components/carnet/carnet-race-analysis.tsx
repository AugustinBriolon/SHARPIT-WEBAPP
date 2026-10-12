import { formatChronoSeconds } from '@sharpit/app/lib/goals/goal-metric-config';
import type { MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import type { RaceAnalysis, RaceAnalysisLeg } from '@sharpit/app/lib/activity/race-analysis-types';
import { CarnetSection, Figure, Figures, Quiet } from './carnet-parts';
import { RaceFigures, RaceLegs } from './carnet-race';
import {
  HR_ZONES,
  legsWithPacing,
  legsWithZones,
  pacingValueText,
  pacingVerdict,
  runDriftText,
  signedPctText,
  targetDeltaText,
  zoneShares,
} from './carnet-race-reading';

const TH = 'text-muted-foreground border-border border-b py-1.5 pe-4 font-medium';
const TD = 'border-border/50 border-b py-2 pe-4 tabular-nums';

function percent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

export function RaceTargetBlock({
  analysis,
  title,
  raceFormat,
}: {
  analysis: RaceAnalysis;
  title: string | null;
  raceFormat: string | null;
}) {
  const { target, total } = analysis;
  return (
    <CarnetSection label="Par rapport à l'objectif" title={title ?? undefined}>
      <Figures>
        <Figure
          hint={targetDeltaText(total.deltaSec)}
          label="Temps final"
          value={formatChronoSeconds(total.seconds)}
        />
        {target.label ? <Figure label="Objectif" value={target.label} /> : null}
        {raceFormat ? <Figure label="Format" value={raceFormat} /> : null}
      </Figures>
    </CarnetSection>
  );
}

function ZoneBar({ leg }: { leg: RaceAnalysisLeg }) {
  const shares = zoneShares(leg.hrZonesSec ?? []);
  const spoken = shares.map((share, i) => `${HR_ZONES[i]?.label} ${percent(share)}`).join(', ');
  return (
    <div
      aria-label={`${leg.label} : ${spoken}`}
      className="flex h-2 w-full overflow-hidden rounded-full"
      role="img"
    >
      {shares.map((share, i) => (
        <span
          key={HR_ZONES[i]?.label ?? i}
          className="h-full"
          style={{ flexGrow: share, backgroundColor: HR_ZONES[i]?.color }}
        />
      ))}
    </div>
  );
}

export function RaceZonesBlock({ legs }: { legs: readonly RaceAnalysisLeg[] }) {
  const withZones = legsWithZones(legs);
  if (withZones.length === 0) {
    return null;
  }
  return (
    <CarnetSection label="Zones cardiaques par étape">
      <ul className="space-y-4">
        {withZones.map((leg, index) => (
          <li
            key={`${index}-${leg.kind}`}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
          >
            <span className="text-muted-foreground">{leg.label}</span>
            <ZoneBar leg={leg} />
            <span className="text-data text-xs tabular-nums">
              {leg.avgHr ? `${Math.round(leg.avgHr)} bpm` : '—'}
            </span>
          </li>
        ))}
      </ul>
      <ul aria-label="Zones" className="text-data flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {HR_ZONES.map((zone) => (
          <li key={zone.label} className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: zone.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{zone.label}</span>
          </li>
        ))}
      </ul>
    </CarnetSection>
  );
}

export function RaceEffortBlock({ analysis }: { analysis: RaceAnalysis }) {
  const paced = legsWithPacing(analysis.legs);
  const drift = runDriftText(analysis.runHrDriftPct);
  if (paced.length === 0 && !drift) {
    return null;
  }
  return (
    <CarnetSection label="Gestion de l'effort">
      {paced.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="text-data w-full text-left text-xs">
            <caption className="sr-only">
              Allure de chaque étape, première et seconde moitié
            </caption>
            <thead>
              <tr>
                <th className={TH} scope="col">
                  Étape
                </th>
                <th className={TH} scope="col">
                  1re moitié
                </th>
                <th className={TH} scope="col">
                  2e moitié
                </th>
                <th className={TH} scope="col">
                  Écart
                </th>
              </tr>
            </thead>
            <tbody>
              {paced.map(({ pacing, ...leg }, index) => {
                return (
                  <tr key={`${index}-${leg.kind}`}>
                    <th className={`${TD} font-medium`} scope="row">
                      {leg.label}
                    </th>
                    <td className={TD}>{pacingValueText(pacing.firstHalf, pacing.unit)}</td>
                    <td className={TD}>{pacingValueText(pacing.secondHalf, pacing.unit)}</td>
                    <td className={TD}>
                      {signedPctText(pacing.changePct)}{' '}
                      <span className="text-muted-foreground">
                        · {pacingVerdict(pacing.changePct)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {drift ? <Quiet>{drift}</Quiet> : null}
    </CarnetSection>
  );
}

export function RaceLoadBlock({ load }: { load: RaceAnalysis['load'] }) {
  if (load.tss === null && load.recoveryHours === null) {
    return null;
  }
  return (
    <CarnetSection label="Charge et récupération">
      <Figures>
        {load.tss !== null ? <Figure label="Charge" value={Math.round(load.tss)} /> : null}
        {load.recoveryHours !== null ? (
          <Figure label="Récupération" unit="h" value={Math.round(load.recoveryHours)} />
        ) : null}
      </Figures>
    </CarnetSection>
  );
}

type RaceGoal = { title: string; raceFormat: string | null; targetPerformance: string | null };

/**
 * The race part of a séance page: against the goal, then the legs, then how the body and
 * the pacing held. Without an analysis, the goal's own figures stand in.
 */
export function RaceReading({
  goal,
  durationSec,
  legs,
  analysis,
}: {
  goal: RaceGoal | null;
  durationSec: number | null;
  legs: readonly MultisportLeg[] | null;
  analysis: RaceAnalysis | null | undefined;
}) {
  return (
    <>
      {!analysis && goal ? (
        <CarnetSection label="La course" title={goal.title}>
          <RaceFigures
            durationSec={durationSec}
            raceFormat={goal.raceFormat}
            targetPerformance={goal.targetPerformance}
          />
        </CarnetSection>
      ) : null}
      {analysis ? (
        <RaceTargetBlock
          analysis={analysis}
          raceFormat={goal?.raceFormat ?? null}
          title={goal?.title ?? null}
        />
      ) : null}
      {legs?.length ? <RaceLegs legs={legs} /> : null}
      {analysis ? (
        <>
          <RaceZonesBlock legs={analysis.legs} />
          <RaceEffortBlock analysis={analysis} />
          <RaceLoadBlock load={analysis.load} />
        </>
      ) : null}
    </>
  );
}
