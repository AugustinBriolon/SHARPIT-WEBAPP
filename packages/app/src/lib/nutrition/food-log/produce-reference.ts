import { normalizeFoodText, singular } from './food-search-ranking';

/**
 * The fruits and vegetables an athlete logs most, each pinned to the Ciqual entry that means « the
 * fruit itself » (ADR-122). Energy is never typed here: it is read from the Ciqual table by code,
 * so the reference stays ANSES's measurement. Codes are `alim_code` of Table Ciqual 2020; a test
 * checks every one against the bundled table.
 *
 * Names are folded (`normalizeFoodText`) and singular. A query matches an entry when the whole
 * query reads as one of its names, so « pomme » pins the apple and « pomme de terre » the potato.
 * Several codes: the first is shown first (« poivron » → red).
 */
export type ProduceEntry = { names: string[]; codes: number[] };

export const PRODUCE: readonly ProduceEntry[] = [
  // Fruits (Ciqual 0204)
  { names: ['abricot'], codes: [13000] },
  { names: ['ananas'], codes: [13002] },
  { names: ['banane'], codes: [13005] },
  { names: ['cerise'], codes: [13008] },
  { names: ['citron'], codes: [13009] },
  { names: ['citron vert', 'lime'], codes: [13067] },
  { names: ['figue'], codes: [13012] },
  { names: ['fraise'], codes: [13014] },
  { names: ['framboise'], codes: [13015] },
  { names: ['fruit de la passion', 'maracuja'], codes: [13016] },
  { names: ['grenade'], codes: [13018] },
  { names: ['groseille'], codes: [13019] },
  { names: ['kaki'], codes: [13066] },
  { names: ['kiwi'], codes: [13021] },
  { names: ['litchi'], codes: [13023] },
  { names: ['clementine', 'mandarine'], codes: [13024] },
  { names: ['mangue'], codes: [13025] },
  { names: ['melon'], codes: [13026] },
  { names: ['mirabelle'], codes: [13027] },
  { names: ['myrtille'], codes: [13028] },
  { names: ['mure'], codes: [13029] },
  { names: ['nectarine', 'brugnon'], codes: [13148] },
  { names: ['orange'], codes: [13034] },
  { names: ['papaye'], codes: [13035] },
  { names: ['pasteque'], codes: [13036] },
  { names: ['peche'], codes: [13193, 13195] },
  { names: ['poire'], codes: [13188] },
  { names: ['pomelo', 'pamplemousse'], codes: [13040] },
  { names: ['pomme'], codes: [13620, 13192, 13121] },
  { names: ['prune'], codes: [13041] },
  { names: ['raisin'], codes: [13044, 13101] },
  // Vegetables (Ciqual 0201, 0202)
  { names: ['avocat'], codes: [13004] },
  { names: ['carotte'], codes: [20009] },
  { names: ['champignon', 'champignon de paris'], codes: [20056] },
  { names: ['chou fleur'], codes: [20016] },
  { names: ['chou rouge'], codes: [20014] },
  { names: ['concombre'], codes: [20019] },
  { names: ['courgette'], codes: [20020] },
  { names: ['endive'], codes: [20026] },
  { names: ['epinard'], codes: [20270] },
  { names: ['fenouil'], codes: [20028] },
  { names: ['mache'], codes: [20099] },
  { names: ['oignon'], codes: [20239, 20238] },
  { names: ['patate douce'], codes: [4101] },
  { names: ['poireau'], codes: [20039] },
  { names: ['poivron'], codes: [20087, 20085, 20168] },
  { names: ['pomme de terre'], codes: [4008] },
  { names: ['radis'], codes: [20045] },
  { names: ['tomate'], codes: [20047] },
  { names: ['tomate cerise'], codes: [20172] },
];

function folded(text: string): string {
  return normalizeFoodText(text).split(' ').map(singular).join(' ');
}

const BY_NAME = new Map(PRODUCE.flatMap((entry) => entry.names.map((name) => [name, entry])));

/** The entry the whole query names, plural or not; null for anything else (« pomme golden »). */
export function produceFor(query: string): ProduceEntry | null {
  return BY_NAME.get(folded(query)) ?? null;
}

/**
 * Words that make a food something made from the fruit rather than the fruit: a drink, a spread,
 * a snack, a flavour. « Jus d'orange » and « Nectar de banane » read as the fruit by their name
 * alone, and a juice's energy is close to the fruit's, so words carry what energy cannot.
 */
const DERIVED_WORDS = new Set(
  [
    'jus',
    'nectar',
    'boisson',
    'soda',
    'limonade',
    'sirop',
    'smoothie',
    'confiture',
    'compote',
    'puree',
    'gelee',
    'coulis',
    'sorbet',
    'glace',
    'yaourt',
    'dessert',
    'gateau',
    'biscuit',
    'barre',
    'cereale',
    'muesli',
    'chips',
    'bonbon',
    'confit',
    'seche',
    'sechee',
    'sec',
    'huile',
    'vinaigre',
    'arome',
    'aromatise',
    'saveur',
    'gout',
    'parfum',
    'infusion',
    'the',
    'liqueur',
    'tarte',
    'pate',
    'sauce',
  ].map(singular),
);

/** Below this share of the reference energy, or above this one, a food is not the plain fruit. */
const ENERGY_BAND = { low: 0.5, high: 1.5, floorKcal: 25 } as const;

/**
 * True when a product listed under a fruit's or vegetable's name is probably not that food: a
 * derived word in its name, or an energy far from the reference's (« Banane » at 520 kcal is chips).
 * The reference is the Ciqual energy of the pinned food, per 100 g.
 */
export function isDerivedFromProduce(
  food: { name: string; kcalPer100g: number },
  referenceKcal: number,
): boolean {
  const words = normalizeFoodText(food.name).split(' ');
  if (words.some((word) => DERIVED_WORDS.has(singular(word)))) {
    return true;
  }
  const slack = Math.max(ENERGY_BAND.floorKcal, referenceKcal * (ENERGY_BAND.high - 1));
  const low = referenceKcal * ENERGY_BAND.low;
  return food.kcalPer100g < low - ENERGY_BAND.floorKcal || food.kcalPer100g > referenceKcal + slack;
}
