/**
 * Writes the generated Swift token file into the native iOS client (ADR-041).
 *
 * Usage:
 *   yarn tokens:ios                    # write to the sibling SHARPIT-APP checkout
 *   yarn tokens:ios --check            # fail if the committed file is stale
 *   yarn tokens:ios path/to/File.swift # write elsewhere
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXPORTED_COLORS, renderIosTokens } from '@sharpit/app/lib/brand/ios-token-export';
import { renderIosRaceFormats } from '@sharpit/app/lib/goals/race-formats-export';

const GLOBALS_CSS = resolve(import.meta.dirname, '../../../packages/ui/src/styles/globals.css');
const DEFAULT_OUTPUT = resolve(
  import.meta.dirname,
  '../../../../SHARPIT-APP/SharpItShared/SharpitTokens.generated.swift',
);
const DEFAULT_RACE_FORMATS_OUTPUT = resolve(
  import.meta.dirname,
  '../../../../SHARPIT-APP/SharpItShared/RaceFormats.generated.swift',
);

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const outputPath = resolve(
  process.cwd(),
  args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_OUTPUT,
);
const raceFormatsOutputPath = DEFAULT_RACE_FORMATS_OUTPUT;

const generatedTokens = renderIosTokens(readFileSync(GLOBALS_CSS, 'utf8'));
const generatedRaceFormats = renderIosRaceFormats();

if (checkOnly) {
  let stale = false;
  if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== generatedTokens) {
    console.error(`${outputPath} is stale. Run \`yarn tokens:ios\` and commit the result.`);
    stale = true;
  }
  if (
    !existsSync(raceFormatsOutputPath) ||
    readFileSync(raceFormatsOutputPath, 'utf8') !== generatedRaceFormats
  ) {
    console.error(
      `${raceFormatsOutputPath} is stale. Run \`yarn tokens:ios\` and commit the result.`,
    );
    stale = true;
  }
  if (stale) {
    process.exit(1);
  }
  console.log(`${outputPath} and ${raceFormatsOutputPath} are up to date.`);
} else {
  writeFileSync(outputPath, generatedTokens);
  console.log(`Wrote ${EXPORTED_COLORS.length} colors to ${outputPath}`);
  writeFileSync(raceFormatsOutputPath, generatedRaceFormats);
  console.log(`Wrote race formats catalog to ${raceFormatsOutputPath}`);
}
