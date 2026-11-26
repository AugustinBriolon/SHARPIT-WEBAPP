/**
 * Apex landing copy (sharpit.app, ADR-051). Same rules as the teaser: zero athlete data, zero
 * Art. 9 health processing claims, French, no em dashes. Links point at the web app.
 *
 * Every claim is read from the product, never invented: the decision engine
 * (`docs/models/DECISION_ENGINE.md`), the plan's Gate (ADR-005, one rule per file in
 * `packages/server/src/lib/plan-gate/rules/`) and the sources that ship (`provider-catalog.ts`).
 * Change the copy with the code it describes.
 */

const WEB_ORIGIN = 'https://web.sharpit.app';

export const LANDING_LINKS = {
  signIn: `${WEB_ORIGIN}/sign-in`,
  demo: `${WEB_ORIGIN}/demo`,
  // The beta's public TestFlight link (group « Beta-test », 10 testers). Swap for the App Store page at release.
  download: 'https://testflight.apple.com/join/wgkSyMNr',
  privacy: '/privacy',
  terms: '/terms',
  help: '/aide',
  instagram: 'https://www.instagram.com/sharpit.app/',
  x: 'https://x.com/sharpitapp',
} as const;

export const LANDING_HERO = {
  titleLines: ['Tu rates une séance, ton plan se recale.', 'Une décision chaque matin.'],
  body: 'SharpIt construit ta semaine vers ta course, la relit chaque matin avec ce que ta montre a mesuré, et la répare quand la vie s’en mêle.',
  download: { label: 'Rejoindre la bêta iPhone', href: LANDING_LINKS.download },
  downloadNote: 'Via TestFlight, l’app d’Apple pour les bêtas.',
  demo: { label: 'Voir la démo', href: LANDING_LINKS.demo },
  signIn: { label: 'Connexion', href: LANDING_LINKS.signIn },
} as const;

/** Read word by word as the visitor scrolls. */
export const LANDING_STATEMENT =
  'Ta montre mesure tout. Personne ne te dit quoi en faire ce matin.';

export type LandingCard = { title: string; body: string };

/** An example morning, said as such: no athlete's data is shown on the landing. */
export const LANDING_MORNING = {
  title: 'Chaque matin, une décision',
  lead: 'Un verdict, trois raisons au plus, et son niveau de confiance.',
  example: {
    caption: 'Exemple · mardi, 07:02',
    verdict: 'Séance facile aujourd’hui, garde tes jambes pour jeudi',
    evidence: [
      'Charge des 7 derniers jours 18 % au-dessus de ton habitude',
      'Séance clé jeudi : seuil vélo, 3 × 12 min',
      'Mollet gauche en reprise : pas de côtes aujourd’hui',
    ],
    sessionLabel: 'Séance du jour',
    planned: '8 × 400 m',
    proposed: '45 min footing facile',
    confidenceLabel: 'Confiance',
    confidence: 'Moyenne · 0,68',
    /** Where 0.68 sits on the 0–1 scale, for the confidence bar. */
    confidenceValue: 0.68,
    accept: 'Alléger',
    keep: 'Garder le plan',
    accepted: 'Séance allégée. Jeudi reste ta séance clé.',
    kept: 'Plan gardé. SharpIt s’en souviendra.',
    undo: 'Revenir',
  },
  arbitrate: {
    title: 'La prudence gagne',
    body: 'État physique, fatigue, forme, météo, progression : quand l’une dit prudence, la séance s’allège. Tu vois laquelle.',
  } satisfies LandingCard,
} as const;

export const LANDING_PLAN = {
  title: 'Un plan qui suit ta vie',
  lead: 'Construit vers ta course, réparé quand la vie s’en mêle.',
  programme: {
    title: 'Construit vers ta course',
    body: 'Deux ou trois séances clés par semaine. Rate le reste, le plan tient.',
  } satisfies LandingCard,
  repair: {
    // A no-break space keeps the question mark with its word.
    title: 'Une séance ratée\u00a0? SharpIt replace la fin de ta semaine',
    body: 'Tu valides ou tu refuses.',
  } satisfies LandingCard,
} as const;

/** One control per rule of the plan's Gate (ADR-005); the test counts the rule files. */
export const LANDING_GATE_RULE_COUNT = 17;

/** The decision engine's confidence policy: where advice turns careful, then complete. */
export const LANDING_CONFIDENCE_STEPS = [
  { from: 0, label: 'Fragile' },
  { from: 0.6, label: 'Prudent dès 0,60' },
  { from: 0.75, label: 'Complet dès 0,75' },
] as const;

export const LANDING_MODEL = {
  title: 'SharpIt te connaît, et le prouve',
  lead: 'Chaque conseil montre ses raisons.',
  consent: {
    title: 'Rien ne change sans ton accord',
    body: 'Tu acceptes, tu ajustes ou tu gardes ton plan.',
  } satisfies LandingCard,
  observe: {
    title: 'Toutes tes sources, un seul modèle',
    body: 'Tu choisis l’appareil qui fait foi.',
  } satisfies LandingCard,
  compare: {
    title: 'Comparé à toi, pas à une moyenne',
    body: 'Un écart de −3 % ne déclenche rien. À −9 %, tu le sais.',
  } satisfies LandingCard,
  gate: {
    title: 'contrôles avant chaque séance',
    body: `Le coach propose, ${LANDING_GATE_RULE_COUNT} règles fixes vérifient. Une séance trop dure pour ta semaine ne passe pas.`,
  } satisfies LandingCard,
  honesty: {
    title: 'Il te dit quand il ne sait pas',
    body: 'Sans données, pas de conseil.',
  } satisfies LandingCard,
} as const;

/** The words drawn inside the diagrams. */
export const LANDING_DIAGRAMS = {
  observe: {
    sources: ['Strava', 'Apple Santé', 'Withings'],
    primary: 'principale',
    model: 'Ton modèle',
  },
  compare: { window: '14 jours', band: '±5 % : bruit', outlier: '−9 % : à lire' },
  arbitrate: {
    readings: ['RAS', 'Prudence', 'Bonne', 'RAS', 'Pousser'],
    verdict: 'Séance facile',
    rule: 'La prudence gagne',
  },
  programme: { days: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], key: 'Clé', checks: '17 / 17 contrôles' },
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

/** Only what ships is listed as connected; the rest is announced, never claimed. */
export const LANDING_SOURCES = {
  title: 'Branché sur tes appareils',
  connected: ['Garmin', 'Strava', 'Apple Santé', 'Withings', 'Google Agenda'],
  upcomingLabel: 'Bientôt',
  upcoming: ['Polar'],
} as const;

/**
 * The prices chosen on 2026-10-20 (iOS ADR 0020); the App Store shows the ones that bind. The
 * first month is the monthly's pay-as-you-go introductory offer (6,49 € in France), which Apple
 * grants once per Apple ID.
 */
export const LANDING_PRICING = {
  title: 'Tes données sont gratuites. Le coach est Pro.',
  tiers: [
    {
      name: 'Gratuit',
      price: '0 €',
      body: 'Ton journal, tes séances et toutes tes mesures, quelle que soit la source. La proposition du matin, calculée sur tes données.',
    },
    {
      name: 'SharpIt Pro',
      price: '12,99 € par mois ou 99,99 € par an',
      offer: 'Premier mois à 6,49 €',
      body: 'Le plan construit vers ta course, réparé par le coach quand tu rates une séance. Le coach, l’analyse de chaque séance, le bilan de la semaine. Sans engagement.',
    },
  ],
} as const;

export type LandingQuestion = { question: string; answer: string };

export const LANDING_FAQ = {
  title: 'Questions fréquentes',
  items: [
    {
      question: 'Faut-il une montre connectée ?',
      answer:
        'Il te faut une source de séances : Apple Watch (par Apple Santé), Garmin ou Strava. Pour les mesures du matin, Apple Santé, Garmin ou Withings. Garmin envoie tes séances à partir du jour où tu le connectes.',
    },
    {
      question: 'Pour quels sports ?',
      answer:
        'Course, vélo, natation, triathlon et renforcement. Un enchaînement vélo puis course est planifié et relu comme une seule séance.',
    },
    {
      question: 'Est-ce que ça remplace un coach ?',
      answer:
        'SharpIt planifie et ajuste à partir de tes données, et te laisse le dernier mot. Un coach humain peut travailler à côté : rien ne change sans ton accord.',
    },
    {
      question: 'Où sont mes données ?',
      answer:
        'Sur nos serveurs en Europe, jamais sur iCloud. Tu peux tout exporter ou supprimer ton compte à tout moment, depuis l’app ou le site.',
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
  body: 'Tes données restent gratuites. Pro se résilie à tout moment depuis ton compte Apple.',
} as const;

export const LANDING_FOOTER_LINKS = [
  { label: 'Aide', href: LANDING_LINKS.help },
  { label: 'Confidentialité', href: LANDING_LINKS.privacy },
  { label: 'Conditions', href: LANDING_LINKS.terms },
  { label: 'Connexion', href: LANDING_LINKS.signIn },
] as const;

export const LANDING_SOCIAL_LINKS = [
  { label: 'Instagram', href: LANDING_LINKS.instagram },
  { label: 'X', href: LANDING_LINKS.x },
] as const;

/** Every athlete-facing string on the landing, for the forbidden-copy guard. */
export function landingCopyStrings(): string[] {
  const { example } = LANDING_MORNING;
  const cards: LandingCard[] = [
    LANDING_MORNING.arbitrate,
    LANDING_PLAN.programme,
    LANDING_PLAN.repair,
    LANDING_MODEL.observe,
    LANDING_MODEL.compare,
    LANDING_MODEL.gate,
    LANDING_MODEL.honesty,
    LANDING_MODEL.consent,
  ];
  return [
    ...LANDING_HERO.titleLines,
    LANDING_HERO.body,
    LANDING_HERO.download.label,
    LANDING_HERO.downloadNote,
    LANDING_HERO.demo.label,
    LANDING_STATEMENT,
    LANDING_MORNING.title,
    LANDING_MORNING.lead,
    LANDING_PLAN.lead,
    LANDING_MODEL.lead,
    ...Object.values(example)
      .filter((value) => typeof value !== 'number')
      .flat(),
    LANDING_PLAN.title,
    LANDING_MODEL.title,
    ...cards.flatMap((card) => [card.title, card.body]),
    ...LANDING_CONFIDENCE_STEPS.map((step) => step.label),
    ...LANDING_PRIORITY,
    ...Object.values(LANDING_DIAGRAMS).flatMap((labels) =>
      Object.values(labels).flatMap((value) => (typeof value === 'string' ? [value] : value)),
    ),
    LANDING_SOURCES.title,
    ...LANDING_SOURCES.connected,
    LANDING_SOURCES.upcomingLabel,
    ...LANDING_SOURCES.upcoming,
    LANDING_PRICING.title,
    ...LANDING_PRICING.tiers.flatMap((tier) => [
      tier.name,
      tier.price,
      tier.body,
      ...('offer' in tier ? [tier.offer] : []),
    ]),
    LANDING_FAQ.title,
    ...LANDING_FAQ.items.flatMap((item) => [item.question, item.answer]),
    LANDING_CLOSING.title,
    LANDING_CLOSING.body,
  ];
}
