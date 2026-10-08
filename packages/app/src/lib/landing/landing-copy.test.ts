import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEASER_FORBIDDEN_COPY } from '@sharpit/app/lib/teaser/screens';
import { PROVIDER_CATALOG } from '@sharpit/app/lib/integrations/provider-catalog';
import {
  LANDING_GUARDRAILS,
  LANDING_LINKS,
  LANDING_METHOD,
  LANDING_SOURCES,
  landingCopyStrings,
} from '@sharpit/app/lib/landing/landing-copy';

const GATE_RULES_DIR = path.resolve(__dirname, '../../../../server/src/lib/plan-gate/rules');

/** Linked from the iPhone app only, which the web catalog marks as coming soon (ADR-054). */
const LINKED_IN_APP = new Set(['Apple Santé']);

describe('landing copy', () => {
  it('makes no health processing claim (same wall as the teaser)', () => {
    const text = landingCopyStrings().join('\n').toLowerCase();
    for (const forbidden of TEASER_FORBIDDEN_COPY) {
      expect(text, forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('uses no em dash', () => {
    for (const line of landingCopyStrings()) {
      expect(line, line).not.toContain('—');
    }
  });

  it('never names the model behind the coach', () => {
    const text = landingCopyStrings().join('\n');
    expect(text).not.toMatch(/\bIA\b|\bAI\b|intelligence artificielle/i);
  });

  it('sends account actions to the web app and keeps legal pages on the apex', () => {
    expect(LANDING_LINKS.signIn).toBe('https://web.sharpit.app/sign-in');
    expect(LANDING_LINKS.demo).toBe('https://web.sharpit.app/demo');
    expect(LANDING_LINKS.privacy).toBe('/privacy');
  });

  it('anchors the method section the hero links to', () => {
    expect(LANDING_LINKS.method).toBe('#methode');
    expect(LANDING_METHOD.steps.map((step) => step.index)).toEqual(['01', '02', '03', '04', '05']);
  });

  it('counts one guardrail per rule of the plan Gate', () => {
    const rules = readdirSync(GATE_RULES_DIR).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    expect(LANDING_GUARDRAILS.rules).toHaveLength(rules.length);
    expect(LANDING_GUARDRAILS.count).toBe(rules.length);
  });

  it('claims as connected only the sources the catalog ships', () => {
    const available = new Set(
      PROVIDER_CATALOG.filter((provider) => provider.status === 'available').map((p) => p.name),
    );
    for (const name of LANDING_SOURCES.connected.filter((n) => !LINKED_IN_APP.has(n))) {
      expect(available, name).toContain(name);
    }
    for (const name of LANDING_SOURCES.upcoming) {
      expect(available, name).not.toContain(name);
    }
  });
});
