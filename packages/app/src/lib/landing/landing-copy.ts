/**
 * Apex landing copy (sharpit.app, ADR-051). Same rules as the teaser: zero athlete data, zero
 * Art. 9 health processing claims, French, no em dashes. Links point at the web app.
 *
 * Every claim about the method is read from the product, never invented: the decision engine
 * (`docs/models/DECISION_ENGINE.md`), the recovery baseline (`RECOVERY_MODEL.md` §5.1, §8.2), the
 * fatigue cold start (`FATIGUE_MODEL.md` §8), the plan's Gate (ADR-005, one rule per file in
 * `packages/server/src/lib/plan-gate/rules/`), Decision Memory (ADR-006) and the sources that
 * ship (`provider-catalog.ts`). Change the copy with the code it describes.
 */

const WEB_ORIGIN = 'https://web.sharpit.app';

export const LANDING_LINKS = {
  signIn: `${WEB_ORIGIN}/sign-in`,
  demo: `${WEB_ORIGIN}/demo`,
  method: '#methode',
  privacy: '/privacy',
  terms: '/terms',
  help: '/aide',
} as const;

export const LANDING_HERO = {
  eyebrow: 'Coach d’endurance · Triathlon, course, vélo, natation',
  titleLines: ['Un plan qui se répare.', 'Une décision chaque matin.'],
  body: 'SharpIt construit ta semaine vers ta course, la relit chaque matin avec ce que ta montre a mesuré, et la répare quand la vie s’en mêle. Chaque conseil arrive avec ses raisons, et rien ne change sans ton accord.',
  rulerNote: 'Ta journée, lue avant qu’elle commence',
  primaryCta: { label: 'Voir la démo', href: LANDING_LINKS.demo },
  secondaryCta: { label: 'Découvrir la méthode', href: LANDING_LINKS.method },
  signIn: { label: 'Connexion', href: LANDING_LINKS.signIn },
} as const;

/** The hero's iPhone, drawn on example figures: the app's Résumé on a morning that eases. */
export const LANDING_PHONE = {
  tag: 'Exemple',
  time: '07:02',
  date: 'Mardi 6 octobre',
  chips: ['Entraînement', 'Journal', '12°'],
  verdictLabel: 'Verdict du jour',
  verdict: 'Séance facile',
  reason: 'Garde tes jambes pour la séance clé de jeudi.',
  confidence: 'Confiance moyenne',
  sessionLabel: 'Séance du jour',
  session: 'Footing facile',
  sessionMeta: '45 min · endurance',
  proposal: 'Allégée ce matin',
  weekLabel: 'Cette semaine',
  week: [
    { day: 'L', state: 'done' },
    { day: 'M', state: 'today' },
    { day: 'M', state: 'planned' },
    { day: 'J', state: 'key' },
    { day: 'V', state: 'rest' },
    { day: 'S', state: 'key' },
    { day: 'D', state: 'planned' },
  ],
  keyLabel: 'Clé',
  tabs: ['Résumé', 'Plan', 'Coach', 'Activité', 'Santé'],
} as const;

/** Read word by word as the visitor scrolls. */
export const LANDING_MANIFESTO = {
  label: 'Le constat',
  text: 'Tu ne manques pas de données. Ta montre en produit chaque jour. Ce qui manque, c’est la continuité : quelqu’un qui relie tes séances, ta charge et ta course, qui se souvient de ce qui a marché, et qui te dit honnêtement quoi faire ce matin.',
} as const;

export type LandingContrast = { others: string; sharpit: string };

export const LANDING_CONTRASTS: readonly LandingContrast[] = [
  { others: 'Un tracker enregistre.', sharpit: 'SharpIt estime ton état et le tient à jour.' },
  {
    others: 'Un calendrier aligne des séances.',
    sharpit: 'SharpIt les réécrit quand ton état change.',
  },
  {
    others: 'Un chatbot improvise.',
    sharpit: 'SharpIt part d’un modèle de toi, preuves à l’appui.',
  },
  {
    others: 'Un score unique résume.',
    sharpit: 'SharpIt garde les conflits visibles, parce qu’ils comptent.',
  },
];

export type LandingStep = {
  index: string;
  label: string;
  title: string;
  body: string;
  /** The step's lab note: what the code actually does, in one line. */
  note: string;
};

/** The method, in the order the product runs it (CORE_ARCHITECTURE's data flow, then the plan). */
export const LANDING_METHOD = {
  label: 'La méthode',
  title: 'Cinq temps, du capteur à ta séance',
  steps: [
    {
      index: '01',
      label: 'Observer',
      title: 'Tout ce qui est mesuré, gardé intact',
      body: 'Séances, charge, mesures du matin, agenda : chaque donnée entre avec sa source et son heure, et n’est jamais réécrite. Quand deux appareils mesurent la même chose, tu choisis lequel fait foi.',
      note: 'Une source principale par type de donnée, les autres comblent les trous',
    },
    {
      index: '02',
      label: 'Comparer',
      title: 'À toi, pas à une moyenne',
      body: 'Tes mesures du matin sont lues contre ta propre ligne de base des quatorze derniers jours. Un écart de moins de 5 % est traité comme du bruit, pas comme une alerte.',
      note: 'Ligne de base personnelle · 14 jours glissants · zone de bruit ±5 %',
    },
    {
      index: '03',
      label: 'Arbitrer',
      title: 'Une décision, trois raisons au plus',
      body: 'Cinq lectures indépendantes, forme du jour, fatigue, progression, état physique et conditions extérieures, sont arbitrées en une seule décision. En cas de conflit, la prudence l’emporte.',
      note: 'Même situation, même décision : l’arbitrage est déterministe',
    },
    {
      index: '04',
      label: 'Programmer',
      title: 'Une semaine construite vers ta course',
      body: 'Le coach propose tes séances selon ton objectif, tes jours libres et ton matériel. Deux ou trois sont marquées clés, les autres sont du bonus. Chaque proposition passe treize contrôles avant de t’être montrée.',
      note: 'Sprint, M, 70.3, Ironman, ou la course que tu prépares',
    },
    {
      index: '05',
      label: 'Réparer',
      title: 'Le plan suit ta vie, pas l’inverse',
      body: 'Ta forme du matin a baissé ? Il propose d’alléger la séance, ou de l’augmenter quand tout est au vert. Une séance ratée ? Il réorganise la fin de ta semaine. Tu acceptes, tu ajustes ou tu gardes ton plan.',
      note: 'Aucune modification sans ton accord',
    },
  ] satisfies LandingStep[],
} as const;

/** The words drawn inside the method's diagrams, one entry per step. */
export const LANDING_DIAGRAMS = {
  observe: {
    sources: ['Garmin', 'Apple Santé', 'Withings'],
    primary: 'principale',
    model: 'Ton modèle',
  },
  compare: { window: '14 jours', band: '±5 % : bruit', outlier: '−9 % : à lire' },
  arbitrate: {
    readings: ['RAS', 'Prudence', 'Bonne', 'RAS', 'Pousser'],
    verdict: 'Séance facile',
    rule: 'La prudence gagne',
  },
  programme: { days: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], key: 'Clé', checks: '13 / 13 contrôles' },
  repair: { missed: 'Ratée', proposal: 'Proposé, à valider' },
} as const;

/** The decision engine's domain priority, safest first (DECISION_ENGINE.md). */
export const LANDING_PRIORITY = [
  'État physique',
  'Fatigue',
  'Forme du jour',
  'Conditions',
  'Progression',
] as const;

/** An example morning, labelled as such: no athlete's data is shown on the landing. */
export const LANDING_MORNING = {
  label: 'Un matin type',
  title: 'Ce que tu lis à 7 h',
  body: 'Un verdict, ce qui le limite, les preuves rangées par importance et le niveau de confiance. Si deux lectures se contredisent, la plus prudente gagne et tu sais pourquoi.',
  example: {
    tag: 'Exemple',
    time: 'Mardi · 07:02',
    verdict: 'Séance facile aujourd’hui, garde tes jambes pour jeudi',
    limitingLabel: 'Facteur limitant',
    limiting: 'Fatigue',
    evidence: [
      'Charge des 7 derniers jours 18 % au-dessus de ton habitude',
      'Séance clé jeudi : seuil vélo, 3 × 12 min',
      'Mollet gauche en reprise : pas de côtes aujourd’hui',
    ],
    proposal: {
      label: 'Proposé',
      from: '8 × 400 m',
      to: '45 min footing facile',
      accept: 'Alléger',
      keep: 'Garder le plan',
    },
    confidenceLabel: 'Confiance',
    confidence: 'Moyenne · 0,68',
    /** Where 0.68 sits on the 0–1 scale, for the confidence bar. */
    confidenceValue: 0.68,
  },
  priorityLabel: 'Ordre de priorité',
} as const;

/** One line per rule of the plan's Gate (ADR-005), in the athlete's words. */
export const LANDING_GUARDRAILS = {
  label: 'Les garde-fous',
  count: 13,
  title: 'contrôles avant que tu voies une séance',
  body: 'Le coach rédige, des règles fixes vérifient. Une proposition n’est jamais modifiée en silence : elle passe, elle est signalée, elle attend ta confirmation, ou elle est retirée.',
  rules: [
    'Compatible avec le verdict du jour',
    'Respecte ton état physique',
    'Ne charge pas une zone à protéger',
    'Charge de la semaine tenable',
    'Deux à trois séances intenses par semaine, pas plus',
    'Séances intenses espacées de 24 h',
    'Rien après la date de ta course',
    'Pas de conflit avec ton agenda',
    'Une séance faite n’est jamais réécrite',
    'Seulement les sports que tu pratiques',
    'Séances de renforcement complètes',
    'Sans seuils connus, il demande ta confirmation',
    'Ni doublon, ni séance mal formée',
  ],
} as const;

export type LandingTier = { label: string; threshold: string; effect: string };

/** The decision engine's confidence policy, then the models' cold start. */
export const LANDING_HONESTY = {
  label: 'L’incertitude',
  title: 'Il te dit quand il ne sait pas.',
  body: 'Chaque verdict porte son niveau de confiance. Quand les données manquent, SharpIt ne fabrique pas de certitude : il retient son conseil et te dit ce qui lui manque.',
  tiers: [
    { label: 'Élevée', threshold: '≥ 0,75', effect: 'Conseil complet' },
    { label: 'Moyenne', threshold: '≥ 0,60', effect: 'Conseil, avec prudence' },
    { label: 'Faible', threshold: '> 0', effect: 'Signalé comme fragile' },
    { label: 'Insuffisante', threshold: '0', effect: 'Pas de conseil' },
  ] satisfies LandingTier[],
  rampLabel: 'Ce que ton modèle apprend',
  ramp: [
    { at: '7 jours', body: 'Ta ligne de base devient exploitable' },
    { at: '28 jours', body: 'Elle est mûre, tes habitudes apparaissent' },
    { at: '5 semaines', body: 'La fatigue est lue sur ses cinq dimensions' },
    { at: '90 jours', body: 'Le modèle se calibre sur tes réponses' },
  ],
  rampNote:
    'Ton historique Garmin est importé à la connexion : la lecture de ta charge n’attend pas cinq semaines.',
} as const;

export const LANDING_MEMORY = {
  label: 'La mémoire',
  title: 'Il se souvient de ce qui a marché.',
  body: 'Chaque conseil est gardé avec ce que tu as choisi et ce qui a suivi. Ton modèle ne repart pas de zéro chaque lundi, ni quand tu changes de montre.',
  trail: [
    { label: 'Conseillé', body: 'Alléger la séance de seuil' },
    { label: 'Choisi', body: 'Plan gardé' },
    { label: 'Ce qui a suivi', body: 'Fatigue en hausse sur trois jours' },
  ],
} as const;

export type LandingSurface = { name: string; body: string };

export const LANDING_APP = {
  label: 'Dans l’app iPhone',
  title: 'Tout tient dans cinq onglets',
  surfaces: [
    { name: 'Résumé', body: 'Le verdict du matin, ta séance et ta régularité.' },
    { name: 'Plan', body: 'Ta semaine, tes séances clés et tes objectifs.' },
    {
      name: 'Coach',
      body: 'Pose une question, il répond depuis ton modèle. Chaque changement attend ton accord.',
    },
    { name: 'Activité', body: 'Chaque séance relue face à ce qui était prévu, et tes records.' },
    { name: 'Santé', body: 'Un bilan rangé par ce qui compte, et tes zones sensibles.' },
  ] satisfies LandingSurface[],
  extras: [
    'Journal alimentaire noté, qui explique ses notes',
    'Widgets et rappels de séance',
    'Lecture essentielle ou experte, au choix',
    'Le carnet web pour relire ta saison sur grand écran',
  ],
} as const;

export const LANDING_REFUSALS = {
  label: 'Ce que SharpIt ne fera jamais',
  items: [
    'Des séries à ne pas casser',
    'Un classement ou un fil social',
    'Un score unique qui cache les conflits',
    'Une certitude fabriquée',
    'Des notifications pour te faire revenir',
    'Changer ton plan sans ton accord',
  ],
} as const;

/** Only what ships is listed as connected; the rest is announced, never claimed. */
export const LANDING_SOURCES = {
  title: 'Branché sur tes appareils',
  subtitle: 'La montre change, ton modèle reste.',
  connected: ['Garmin', 'Apple Santé', 'Withings', 'Google Agenda'],
  importLabel: 'Import',
  imported: ['MyFitnessPal'],
  upcomingLabel: 'Bientôt',
  upcoming: ['Strava', 'Polar'],
} as const;

export type LandingQuestion = { question: string; answer: string };

export const LANDING_FAQ = {
  label: 'Questions',
  title: 'Ce qu’on nous demande',
  items: [
    {
      question: 'Faut-il une montre Garmin ?',
      answer:
        'Non. Une Apple Watch suffit, par Apple Santé. Si tu as les deux, Garmin fait foi et Apple Santé comble les trous.',
    },
    {
      question: 'Pour quels sports ?',
      answer:
        'Course, vélo, natation, triathlon et renforcement. Un enchaînement vélo puis course est planifié et relu comme une seule séance.',
    },
    {
      question: 'Et si je rate une séance ?',
      answer:
        'Le lendemain, SharpIt te propose de réorganiser ta semaine en une touche. Seules les séances clés comptent vraiment, les autres sont du bonus.',
    },
    {
      question: 'Est-ce que ça remplace un coach ?',
      answer:
        'SharpIt coache à partir de ton modèle et te laisse toujours le dernier mot. Un coach humain peut travailler à côté : rien ne change sans ton accord.',
    },
    {
      question: 'Où sont mes données ?',
      answer:
        'Sur nos serveurs en Europe, jamais sur iCloud. Tu peux tout exporter ou supprimer ton compte à tout moment, depuis l’app ou le site.',
    },
    {
      question: 'C’est payant ?',
      answer:
        'Ton plan, ton journal et tes données sont accessibles sans abonnement. SharpIt Pro ajoute les lectures approfondies : bilan de la semaine, analyse de chaque séance, lecture de ton alimentation.',
    },
    {
      question: 'Comment commencer ?',
      answer:
        'Ton compte se crée dans l’app iPhone, aujourd’hui en bêta. En attendant l’App Store, la démo ouvre le carnet web sur un compte d’exemple.',
    },
  ] satisfies LandingQuestion[],
} as const;

export const LANDING_CLOSING = {
  title: 'Une décision le matin. Le reste de la journée t’appartient.',
  body: 'L’app iPhone arrive bientôt sur l’App Store.',
  cta: { label: 'Voir la démo', href: LANDING_LINKS.demo },
} as const;

export const LANDING_FOOTER_LINKS = [
  { label: 'Aide', href: LANDING_LINKS.help },
  { label: 'Confidentialité', href: LANDING_LINKS.privacy },
  { label: 'Conditions', href: LANDING_LINKS.terms },
  { label: 'Connexion', href: LANDING_LINKS.signIn },
] as const;

/** Every athlete-facing string on the landing, for the forbidden-copy guard. */
export function landingCopyStrings(): string[] {
  const { example } = LANDING_MORNING;
  return [
    LANDING_HERO.eyebrow,
    ...LANDING_HERO.titleLines,
    LANDING_HERO.body,
    LANDING_HERO.rulerNote,
    LANDING_HERO.primaryCta.label,
    LANDING_HERO.secondaryCta.label,
    ...Object.values(LANDING_PHONE).flatMap((value) =>
      typeof value === 'string'
        ? [value]
        : value.map((item) => (typeof item === 'string' ? item : item.day)),
    ),
    LANDING_MANIFESTO.label,
    LANDING_MANIFESTO.text,
    ...LANDING_CONTRASTS.flatMap((row) => [row.others, row.sharpit]),
    LANDING_METHOD.label,
    LANDING_METHOD.title,
    ...LANDING_METHOD.steps.flatMap((step) => [step.label, step.title, step.body, step.note]),
    ...LANDING_PRIORITY,
    ...Object.values(LANDING_DIAGRAMS).flatMap((labels) =>
      Object.values(labels).flatMap((value) => (typeof value === 'string' ? [value] : value)),
    ),
    LANDING_MORNING.label,
    LANDING_MORNING.title,
    LANDING_MORNING.body,
    LANDING_MORNING.priorityLabel,
    example.tag,
    example.time,
    example.verdict,
    example.limitingLabel,
    example.limiting,
    ...example.evidence,
    ...Object.values(example.proposal),
    example.confidenceLabel,
    example.confidence,
    LANDING_GUARDRAILS.label,
    LANDING_GUARDRAILS.title,
    LANDING_GUARDRAILS.body,
    ...LANDING_GUARDRAILS.rules,
    LANDING_HONESTY.label,
    LANDING_HONESTY.title,
    LANDING_HONESTY.body,
    ...LANDING_HONESTY.tiers.flatMap((tier) => [tier.label, tier.threshold, tier.effect]),
    LANDING_HONESTY.rampLabel,
    ...LANDING_HONESTY.ramp.flatMap((stage) => [stage.at, stage.body]),
    LANDING_HONESTY.rampNote,
    LANDING_MEMORY.label,
    LANDING_MEMORY.title,
    LANDING_MEMORY.body,
    ...LANDING_MEMORY.trail.flatMap((entry) => [entry.label, entry.body]),
    LANDING_APP.label,
    LANDING_APP.title,
    ...LANDING_APP.surfaces.flatMap((surface) => [surface.name, surface.body]),
    ...LANDING_APP.extras,
    LANDING_REFUSALS.label,
    ...LANDING_REFUSALS.items,
    LANDING_SOURCES.title,
    LANDING_SOURCES.subtitle,
    ...LANDING_SOURCES.connected,
    LANDING_SOURCES.importLabel,
    ...LANDING_SOURCES.imported,
    LANDING_SOURCES.upcomingLabel,
    ...LANDING_SOURCES.upcoming,
    LANDING_FAQ.label,
    LANDING_FAQ.title,
    ...LANDING_FAQ.items.flatMap((item) => [item.question, item.answer]),
    LANDING_CLOSING.title,
    LANDING_CLOSING.body,
    LANDING_CLOSING.cta.label,
  ];
}
