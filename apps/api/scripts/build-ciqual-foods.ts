/**
 * Builds the bundled Ciqual table (ADR-065) from ANSES' XML release.
 *
 *   curl -LO https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip
 *   unzip XML_2020_07_07.zip -d /tmp/ciqual
 *   yarn api data:ciqual /tmp/ciqual
 *
 * Writes `packages/server/src/lib/nutrition/food-log/ciqual-foods.json`: one entry per food with
 * energy and the three macros known, the other nutrients null when Ciqual did not measure them.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCiqualAmount, type CiqualFood } from '@sharpit/app/lib/nutrition/food-log/ciqual';

const OUTPUT = resolve(
  __dirname,
  '../../../packages/server/src/lib/nutrition/food-log/ciqual-foods.json',
);

/** Ciqual constituent codes. Energy per EU Regulation 1169/2011; protein with Jones factors. */
const CONSTITUENT = {
  kcal: '328',
  protein: '25000',
  carbs: '31000',
  fat: '40000',
  fiber: '34100',
  sugars: '32000',
  salt: '10004',
  saturatedFat: '40302',
} as const;

type Nutrient = keyof typeof CONSTITUENT;
const NUTRIENT_BY_CODE = new Map(
  Object.entries(CONSTITUENT).map(([nutrient, code]) => [code, nutrient as Nutrient]),
);

/** ANSES ships windows-1252, with raw « < » in amounts such as « < 0,5 ». */
function readTable(dir: string, prefix: string): string {
  const file = readdirSync(dir).find((name) => name.startsWith(prefix) && name.endsWith('.xml'));
  if (!file) {
    throw new Error(`No ${prefix}*.xml in ${dir}`);
  }
  return new TextDecoder('windows-1252').decode(readFileSync(join(dir, file)));
}

function records(xml: string, tag: string): Record<string, string>[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) =>
    Object.fromEntries(
      [...match[1]!.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)].map((field) => [
        field[1]!,
        field[2]!.trim(),
      ]),
    ),
  );
}

function amountsByFood(xml: string): Map<string, Partial<Record<Nutrient, number | null>>> {
  const amounts = new Map<string, Partial<Record<Nutrient, number | null>>>();
  for (const row of records(xml, 'COMPO')) {
    const nutrient = NUTRIENT_BY_CODE.get(row.const_code ?? '');
    if (!nutrient || !row.alim_code) {
      continue;
    }
    const food = amounts.get(row.alim_code) ?? {};
    food[nutrient] = parseCiqualAmount(row.teneur ?? '');
    amounts.set(row.alim_code, food);
  }
  return amounts;
}

function round(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

function build(dir: string): CiqualFood[] {
  const amounts = amountsByFood(readTable(dir, 'compo_'));
  return records(readTable(dir, 'alim_2'), 'ALIM').flatMap((alim) => {
    const values = amounts.get(alim.alim_code ?? '') ?? {};
    const { kcal, protein, carbs, fat } = values;
    const macros = [kcal, protein, carbs, fat];
    if (macros.some((amount) => amount === null || amount === undefined) || !alim.alim_nom_fr) {
      return [];
    }
    return [
      {
        code: Number(alim.alim_code),
        name: alim.alim_nom_fr,
        subgroup: alim.alim_ssgrp_code ?? '',
        kcal: round(kcal)!,
        protein: round(protein)!,
        carbs: round(carbs)!,
        fat: round(fat)!,
        fiber: round(values.fiber),
        sugars: round(values.sugars),
        salt: round(values.salt),
        saturatedFat: round(values.saturatedFat),
      },
    ];
  });
}

const [, , dir] = process.argv;
if (!dir) {
  console.error('Usage: yarn api data:ciqual <unzipped Ciqual XML directory>');
  process.exit(1);
}
const foods = build(dir);
writeFileSync(OUTPUT, `${JSON.stringify(foods)}\n`);
console.log(`Wrote ${foods.length} Ciqual foods to ${OUTPUT}`);
