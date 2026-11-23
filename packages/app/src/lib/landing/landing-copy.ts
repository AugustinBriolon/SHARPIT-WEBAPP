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
  titleLines: ['Un plan qui se répare.', 'Une décision chaque matin.'],
  body: 'SharpIt construit ta semaine vers ta course, la relit chaque matin avec ce que ta montre a mesuré, et la répare quand la vie s’en mêle.',
  download: { label: 'Télécharger', href: LANDING_LINKS.download },
  downloadNote: 'iPhone, en bêta sur TestFlight',
  demo: { label: 'Voir la démo', href: LANDING_LINKS.demo },
  signIn: { label: 'Connexion', href: LANDING_LINKS.signIn },
} as const;

/** An example morning, said as such: no athlete's data is shown on the landing. */
export const LANDING_MORNING = {
  title: 'Ce que tu lis à 7 h',
  body: 'Un verdict, trois raisons au plus, et son niveau de confiance. Si deux lectures se contredisent, la plus prudente gagne et tu sais pourquoi.',
  example: {
    caption: 'Exemple · mardi, 07:02',
    verdict: 'Séance facile aujourd’hui, garde tes jambes pour jeudi',
    evidenceLabel: 'Pourquoi',
    evidence: [
      'Charge des 7 derniers jours 18 % au-dessus de ton habitude',
      'Séance clé jeudi : seuil vélo, 3 × 12 min',
      'Mollet gauche en reprise : pas de côtes aujourd’hui',
    ],
    facts: [
      { label: 'Facteur limitant', value: 'Fatigue' },
      { label: 'Prévu', value: '8 × 400 m' },
      { label: 'Proposé', value: '45 min footing facile' },
      { label: 'Confiance', value: 'Moyenne · 0,68' },
    ],
    choice: 'Tu allèges ou tu gardes ton plan. C’est toi qui choisis.',
  },
} as const;

export type LandingRepairDay = {
  day: string;
  planned: string;
  repaired: string;
  /** What happened to this day: the session was missed, or the repair moved one here. */
  change?: 'missed' | 'moved';
};

/** An example week, before and after a missed key session. */
export const LANDING_REPAIR = {
  title: 'Une séance ratée ne casse pas ta semaine',
  body: 'Le lendemain, SharpIt propose de réorganiser la fin de ta semaine. Les séances clés sont replacées, le bonus cède sa place, et rien ne bouge tant que tu n’as pas dit oui.',
  caption: 'Exemple : le seuil de mardi est raté',
  columns: { day: 'Jour', planned: 'Prévu', repaired: 'Proposé' },
  missedLabel: 'Ratée',
  movedLabel: 'Déplacée ici',
  days: [
    { day: 'Lundi', planned: 'Repos', repaired: 'Repos' },
    { day: 'Mardi', planned: 'Seuil course · clé', repaired: 'Rien', change: 'missed' },
    { day: 'Mercredi', planned: 'Footing 40 min', repaired: 'Seuil course · clé', change: 'moved' },
    { day: 'Jeudi', planned: 'Vélo 1 h', repaired: 'Vélo 1 h' },
    { day: 'Vendredi', planned: 'Repos', repaired: 'Repos' },
    { day: 'Samedi', planned: 'Sortie longue · clé', repaired: 'Sortie longue · clé' },
    { day: 'Dimanche', planned: 'Natation', repaired: 'Natation' },
  ] satisfies LandingRepairDay[],
} as const;

/** One control per rule of the plan's Gate (ADR-005); the test counts the rule files. */
export const LANDING_GATE_RULE_COUNT = 17;

export const LANDING_TRUST = {
  title: 'Pourquoi lui faire confiance',
  reasons: [
    {
      title: `${LANDING_GATE_RULE_COUNT} contrôles avant chaque séance`,
      body: 'Le coach rédige, des règles fixes vérifient : charge tenable, séances intenses espacées, rien après ta course, pas de conflit avec ton agenda.',
    },
    {
      title: 'Il te dit quand il ne sait pas',
      body: 'Chaque verdict porte son niveau de confiance. Quand les données manquent, il retient son conseil et te dit ce qui lui manque.',
    },
    {
      title: 'Rien ne change sans ton accord',
      body: 'Une proposition n’est jamais appliquée en silence. Tu acceptes, tu ajustes ou tu gardes ton plan.',
    },
  ],
} as const;

/** Only what ships is listed as connected; the rest is announced, never claimed. */
export const LANDING_SOURCES = {
  title: 'Branché sur tes appareils',
  body: 'La montre change, ton modèle reste.',
  connected: ['Garmin', 'Strava', 'Apple Santé', 'Withings', 'Google Agenda'],
  upcomingLabel: 'Bientôt',
  upcoming: ['Polar'],
} as const;

/** The prices chosen on 2026-10-20 (iOS ADR 0020); the App Store shows the ones that bind. */
export const LANDING_PRICING = {
  title: 'Gratuit pour t’entraîner',
  tiers: [
    {
      name: 'Gratuit',
      price: '0 €',
      body: 'Ton plan, ton journal et toutes tes données.',
    },
    {
      name: 'SharpIt Pro',
      price: '12,99 € par mois ou 99,99 € par an',
      body: 'Les lectures approfondies : bilan de la semaine, analyse de chaque séance, lecture de ton alimentation.',
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
        'Non. Une Apple Watch, une montre Garmin ou Strava suffisent. Les séances viennent de Garmin, de Strava et d’Apple Santé. Pour les mesures du matin, Garmin, Apple Santé et Withings font foi.',
    },
    {
      question: 'Pour quels sports ?',
      answer:
        'Course, vélo, natation, triathlon et renforcement. Un enchaînement vélo puis course est planifié et relu comme une seule séance.',
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
      question: 'Comment commencer ?',
      answer:
        'Ton compte se crée dans l’app iPhone, aujourd’hui en bêta. En attendant l’App Store, la démo ouvre le carnet web sur un compte d’exemple.',
    },
  ] satisfies LandingQuestion[],
} as const;

export const LANDING_CLOSING = {
  title: 'Une décision le matin. Le reste de la journée t’appartient.',
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
  return [
    ...LANDING_HERO.titleLines,
    LANDING_HERO.body,
    LANDING_HERO.download.label,
    LANDING_HERO.downloadNote,
    LANDING_HERO.demo.label,
    LANDING_MORNING.title,
    LANDING_MORNING.body,
    example.caption,
    example.verdict,
    example.evidenceLabel,
    ...example.evidence,
    ...example.facts.flatMap((fact) => [fact.label, fact.value]),
    example.choice,
    LANDING_REPAIR.title,
    LANDING_REPAIR.body,
    LANDING_REPAIR.caption,
    ...Object.values(LANDING_REPAIR.columns),
    LANDING_REPAIR.missedLabel,
    LANDING_REPAIR.movedLabel,
    ...LANDING_REPAIR.days.flatMap((day) => [day.day, day.planned, day.repaired]),
    LANDING_TRUST.title,
    ...LANDING_TRUST.reasons.flatMap((reason) => [reason.title, reason.body]),
    LANDING_SOURCES.title,
    LANDING_SOURCES.body,
    ...LANDING_SOURCES.connected,
    LANDING_SOURCES.upcomingLabel,
    ...LANDING_SOURCES.upcoming,
    LANDING_PRICING.title,
    ...LANDING_PRICING.tiers.flatMap((tier) => [tier.name, tier.price, tier.body]),
    LANDING_FAQ.title,
    ...LANDING_FAQ.items.flatMap((item) => [item.question, item.answer]),
    LANDING_CLOSING.title,
  ];
}
