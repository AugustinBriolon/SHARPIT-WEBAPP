import { describe, expect, it } from 'vitest';
import { ActivityType } from '@prisma/client';

import {
  SPORT_IDENTITY_PANEL,
  SPORT_IDENTITY_SOLID,
  SPORT_IDENTITY_SURFACE,
  SPORT_IDENTITY_TEXT,
  sportIdentityHex,
  sportIdentitySolid,
} from './sport-identity';

const SPORTS = Object.values(ActivityType);

describe('sport identity (Ink & Lime, ADR-085)', () => {
  it('treats every sport the same — identity comes from the icon', () => {
    for (const record of [
      SPORT_IDENTITY_SURFACE,
      SPORT_IDENTITY_TEXT,
      SPORT_IDENTITY_SOLID,
      SPORT_IDENTITY_PANEL,
    ]) {
      expect(new Set(SPORTS.map((type) => record[type])).size).toBe(1);
    }
  });

  it('never paints a sport with a rainbow hue', () => {
    for (const type of SPORTS) {
      expect(SPORT_IDENTITY_SURFACE[type]).not.toMatch(/orange|emerald|sky|rose|teal|amber/);
    }
  });

  it('draws the icon tile as ink with a lime glyph', () => {
    expect(sportIdentitySolid(ActivityType.RUN)).toBe('bg-ink-surface text-ink-accent');
  });

  it('paints maps in ink', () => {
    expect(sportIdentityHex(ActivityType.RUN)).toBe('#0e0e0e');
  });
});
