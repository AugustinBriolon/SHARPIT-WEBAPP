import { generateText, Output } from 'ai';
import { isSet } from '@sharpit/shared/value';
import { COACH_MODEL, coachAnalysisGatewayOptions } from '@sharpit/server/lib/ai';
import { recordAiUsage } from '@sharpit/server/lib/ai/usage';
import {
  describeBikeWorkBlocks,
  parsePrescriptionTargets,
  summarizeBikeWorkBlocks,
  type BikeWorkSummary,
} from '@sharpit/server/lib/coach/plan/bike-work-blocks';
import {
  categoryLabels,
  sideLabels,
  statusLabels,
} from '@sharpit/app/lib/physical-health/physical';
import {
  getActivePhysicalNotes,
  getAthleteProfile,
  getBrickEvaluation,
  getBrickSessions,
  getPlannedSessionById,
} from '@sharpit/server/lib/queries';
import { describeBrickEvaluation } from '@sharpit/server/lib/coach/plan/brick-evaluation-prompt';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import {
  applyStrengthScoringGuards,
  computeStrengthCompliance,
  formatStrengthCompliance,
  type ComparableStrengthSet,
  type StrengthCompliance,
} from '@sharpit/server/lib/planned-session/strength/strength-compliance';
import { parseStrengthPrescription } from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import { fetchActivityDetail } from '@sharpit/server/lib/integrations/strava/strava';
import { getValidAccessToken } from '@sharpit/server/lib/integrations/strava/strava-sync';
import { prisma } from '@sharpit/db/client';
import {
  brickAnalysisSchema,
  sessionAnalysisSchema,
  type BrickAnalysis,
  type SessionAnalysis,
} from '@sharpit/app/lib/validators/coach';
import {
  COACH_COPY_DASH_RULE,
  sanitizeCoachCopy,
} from '@sharpit/app/lib/coach/sanitize-coach-copy';

/** Prefer local notes when long enough — skip Strava round-trip. */
export const LOCAL_DESCRIPTION_MIN_CHARS = 40;

const TYPE_FR: Record<string, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
  STRENGTH: 'Renfo',
};

function fmtPace(secPerKm?: number | null): string | null {
  if (secPerKm === undefined || secPerKm === null || secPerKm <= 0) {
    return null;
  }
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

type PlannedWithActivity = NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>;
type LinkedActivity = NonNullable<PlannedWithActivity['activity']>;

/** Volume line for one prescribed / realized movement. */
function formatStrengthSetLine(set: ComparableStrengthSet & { weightKg?: number | null }): string {
  const volume =
    isSet(set.durationSec) && set.durationSec > 0 && set.reps <= 0
      ? `${set.sets}×${set.durationSec}s`
      : `${set.sets}×${set.reps}`;
  const weight = isSet(set.weightKg) && set.weightKg > 0 ? ` @ ${set.weightKg} kg` : '';
  return `- ${set.exercise} ${volume}${weight}`;
}

function appendPlannedStrengthLines(bits: string[], p: PlannedWithActivity): void {
  const prescription = parseStrengthPrescription(p.strengthPrescription);
  if (!prescription) {
    return;
  }
  bits.push('Exercices prescrits :');
  bits.push(
    ...prescription.sets
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(formatStrengthSetLine),
  );
}

function appendPlannedBikeTargetLines(
  bits: string[],
  p: PlannedWithActivity,
  ftpW: number | null | undefined,
): void {
  if (ftpW === undefined || ftpW === null || ftpW <= 0 || p.type !== 'BIKE') {
    return;
  }
  const parsed = parsePrescriptionTargets(p.description);
  if (isSet(parsed.ftpPct)) {
    const targetW = Math.round((parsed.ftpPct / 100) * ftpW);
    bits.push(
      `Cible puissance (dérivée de la consigne) : ${parsed.ftpPct}% FTP = ${targetW} W (FTP ${ftpW} W)`,
    );
  }
  if (isSet(parsed.plannedWorkMin)) {
    bits.push(
      `Volume de travail suggéré par la consigne (lecture texte) : ~${parsed.plannedWorkMin} min`,
    );
  }
}

function plannedEnduranceHeaderBits(p: PlannedWithActivity): string[] {
  return [
    p.intensity ? `Intensité prévue : ${intensityLabels[p.intensity]}` : null,
    isSet(p.durationMin) ? `Durée prévue : ${p.durationMin} min` : null,
    isSet(p.load) ? `Charge prévue : ${Math.round(p.load)} TSS` : null,
  ].filter(Boolean) as string[];
}

function plannedHeaderBits(p: PlannedWithActivity): string[] {
  const isStrength = p.type === 'STRENGTH';
  return [
    `Sport : ${TYPE_FR[p.type] ?? p.type}`,
    p.brickGroupId
      ? `Jambe d'un BRICK (enchaînement multisport) — tiens compte de la fatigue/transition (ex. course en sortie de vélo).`
      : null,
    ...(isStrength ? [] : plannedEnduranceHeaderBits(p)),
    p.title ? `Titre : ${p.title}` : null,
    p.description ? `Consigne : ${p.description}` : null,
  ].filter(Boolean) as string[];
}

function describePlanned(p: PlannedWithActivity, opts?: { ftpW?: number | null }): string {
  const bits = plannedHeaderBits(p);
  if (p.type === 'STRENGTH') {
    appendPlannedStrengthLines(bits, p);
  }
  appendPlannedBikeTargetLines(bits, p, opts?.ftpW);
  return bits.join('\n');
}

function appendRunMetricLines(bits: string[], r: NonNullable<LinkedActivity['runMetrics']>): void {
  if (r.distanceM) {
    bits.push(`Distance : ${(r.distanceM / 1000).toFixed(2)} km`);
  }
  const pace = fmtPace(r.paceSecPerKm);
  if (pace) {
    bits.push(`Allure moyenne : ${pace}`);
  }
  if (r.avgHr) {
    bits.push(`FC moyenne : ${r.avgHr} bpm`);
  }
  if (r.avgPower) {
    bits.push(`Puissance moyenne : ${Math.round(r.avgPower)} W`);
  }
  if (r.elevationM) {
    bits.push(`D+ : ${Math.round(r.elevationM)} m`);
  }
}

function appendBikePowerLines(bits: string[], b: NonNullable<LinkedActivity['bikeMetrics']>): void {
  if (b.avgPower) {
    bits.push(`Puissance moyenne (séance entière) : ${Math.round(b.avgPower)} W`);
  }
  if (b.normalizedPower) {
    bits.push(`NP (séance entière) : ${Math.round(b.normalizedPower)} W`);
  }
}

function appendBikeIntensityLine(
  bits: string[],
  b: NonNullable<LinkedActivity['bikeMetrics']>,
  ftpW: number | null | undefined,
): void {
  const intensityFactor =
    b.intensityFactor ??
    (isSet(b.normalizedPower) && isSet(ftpW) && ftpW > 0 ? b.normalizedPower / ftpW : null);
  if (isSet(intensityFactor)) {
    bits.push(`IF (séance entière) : ${intensityFactor.toFixed(2)}`);
  }
}

function appendBikeMetricLines(
  bits: string[],
  b: NonNullable<LinkedActivity['bikeMetrics']>,
  ftpW: number | null | undefined,
): void {
  appendBikePowerLines(bits, b);
  appendBikeIntensityLine(bits, b, ftpW);
  if (b.tss) {
    bits.push(`TSS : ${Math.round(b.tss)}`);
  }
  if (b.elevationM) {
    bits.push(`D+ : ${Math.round(b.elevationM)} m`);
  }
  bits.push(
    'Note : avg/NP/IF ci-dessus couvrent toute la séance (échauffement + travail + récup) — ne pas les confondre avec l’intensité des blocs de travail.',
  );
}

function appendSwimMetricLines(
  bits: string[],
  s: NonNullable<LinkedActivity['swimMetrics']>,
): void {
  if (s.distanceM) {
    bits.push(`Distance : ${s.distanceM} m`);
  }
  if (s.avgPaceSecPer100m) {
    const m = Math.floor(s.avgPaceSecPer100m / 60);
    const sec = Math.round(s.avgPaceSecPer100m % 60);
    bits.push(`Allure : ${m}:${sec.toString().padStart(2, '0')}/100m`);
  }
}

function actualEnduranceHeaderBits(a: LinkedActivity): string[] {
  return [
    isSet(a.duration) ? `Durée : ${Math.round(a.duration / 60)} min` : null,
    isSet(a.load) ? `Charge : ${Math.round(a.load)} TSS` : null,
  ].filter(Boolean) as string[];
}

function actualHeaderBits(a: LinkedActivity): string[] {
  const isStrength = a.type === 'STRENGTH';
  return [
    `Sport : ${TYPE_FR[a.type] ?? a.type}`,
    ...(isStrength ? [] : actualEnduranceHeaderBits(a)),
    isSet(a.rpe) ? `RPE ressenti : ${a.rpe}/10` : null,
    a.feeling ? `Ressenti : ${a.feeling}` : null,
    a.notes ? `Notes : ${a.notes}` : null,
  ].filter(Boolean) as string[];
}

function appendActualSportMetrics(
  bits: string[],
  a: LinkedActivity,
  ftpW: number | null | undefined,
): void {
  if (a.runMetrics) {
    appendRunMetricLines(bits, a.runMetrics);
  }
  if (a.bikeMetrics) {
    appendBikeMetricLines(bits, a.bikeMetrics, ftpW);
  }
  if (a.swimMetrics) {
    appendSwimMetricLines(bits, a.swimMetrics);
  }
}

function describeActual(
  a: LinkedActivity,
  description?: string | null,
  opts?: { ftpW?: number | null; workSummary?: BikeWorkSummary | null },
): string {
  const bits = actualHeaderBits(a);

  if (a.type === 'STRENGTH' && a.strengthSets.length > 0) {
    bits.push('Exercices réalisés :');
    bits.push(...a.strengthSets.map(formatStrengthSetLine));
  }

  const desc = description?.trim();
  if (desc) {
    bits.push(`Description (athlète) : ${desc}`);
  }

  appendActualSportMetrics(bits, a, opts?.ftpW);

  if (opts?.workSummary) {
    bits.push('');
    bits.push('## Blocs de travail (stream puissance)');
    bits.push(describeBikeWorkBlocks(opts.workSummary));
  }

  return bits.join('\n');
}

type ActivePhysicalNote = Awaited<ReturnType<typeof getActivePhysicalNotes>>[number];

const REASSESSMENT_CATEGORIES = new Set<ActivePhysicalNote['category']>(['PAIN', 'INJURY']);

function painInjuryNotes(notes: ActivePhysicalNote[]): ActivePhysicalNote[] {
  return notes.filter((n) => REASSESSMENT_CATEGORIES.has(n.category));
}

function describePhysicalNotes(notes: ActivePhysicalNote[]): string {
  const relevant = painInjuryNotes(notes);
  if (relevant.length === 0) {
    return 'Aucune douleur / blessure active — ne propose aucune réévaluation (ignore posture, mobilité et autres suivis généraux).';
  }
  return relevant
    .map((n) => {
      const bits = [
        `id=${n.id}`,
        `${categoryLabels[n.category]} : ${n.title}`,
        n.bodyPart
          ? `zone ${n.bodyPart}${n.side && n.side !== 'NA' ? ` (${sideLabels[n.side]})` : ''}`
          : null,
        isSet(n.severity) ? `sévérité actuelle ${n.severity}/10` : null,
        `statut ${statusLabels[n.status]}`,
      ].filter(Boolean);
      return `- ${bits.join(' · ')}`;
    })
    .join('\n');
}

const ANALYSIS_SYSTEM = `Tu es un entraîneur expert en endurance. On te donne une séance PRÉVUE et la séance RÉELLEMENT réalisée (données objectives Strava/Garmin + éventuelle description libre de l'athlète).

Compare-les et produis une analyse exploitable :
- complianceScore : 0-100 (100 = exécution parfaite de la consigne).
- verdict : conforme / plus dur / plus facile / plus court / plus long / différent.
- Remarques pertinentes et factuelles (intensité, durée, allure/puissance, dérive cardiaque, exécution des intervalles). Appuie-toi sur les chiffres.
- Une recommandation concrète à retenir.

RÈGLES D'ÉVALUATION IMPORTANTES :
- Le contenu RÉELLEMENT effectué prime sur les seules métriques. Lis attentivement la "Description (athlète)" et les "Notes" : si l'athlète y indique avoir fait tout le travail prévu, considère la séance comme conforme même si la durée enregistrée diffère.
- Pour la MUSCULATION / le renforcement : la vitesse d'exécution n'est pas un paramètre prescriptible (repos variables, montre lancée/arrêtée à des moments variables). Durée et TSS ne te sont donc PAS fournis pour ces séances : juge UNIQUEMENT le contenu (exercices, séries, répétitions, charges) et les notes de l'athlète. N'invente aucune durée, ne parle pas de minutes, et n'utilise jamais les verdicts SHORTER/LONGER pour une séance de renfo.
- Quand une section « Conformité muscu (calcul déterministe) » est fournie, elle fait autorité sur la couverture du contenu : ton complianceScore ne peut pas être inférieur à son score structurel.
- Pour TEMPO / SEUIL / VO2 / RACE / fractionné VÉLO : la puissance moyenne, le NP et l'IF de la séance ENTIÈRE sont dilués par échauffement et récupérations. NE LES utilise PAS comme preuve que l'intensité cible n'a pas été atteinte.
- Si une section "Blocs de travail (stream puissance)" est fournie, juge l'INTENSITÉ sur ces blocs (watts / %FTP des blocs, temps au-dessus du seuil), pas sur avg/NP globaux. La durée totale de séance peut toujours être jugée séparément (séance plus courte/longue).
- N'affirme PAS que les intervalles « n'ont pas été effectués » si les blocs de travail montrent une puissance proche de la cible — parle plutôt d'écart de volume, de structure, ou de durée si c'est le cas.
- Les blocs stream sont une heuristique : ne prétends pas avoir vérifié une structure NxM exacte si les données ne le démontrent pas clairement.
- Si le FTP n'est pas fourni, ne compare PAS à un %FTP inventé et ne cite pas de watts cibles fictifs.
- Pour les séances d'endurance continues (sans section blocs de travail), durée et intensité globale restent des indicateurs valides.
- Dans le doute, accorde le bénéfice à l'athlète plutôt que de surpénaliser.

RÉÉVALUATION DU SUIVI PHYSIQUE (champ "physicalReassessments") :
- On te fournit UNIQUEMENT les douleurs et blessures ACTIVES (pas la posture, la mobilité ni autres suivis généraux).
- Propose une réévaluation UNIQUEMENT lorsque la consigne de la séance OU les notes/description de l'athlète sollicitent ou mentionnent explicitement la zone concernée (ex. test ciblant une douleur, consigne « arrêt immédiat si douleur fesse/ischio », gêne rapportée pendant la séance).
- Ne JAMAIS proposer de réévaluation pour la posture, la mobilité ou un suivi technique non lié à une douleur.
- Pour chaque réévaluation pertinente : recopie l'id EXACT de la note, pose une question courte et ciblée sur le ressenti pendant cette séance précise, et pré-remplis un commentaire rappelant le contexte (type de test, structure).
- Ne renseigne "suggestedSeverity" QUE si l'athlète a explicitement indiqué l'état de sa douleur dans ses notes/ressenti ; sinon mets null (c'est lui qui complétera).
- Si aucune douleur active n'est concernée par cette séance, laisse "physicalReassessments" vide.

Sois précis, bienveillant et concis. Réponds en français.

${COACH_COPY_DASH_RULE}`;

/** True when local athlete notes are rich enough to skip a Strava description fetch. */
export function hasSubstantialLocalDescription(notes: string | null | undefined): boolean {
  const trimmed = notes?.trim() ?? '';
  return trimmed.length >= LOCAL_DESCRIPTION_MIN_CHARS;
}

function isStravaLinkedActivity(activity: LinkedActivity): boolean {
  const source = activity.source ?? '';
  const fromStrava =
    source === 'strava' || source === 'both' || source.split('+').includes('strava');
  return fromStrava && isSet(activity.stravaId);
}

/** Description libre Strava (détail réel). Best-effort : ne lève jamais. */
async function fetchStravaDescription(
  athleteId: string,
  activity: LinkedActivity,
): Promise<string | null> {
  if (!isStravaLinkedActivity(activity)) {
    return null;
  }
  try {
    const token = await getValidAccessToken(athleteId);
    const detail = await fetchActivityDetail(token, activity.stravaId!);
    return detail?.description ?? detail?.private_note ?? null;
  } catch (error) {
    console.error('[analyze] description Strava non récupérée', error);
    return null;
  }
}

/**
 * Prefer substantial local notes; otherwise best-effort Strava description.
 * Avoids a remote round-trip when the athlete already wrote enough in-app.
 */
export async function resolveAthleteDescription(
  athleteId: string,
  activity: LinkedActivity,
): Promise<string | null> {
  const local = activity.notes?.trim() || null;
  if (hasSubstantialLocalDescription(local)) {
    return local;
  }
  const remote = await fetchStravaDescription(athleteId, activity);
  if (remote?.trim()) {
    return remote.trim();
  }
  return local;
}

/** Cached watts stream only — never triggers a remote fetch during analysis. */
async function loadCachedWatts(activityId: string): Promise<number[] | null> {
  const row = await prisma.activityStream.findUnique({
    where: { activityId },
    select: { available: true, data: true },
  });
  if (!row?.available || row.data === undefined || row.data === null) {
    return null;
  }
  const data = row.data as { watts?: unknown };
  if (!Array.isArray(data.watts) || data.watts.length < 60) {
    return null;
  }
  return data.watts.map((w) => (typeof w === 'number' && Number.isFinite(w) ? w : 0));
}

function formatAthleteThresholdsLine(
  profile: Awaited<ReturnType<typeof getAthleteProfile>>,
): string {
  if (!profile) {
    return '';
  }
  const parts = [
    isSet(profile.ftpW) ? `FTP ${profile.ftpW} W` : null,
    isSet(profile.lthr) ? `LTHR ${profile.lthr} bpm` : null,
    isSet(profile.maxHr) ? `FC max ${profile.maxHr} bpm` : null,
    fmtPace(profile.runThresholdPaceSecPerKm)
      ? `allure seuil ${fmtPace(profile.runThresholdPaceSecPerKm)}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? `Seuils de l'athlète : ${parts.join(', ')}.\n\n` : '';
}

function buildSessionAnalysisPrompt(input: {
  planned: PlannedWithActivity;
  stravaDescription: string | null;
  ftpW: number | null;
  workSummary: BikeWorkSummary | null;
  strengthCompliance: StrengthCompliance | null;
  physicalNotes: ActivePhysicalNote[];
}): string {
  const strengthBlock = input.strengthCompliance
    ? `\n# Conformité muscu (calcul déterministe)\n${formatStrengthCompliance(input.strengthCompliance)}\n`
    : '';
  return `# Séance PRÉVUE
${describePlanned(input.planned, { ftpW: input.ftpW })}

# Séance RÉALISÉE
${describeActual(input.planned.activity!, input.stravaDescription, {
  ftpW: input.ftpW,
  workSummary: input.workSummary,
})}${strengthBlock}
# Suivi physique actif de l'athlète
${describePhysicalNotes(input.physicalNotes)}`;
}

async function loadPlannedSessionAnalysisContext(
  athleteId: string,
  planned: PlannedWithActivity,
): Promise<{
  stravaDescription: string | null;
  profile: Awaited<ReturnType<typeof getAthleteProfile>>;
  physicalNotes: ActivePhysicalNote[];
  workSummary: BikeWorkSummary | null;
}> {
  const [stravaDescription, profile, physicalNotes, watts] = await Promise.all([
    resolveAthleteDescription(athleteId, planned.activity!),
    getAthleteProfile(athleteId),
    getActivePhysicalNotes(athleteId),
    planned.activity!.type === 'BIKE'
      ? loadCachedWatts(planned.activity!.id)
      : Promise.resolve(null),
  ]);
  const ftpW = profile?.ftpW ?? null;
  const workSummary =
    watts && isSet(ftpW)
      ? summarizeBikeWorkBlocks({
          watts,
          ftpW,
          intensity: planned.intensity,
          description: planned.description,
        })
      : null;
  return { stravaDescription, profile, physicalNotes, workSummary };
}

export async function analyzePlannedSession(
  athleteId: string,
  id: string,
): Promise<SessionAnalysis | null> {
  const planned = await getPlannedSessionById(athleteId, id);
  if (!planned || !planned.activity) {
    return null;
  }

  const { stravaDescription, profile, physicalNotes, workSummary } =
    await loadPlannedSessionAnalysisContext(athleteId, planned);
  const ftpW = profile?.ftpW ?? null;
  const strengthCompliance = resolveStrengthCompliance(planned);
  const prompt = `${formatAthleteThresholdsLine(profile)}${buildSessionAnalysisPrompt({
    planned,
    stravaDescription,
    ftpW,
    workSummary,
    strengthCompliance,
    physicalNotes,
  })}`;

  const { output, usage } = await generateText({
    model: COACH_MODEL,
    output: Output.object({ schema: sessionAnalysisSchema }),
    system: ANALYSIS_SYSTEM,
    prompt,
    providerOptions: coachAnalysisGatewayOptions,
  });
  void recordAiUsage(athleteId, 'analysis', usage);

  if (!output) {
    return null;
  }

  const painIds = new Set(painInjuryNotes(physicalNotes).map((n) => n.id));
  const physicalReassessments = (output.physicalReassessments ?? []).filter((r) =>
    painIds.has(r.noteId),
  );

  return applyStrengthScoringGuards(
    sanitizeSessionAnalysisCopy({ ...output, physicalReassessments }),
    planned.type,
    strengthCompliance,
  );
}

/** Prescribed vs realized sets — null unless both sides exist. */
function resolveStrengthCompliance(planned: PlannedWithActivity): StrengthCompliance | null {
  if (planned.type !== 'STRENGTH' || !planned.activity) {
    return null;
  }
  const prescription = parseStrengthPrescription(planned.strengthPrescription);
  if (!prescription) {
    return null;
  }
  return computeStrengthCompliance(prescription.sets, planned.activity.strengthSets);
}

const BRICK_SYSTEM = `Tu es un entraîneur expert en triathlon et en sports d'enchaînement (brick). On te donne un enchaînement multisport (ex. vélo → course) avec, pour chaque sport, ce qui était PRÉVU et ce qui a été RÉELLEMENT réalisé, dans l'ordre.

Analyse l'enchaînement DANS SON ENSEMBLE, pas chaque sport isolément :
- overallScore : 0-100, qualité globale d'exécution du brick (respect des consignes ET gestion de l'enchaînement).
- summary : synthèse globale en 1-2 phrases.
- transition : LE point clé. Évalue l'enchaînement entre les sports : dérive cardiaque entre la fin d'un sport et le début du suivant, perte d'allure/puissance en sortie de vélo (jambes « lourdes »), capacité à retrouver son rythme cible dans les premières minutes. Appuie-toi sur les chiffres (FC, allure, puissance) et sur les temps de transition fournis.
- remarks : remarques factuelles et exploitables sur l'ensemble.
- recommendation : un conseil concret pour mieux réussir les prochains bricks.

Si l'athlète a donné son évaluation (RPE global, note des transitions, ressenti, notes), confronte-la aux chiffres : un ressenti qui contredit les données est une information, pas une erreur.

Réponds en français, sois précis et concis.

${COACH_COPY_DASH_RULE}`;

function sanitizeSessionAnalysisCopy(analysis: SessionAnalysis): SessionAnalysis {
  return {
    ...analysis,
    summary: sanitizeCoachCopy(analysis.summary),
    remarks: analysis.remarks.map(sanitizeCoachCopy),
    recommendation: sanitizeCoachCopy(analysis.recommendation),
    physicalReassessments: analysis.physicalReassessments?.map((item) => ({
      ...item,
      question: sanitizeCoachCopy(item.question),
      comment: sanitizeCoachCopy(item.comment),
    })),
  };
}

function sanitizeBrickAnalysisCopy(analysis: BrickAnalysis): BrickAnalysis {
  return {
    ...analysis,
    summary: sanitizeCoachCopy(analysis.summary),
    transition: sanitizeCoachCopy(analysis.transition),
    remarks: analysis.remarks.map(sanitizeCoachCopy),
    recommendation: sanitizeCoachCopy(analysis.recommendation),
  };
}

function fmtClock(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Analyse GLOBALE d'un brick : agrège les jambes (prévu + réalisé) et évalue
 * les transitions (dérive FC, sortie de vélo). Renvoie null si le brick n'a pas
 * au moins 2 jambes toutes liées à une activité réalisée.
 */
function buildBrickLegBlock(input: {
  leg: Awaited<ReturnType<typeof getBrickSessions>>[number];
  index: number;
  description: string | null;
  ftpW: number | null;
  workSummary: BikeWorkSummary | null;
}): string {
  const header = `## Sport ${input.index + 1} : ${TYPE_FR[input.leg.type] ?? input.leg.type}`;
  return `${header}
### Prévu
${describePlanned(input.leg, { ftpW: input.ftpW })}
### Réalisé
${describeActual(input.leg.activity!, input.description, {
  ftpW: input.ftpW,
  workSummary: input.workSummary,
})}`;
}

function describeBrickTransition(
  prevLeg: Awaited<ReturnType<typeof getBrickSessions>>[number],
  currLeg: Awaited<ReturnType<typeof getBrickSessions>>[number],
): string | null {
  const prev = prevLeg.activity!;
  const curr = currLeg.activity!;
  if (prev.duration === undefined || prev.duration === null) {
    return null;
  }
  const prevEnd = new Date(new Date(prev.date).getTime() + prev.duration * 1000);
  const currStart = new Date(curr.date);
  const gapMin = Math.round((currStart.getTime() - prevEnd.getTime()) / 60000);
  const label = `${TYPE_FR[prevLeg.type]} → ${TYPE_FR[currLeg.type]}`;
  if (gapMin >= 0 && gapMin <= 120) {
    return `${label} : ~${gapMin} min entre la fin (${fmtClock(prevEnd)}) et le départ suivant (${fmtClock(currStart)}).`;
  }
  return `${label} : transition non déterminable de façon fiable (sports peut-être non enregistrés à la suite).`;
}

function describeBrickTransitions(legs: Awaited<ReturnType<typeof getBrickSessions>>): string[] {
  const transitions: string[] = [];
  for (let i = 1; i < legs.length; i++) {
    const line = describeBrickTransition(legs[i - 1], legs[i]);
    if (line) {
      transitions.push(line);
    }
  }
  return transitions;
}

export async function analyzeBrick(
  athleteId: string,
  brickGroupId: string,
): Promise<BrickAnalysis | null> {
  const legs = await getBrickSessions(athleteId, brickGroupId);
  if (legs.length < 2) {
    return null;
  }
  if (legs.some((l) => !l.activity)) {
    return null;
  }

  const [profile, evaluation, descriptions, wattsList] = await Promise.all([
    getAthleteProfile(athleteId),
    getBrickEvaluation(athleteId, brickGroupId),
    Promise.all(legs.map((l) => resolveAthleteDescription(athleteId, l.activity!))),
    Promise.all(
      legs.map((l) =>
        l.type === 'BIKE' && l.activity ? loadCachedWatts(l.activity.id) : Promise.resolve(null),
      ),
    ),
  ]);

  const ftpW = profile?.ftpW ?? null;

  const legBlocks = legs.map((leg, i) =>
    buildBrickLegBlock({
      leg,
      index: i,
      description: descriptions[i],
      ftpW,
      workSummary:
        wattsList[i] && isSet(ftpW)
          ? summarizeBikeWorkBlocks({
              watts: wattsList[i]!,
              ftpW,
              intensity: leg.intensity,
              description: leg.description,
            })
          : null,
    }),
  );

  const transitions = describeBrickTransitions(legs);
  const athleteVerdict = describeBrickEvaluation(evaluation);
  const prompt = `${formatAthleteThresholdsLine(profile)}# Brick : ${legs.length} sports enchaînés (${legs.map((l) => TYPE_FR[l.type] ?? l.type).join(' → ')})

${legBlocks.join('\n\n')}

# Transitions estimées
${transitions.length ? transitions.join('\n') : 'Aucune donnée de transition exploitable.'}${athleteVerdict ? `\n\n${athleteVerdict}` : ''}`;

  const { output, usage } = await generateText({
    model: COACH_MODEL,
    output: Output.object({ schema: brickAnalysisSchema }),
    system: BRICK_SYSTEM,
    prompt,
    providerOptions: coachAnalysisGatewayOptions,
  });
  void recordAiUsage(athleteId, 'analysis', usage);

  return output ? sanitizeBrickAnalysisCopy(output) : output;
}
