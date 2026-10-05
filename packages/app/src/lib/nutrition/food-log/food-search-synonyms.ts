/**
 * Other ways an athlete writes a food the tables name differently. Ciqual says « Poulet, filet »
 * where the athlete types « blanc de poulet », and « Pâtes » where they type « spaghetti ». Each
 * entry reads: what is typed (folded, as `normalizeFoodText` gives it) → what the tables say.
 * Kept short on purpose: a phrase only belongs here once a search for it came back empty or wrong.
 * Decision record: ADR-069.
 */
export const FOOD_SYNONYMS: ReadonlyArray<readonly [typed: string, written: string]> = [
  ['blanc de poulet', 'poulet filet'],
  ['filet de poulet', 'poulet filet'],
  ['escalope de poulet', 'poulet filet'],
  ['aiguillette de poulet', 'poulet filet'],
  ['blanc de dinde', 'dinde escalope'],
  ['filet de dinde', 'dinde escalope'],
  ['escalope de dinde', 'dinde escalope'],
  ['jambon blanc', 'jambon cuit'],
  ['jambon de paris', 'jambon cuit'],
  ['yogourt', 'yaourt'],
  ['yoghourt', 'yaourt'],
  ['yoghurt', 'yaourt'],
  ['yogurt', 'yaourt'],
  ['spaghetti', 'pates'],
  ['tagliatelle', 'pates'],
  ['penne', 'pates'],
  ['coquillette', 'pates'],
  ['fusilli', 'pates'],
  ['macaroni', 'pates'],
  ['patate', 'pomme de terre'],
  ['pdt', 'pomme de terre'],
  ['cacahuete', 'arachide'],
  ['steak', 'boeuf steak'],
  ['flocon avoine', 'flocon d avoine'],
];
