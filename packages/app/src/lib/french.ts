// French string resolver for domain I18nItem codes.
// Maps all codes emitted by the inference layer to natural French.
// To add a language: duplicate this file, translate the strings.

export type I18nItem = {
  code: string;
  params?: Record<string, string | number>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Enum param translations
// ─────────────────────────────────────────────────────────────────────────────

const DIMENSION_FR: Record<string, string> = {
  LOAD: 'charge',
  NEUROMUSCULAR: 'neuromusculaire',
  METABOLIC: 'métabolique',
  CUMULATIVE: 'accumulation multi-semaines',
  PSYCHOLOGICAL: 'psychologique',
  load: 'charge',
  neuromuscular: 'neuromusculaire',
  metabolic: 'métabolique',
  cumulative: 'accumulation multi-semaines',
  psychological: 'psychologique',
};

const TREND_FR: Record<string, string> = {
  IMPROVING: 'en progression',
  STABLE: 'stable',
  DECLINING: 'en déclin',
};

const MODEL_SYSTEM_FR: Record<string, string> = {
  RECOVERY: 'récupération',
  FATIGUE: 'fatigue',
  ADAPTATION: 'adaptation',
};

const LIMITER_FR: Record<string, string> = {
  autonomic: 'le système autonome',
  sleep: 'le sommeil',
  subjective: 'le ressenti subjectif',
  loadContext: "la charge d'entraînement",
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup table — code → French template string
// Use {param} placeholders matching I18nItem.params keys.
// ─────────────────────────────────────────────────────────────────────────────

const STRINGS: Record<string, string> = {
  // ── Top actions ────────────────────────────────────────────────────────────
  // Top-action strings — aligned with the shared verdict glossary (impératif tutoyé).
  // Card + Coach prefer `verdict-copy.ts`; these remain for resolveCode / legacy paths.
  'reasoning.topAction.trainHard.verb': 'Enchaîne',
  'reasoning.topAction.trainHard.focus.progressiveOverload':
    'la séance clé avec une progression mesurée',
  'reasoning.topAction.trainHard.focus.aerobicBase': 'la séance prévue avec engagement',
  'reasoning.topAction.trainHard.rationale':
    'Tes signaux du jour suggèrent une bonne tolérance à une charge élevée.',

  'reasoning.topAction.trainSmart.verb': 'Garde',
  'reasoning.topAction.trainSmart.focus': 'la qualité, coupe le volume',
  'reasoning.topAction.trainSmart.rationale': 'Tu peux viser la qualité plutôt que le volume.',

  'reasoning.topAction.trainEasy.verb': 'Reste',
  'reasoning.topAction.trainEasy.focus': 'en endurance facile',
  'reasoning.topAction.trainEasy.rationale':
    'Préserve ton énergie — la récupération reste prioritaire.',

  'reasoning.topAction.recover.verb': 'Privilégie',
  'reasoning.topAction.recover.focusDefault': 'le repos ou une marche très légère',
  'reasoning.topAction.recover.rationale':
    'Tes signaux du jour indiquent un besoin de repos pour rebondir.',

  'reasoning.topAction.raceReady.verb': 'Fais',
  'reasoning.topAction.raceReady.focus': 'la séance qualité prévue',
  'reasoning.topAction.raceReady.rationale':
    'Tes signaux du jour sont favorables à une bonne performance.',

  'reasoning.topAction.caution.verb': 'Baisse',
  'reasoning.topAction.caution.focus': 'l’intensité de la séance prévue',
  'reasoning.topAction.caution.rationale': 'Des signaux contradictoires appellent à la modération.',

  // ── Findings — overreaching without adaptation ──────────────────────────
  'reasoning.finding.overreachingNoAdapt.title': 'Surcharge sans adaptation détectée',
  'reasoning.finding.overreachingNoAdapt.evidence.fatigueIndex': 'Index de fatigue à {index}',
  'reasoning.finding.overreachingNoAdapt.evidence.autonomicSuppressed': 'Système autonome supprimé',
  'reasoning.finding.overreachingNoAdapt.evidence.noAdaptation': 'Aucune adaptation mesurée',

  // ── Findings — overreaching risk ────────────────────────────────────────
  'reasoning.finding.overreachingRisk.title': 'Risque de surmenage',
  'reasoning.finding.overreachingRisk.evidence.fatigueIndex': 'Index de fatigue à {index}',
  'reasoning.finding.overreachingRisk.evidence.accumulationDays':
    'Accumulation depuis {days} jour(s)',
  'reasoning.finding.overreachingRisk.evidence.performanceImpairment':
    'Performance réduite de {percent}%',

  // ── Findings — low readiness ─────────────────────────────────────────────
  'reasoning.finding.lowReadiness.title': 'Forme réduite',
  'reasoning.finding.lowReadiness.titleCritical': 'Forme très basse',
  'reasoning.finding.lowReadiness.evidence.score': 'Score de forme : {score}/100',
  'reasoning.finding.lowReadiness.evidence.limiter': 'Facteur limitant : {limiter}',
  'reasoning.finding.lowReadiness.evidence.multipleAffected': 'Plusieurs dimensions affectées',
  'reasoning.finding.lowReadiness.evidence.estimatedRecovery':
    'Récupération estimée dans {days} jour(s)',
  'reasoning.finding.lowReadiness.evidence.recoveryUnclear': 'Délai de récupération indéterminé',

  // ── Findings — dissonance ────────────────────────────────────────────────
  'reasoning.finding.dissonance.title': 'Signaux divergents',
  'reasoning.finding.dissonance.evidence.disagreement':
    'Ressenti et mesures ne disent pas la même chose',
  'reasoning.finding.dissonance.evidence.causes':
    'Peut refléter une adaptation ou un stress atypique',
  'reasoning.finding.dissonance.evidence.prioritiseObjective':
    'Privilégie une séance à intensité maîtrisée',

  // ── Findings — fatigue accumulating ─────────────────────────────────────
  'reasoning.finding.fatigueAccumulating.title': 'Fatigue en accumulation depuis {days} jour(s)',
  'reasoning.finding.fatigueAccumulating.evidence.fatigueIndex': 'Index de fatigue à {index}',
  'reasoning.finding.fatigueAccumulating.evidence.dominantSystem': 'Dimension dominante : {system}',
  'reasoning.finding.fatigueAccumulating.evidence.timeToFresh':
    'Délai estimé avant récupération : {days} jour(s)',
  'reasoning.finding.fatigueAccumulating.evidence.timeToFreshUnknown':
    'Délai de récupération indéterminé',

  // ── Findings — plateau risk ──────────────────────────────────────────────
  'reasoning.finding.plateauRisk.title': 'Risque de plateau',
  'reasoning.finding.plateauRisk.evidence.adaptationIndex': "Index d'adaptation : {index}",
  'reasoning.finding.plateauRisk.evidence.noStimulus': 'Stimulation insuffisante récemment',
  'reasoning.finding.plateauRisk.evidence.changeRecommended':
    'Un changement de stimulus est recommandé',

  // ── Findings — cross-system conflict ────────────────────────────────────
  'reasoning.finding.crossSystemConflict.title': 'Conflit entre systèmes ({conflictType})',
  'reasoning.finding.crossSystemConflict.evidence.affectedModels': 'Modèles concernés : {models}',

  // ── Findings — optimal state ─────────────────────────────────────────────
  'reasoning.finding.optimalState.title': 'État très favorable détecté',
  'reasoning.finding.optimalState.evidence.readiness': 'Score de forme : {score}/100',
  'reasoning.finding.optimalState.evidence.fatigueIndex': 'Index de fatigue : {index}',
  'reasoning.finding.optimalState.evidence.highCapacity':
    "Bonne capacité d'entraînement disponible",

  // ── Findings — positive adaptation ─────────────────────────────────────
  'reasoning.finding.positiveAdaptation.title': 'Adaptation positive en cours',
  'reasoning.finding.positiveAdaptation.evidence.adaptationIndex': "Index d'adaptation : {index}",
  'reasoning.finding.positiveAdaptation.evidence.trend': 'Tendance : {trend}',
  'reasoning.finding.positiveAdaptation.evidence.peakEstimate':
    "Pic d'adaptation estimé dans {days} jour(s)",
  'reasoning.finding.positiveAdaptation.evidence.trajectoryPositive': 'Trajectoire favorable',

  'reasoning.finding.environmentalLoad.title': 'Charge environnementale significative',
  'reasoning.finding.environmentalLoad.evidence.recoveryDemand':
    'Demande de récupération majorée de {recoveryPct} %',
  'reasoning.finding.environmentalLoad.evidence.performanceExpectation':
    'Performance attendue réduite d’environ {performancePct} %',

  'decision.limitingFactor.physicalHealth.blocked':
    'Condition active : {condition} — entraînement à suspendre',
  'decision.limitingFactor.physicalHealth.blockedGeneric':
    'Condition physique — entraînement suspendu',
  'decision.limitingFactor.physicalHealth.reduced': '{condition} limite la capacité d’entraînement',
  'decision.limitingFactor.physicalHealth.reducedGeneric':
    'Capacité réduite par une condition physique',
  'decision.limitingFactor.environment.significant':
    'Conditions environnementales exigeantes aujourd’hui',

  'decision.primary.headline.physicalHealth':
    'Priorité santé — protège ta récupération avant la performance',
  'decision.primary.headline.environment': 'L’environnement pèse sur ta forme — adapte l’intensité',
  'decision.primary.headline.recover.fatigue':
    'La fatigue impose une vraie récupération aujourd’hui',
  'decision.primary.headline.recover.recovery': 'Ta récupération est insuffisante pour pousser',
  'decision.primary.headline.recover': 'Journée de récupération prioritaire',
  'decision.primary.headline.trainHard': 'Fenêtre favorable — tu peux viser une séance exigeante',
  'decision.primary.headline.raceReady': 'Forme de pic — séance qualité ou compétition possible',
  'decision.primary.headline.caution': 'Signaux mixtes — prudence et écoute du corps',
  'decision.primary.headline.trainEasy': 'Charge légère — garde de la marge',
  'decision.primary.headline.trainSmart': 'Entraîne-toi avec discernement aujourd’hui',
  'decision.primary.headline.insufficient': 'Données insuffisantes pour une recommandation fiable',

  // ── Limiting factors ─────────────────────────────────────────────────────
  'reasoning.limitingFactor.fatigue.overreaching':
    'Surmenage — la dimension {dimension} est le facteur limitant',
  'reasoning.limitingFactor.fatigue.accumulated':
    'Fatigue accumulée ({dimension}) depuis {days} jour(s)',
  // deficit always ships params.limiter; criticallyLow/reduced never do — no `{limiter}` there.
  'reasoning.limitingFactor.recovery.deficit': 'Récupération en déficit · frein : {limiter}',
  'reasoning.limitingFactor.recovery.criticallyLow': 'Récupération critique',
  'reasoning.limitingFactor.recovery.reduced': 'Récupération réduite',
  'reasoning.limitingFactor.adaptation.factor': 'Adaptation freinée par : {factor}',
  'reasoning.limitingFactor.adaptation.insufficientStimulus':
    'Stimulus insuffisant — la progression stagne',
  'reasoning.limitingFactor.adaptation.plateau': "Plateau d'adaptation atteint",

  // ── Opportunities ────────────────────────────────────────────────────────
  'reasoning.opportunity.loadIncrease.title': "Fenêtre d'augmentation de charge",
  'reasoning.opportunity.loadIncrease.rationale':
    "Tes signaux suggèrent une marge pour progresser — c'est un bon moment pour augmenter.",
  'reasoning.opportunity.qualitySession.title': 'Séance de qualité possible',
  'reasoning.opportunity.qualitySession.rationale':
    'La forme et la fraîcheur semblent réunies pour une séance de haute qualité.',
  'reasoning.opportunity.deload.title': 'Semaine allégée recommandée dans {days} jour(s)',
  'reasoning.opportunity.deload.rationale': "Planifier un déload maintenant optimise l'adaptation.",
  'reasoning.opportunity.raceReadiness.title': 'Pic de forme dans {days} jour(s)',
  'reasoning.opportunity.raceReadiness.rationale': "Tu approches d'un pic — affine et préserve.",
  'reasoning.opportunity.recoveryWindow.title': 'Fenêtre de récupération',
  'reasoning.opportunity.recoveryWindow.rationale':
    'La charge doit être réduite pour permettre une récupération complète.',

  // ── Conflicts ────────────────────────────────────────────────────────────
  'reasoning.conflict.capacityConflict01.description':
    'Conflit de capacité entre les modèles de fatigue et de récupération',
  'reasoning.conflict.capacityConflict01.resolution':
    'Priorité à la récupération — réduire la charge',
  'reasoning.conflict.timingConflict01.description': "Fenêtres d'adaptation contradictoires",
  'reasoning.conflict.timingConflict01.resolution': "S'appuyer sur le modèle le plus récent",
  'reasoning.conflict.signalConflict01.description': 'Signaux contradictoires',
  'reasoning.conflict.signalConflict01.resolution':
    "Maintenir une intensité modérée jusqu'à résolution",

  // ── Arbitration (resolved disagreement) ───────────────────────────────────
  'reasoning.finding.arbitration.title': 'Décision retenue après analyse croisée',
  'reasoning.finding.arbitration.evidence.verdict': 'Orientation du jour : {verdict}',
  'reasoning.finding.arbitration.evidence.priority':
    'Priorité au modèle {system} en cas de désaccord',

  // ── Model direction conflict (legacy — no longer surfaced to athletes) ───
  'reasoning.finding.modelDirectionConflict.title': 'Les modèles ne s’accordent pas',
  'reasoning.finding.modelDirectionConflict.evidence.recovery':
    'Récupération : tendance à {direction}',
  'reasoning.finding.modelDirectionConflict.evidence.fatigue': 'Fatigue : tendance à {direction}',
  'reasoning.finding.modelDirectionConflict.evidence.adaptation':
    'Adaptation : tendance à {direction}',

  // ── Fatigue evidence ─────────────────────────────────────────────────────
  'fatigue.evidence.limitingFactor': 'Facteur limitant : {dimension}',
  'fatigue.evidence.timeToFresh': 'Retour à la fraîcheur estimé dans {days} jour(s)',
  'fatigue.evidence.performanceCapacity': 'Capacité estimée : {pct} %',

  // ── Fatigue rationale (directive de charge) ───────────────────────────────
  'fatigue.rationale.noData': 'Données insuffisantes — prudence par défaut.',
  'fatigue.rationale.criticalOverreaching':
    'Surmenage fonctionnel critique — décharge obligatoire.',
  'fatigue.rationale.consecutiveDays': '{days} jours consécutifs d’accumulation de fatigue.',
  'fatigue.rationale.loadReductionRequired':
    'La charge doit être réduite pour permettre l’absorption.',
  'fatigue.rationale.stillAccumulating':
    'La fatigue continue de s’accumuler — ne pas ajouter de stress.',
  'fatigue.rationale.accumulatedFatigue': 'Fatigue accumulée au-delà du seuil de récupération.',
  'fatigue.rationale.estimatedFresh': 'Retour à la fraîcheur estimé dans {days} jour(s).',
  'fatigue.rationale.productiveState':
    'Fatigue fonctionnelle élevée — état productif si bien géré.',
  'fatigue.rationale.avoidAddingLoad': 'Tendance à l’accumulation — éviter d’ajouter de la charge.',
  'fatigue.rationale.loadBelowOptimal': 'Charge sous le sweet spot — marge pour progresser.',
  'fatigue.rationale.maintainCurrent': 'Charge actuelle adaptée — maintenir le niveau.',
  'fatigue.rationale.lowFatigue': 'Fatigue basse — capacité disponible pour augmenter la charge.',
  'fatigue.rationale.loadRatioElevated':
    'Ratio charge aiguë/chronique élevé — prudence malgré une fatigue basse.',
  'fatigue.rationale.neuromuscularDominant': 'La composante neuromusculaire domine la fatigue.',
  'fatigue.rationale.metabolicDominant': 'La composante métabolique domine la fatigue.',

  // ── Fatigue primary limiting factor ───────────────────────────────────────
  'fatigue.primaryLimitingFactor.load':
    'La charge d’entraînement est le principal levier aujourd’hui.',
  'fatigue.primaryLimitingFactor.neuromuscular':
    'La récupération neuromusculaire est le principal levier.',
  'fatigue.primaryLimitingFactor.metabolic': 'La fatigue métabolique est le principal levier.',
  'fatigue.primaryLimitingFactor.cumulative':
    'L’historique de charge sur plusieurs semaines pèse le plus.',
  'fatigue.primaryLimitingFactor.psychological': 'Le stress psychologique est le principal levier.',
  'fatigue.primaryLimitingFactor.multiple': 'Plusieurs dimensions contribuent à la fatigue.',

  // ── Recovery evidence & rationale ────────────────────────────────────────
  'recovery.evidence.score': 'Score de récupération : {score}/100',
  'recovery.rationale.excellent': 'Récupération excellente — intensité élevée possible.',
  'recovery.rationale.good': 'Bonne récupération — entraînement normal indiqué.',
  'recovery.rationale.partial': 'Récupération partielle — privilégier une intensité modérée.',
  'recovery.rationale.incomplete': 'Récupération incomplète — séance légère recommandée.',
  'recovery.rationale.insufficient': 'Récupération insuffisante — repos ou très léger.',
  'recovery.rationale.noData': 'Données insuffisantes — prudence par défaut.',
  'recovery.rationale.autonomicSuppressed': 'Système nerveux autonome en tension.',
  'recovery.rationale.sleepLimiting': 'Le sommeil limite la récupération aujourd’hui.',
  'recovery.rationale.overreachingRisk': 'Risque de surmenage détecté.',
  'recovery.rationale.dissonance': 'Écart entre signaux objectifs et ressenti.',
  // illnessRisk — training estimates only; not a diagnosis (Science Sport V0)
  'recovery.rationale.illnessRisk.acute':
    'Signal de récupération atypique — le profil ressemble à une baisse de résilience.',
  'recovery.rationale.illnessRisk.mandatory':
    'Repos recommandé aujourd’hui pour protéger la récupération.',
  'recovery.rationale.illnessRisk.consult': 'En cas de symptômes, consulte un avis médical.',

  // ── Adaptation evidence & rationale ────────────────────────────────────────
  'adaptation.rationale.noData': 'Données insuffisantes pour lire ton adaptation.',
  'adaptation.rationale.overreachingDetected':
    'La charge récente dépasse ce que ton organisme semble absorber.',
  'adaptation.rationale.autonomicSuppressed':
    'Le système nerveux montre des signes de suppression.',
  'adaptation.rationale.immediateReduction':
    'Réduire la charge maintenant favorise le rebond adaptatif.',
  'adaptation.rationale.supercompensation':
    'Tu es dans une phase d’assimilation productive : maintiens le cap.',
  'adaptation.rationale.restrictedCapacity':
    'L’adaptation reste positive, mais la capacité du jour est limitée.',
  'adaptation.rationale.plateauRisk':
    'La trajectoire se maintient, mais un nouveau stimulus devient utile.',
  'adaptation.rationale.stableLoad': 'La charge actuelle soutient encore la progression.',
  'adaptation.rationale.stalled': 'L’adaptation semble plafonner sur les derniers jours.',
  'adaptation.rationale.loadProgressionLow':
    'La progression de charge est trop faible pour relancer l’adaptation.',
  'adaptation.rationale.maladaptation':
    'Les signaux montrent une réponse défavorable à la charge actuelle.',
  'adaptation.rationale.detraining':
    'Le niveau de stimulation récent paraît insuffisant pour entretenir les acquis.',
  'adaptation.evidence.index': 'Index d’adaptation : {index}/100',
  'adaptation.evidence.overreachingPattern': 'Le stress accumulé dépasse les gains observés.',
  'adaptation.evidence.plateauRisk': 'La trajectoire récente suggère un risque de plateau.',
  'adaptation.evidence.trend': 'Tendance {trend} sur {days} jour(s).',
};

// ─────────────────────────────────────────────────────────────────────────────
// Resolve an I18nItem to French
// ─────────────────────────────────────────────────────────────────────────────

const PARAM_RESOLVERS: Record<string, (raw: unknown) => string> = {
  dimension: (raw) => DIMENSION_FR[String(raw)] ?? String(raw),
  system: (raw) => MODEL_SYSTEM_FR[String(raw)] ?? DIMENSION_FR[String(raw)] ?? String(raw),
  trend: (raw) => TREND_FR[String(raw)] ?? String(raw),
  limiter: (raw) => LIMITER_FR[String(raw)] ?? String(raw),
};

function resolveParam(key: string, raw: unknown): string {
  if (raw === undefined || raw === null) {
    // Never emit a literal `{param}` — missing params omit the token.
    return '';
  }
  return PARAM_RESOLVERS[key]?.(raw) ?? String(raw);
}

export function resolve(item: I18nItem): string {
  const template = STRINGS[item.code];
  if (!template) {
    return item.code;
  }

  return template
    .replace(/\{(\w+)\}/g, (_, key) => resolveParam(key, item.params?.[key]))
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([·•,;:.!?])/g, '$1')
    .replace(/\s·\s*$/g, '')
    .trim();
}

// Convenience: resolve a plain code string (for TopAction verbCode / focusCode / rationaleCode)
export function resolveCode(code: string): string {
  return resolve({ code });
}
