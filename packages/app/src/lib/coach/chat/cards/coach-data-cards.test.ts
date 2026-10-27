import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COACH_DATA_CARD_SCHEMA_VERSION,
  coachDataCardOutput,
  coachDataCardSchema,
} from './coach-data-cards';

const FIXTURES = new URL('./data-fixtures/', import.meta.url);

type FixturePart = { type: string; output: { schemaVersion: number; card: unknown } };

// The iPhone app decodes its own copy of these files (SHARPIT-APP, sibling repository).
const IOS_FIXTURES = new URL(
  '../../../../../../../../SHARPIT-APP/SHARPIT-APPTests/Fixtures/CoachDataCards/',
  import.meta.url,
);

const names = readdirSync(FIXTURES).filter((name) => name.endsWith('.json'));

function fixture(name: string): FixturePart {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as FixturePart;
}

describe('coach data cards contract v1', () => {
  it.each(names)('accepts the card of %s', (name) => {
    const { output } = fixture(name);

    expect(coachDataCardSchema.safeParse(output.card).success).toBe(true);
    expect(output.schemaVersion).toBe(COACH_DATA_CARD_SCHEMA_VERSION);
  });

  it('rejects a score out of range and an unknown kind', () => {
    const { output } = fixture('day-scores.json');

    expect(
      coachDataCardSchema.safeParse({ ...(output.card as object), stress: 140 }).success,
    ).toBe(false);
    expect(coachDataCardSchema.safeParse({ kind: 'sparkline' }).success).toBe(false);
  });

  it('keeps the markdown and stamps the version on the tool output', () => {
    const card = coachDataCardSchema.parse(fixture('target-band.json').output.card);

    expect(coachDataCardOutput('texte', card)).toEqual({
      ok: true,
      markdown: 'texte',
      schemaVersion: COACH_DATA_CARD_SCHEMA_VERSION,
      card,
    });
  });

  it('leaves the card out when it breaks the contract, and keeps the markdown', () => {
    expect(coachDataCardOutput('texte', { kind: 'targetBand', trainingDayId: 'demain' })).toEqual({
      ok: true,
      markdown: 'texte',
    });
  });

  it.skipIf(!existsSync(IOS_FIXTURES))('matches the iPhone copy of every fixture', () => {
    for (const name of names) {
      expect(readFileSync(new URL(name, IOS_FIXTURES), 'utf8')).toBe(
        readFileSync(new URL(name, FIXTURES), 'utf8'),
      );
    }
  });
});
