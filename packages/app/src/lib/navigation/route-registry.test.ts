import { describe, expect, it } from 'vitest';
import { isTransientRoute, resolveRouteFallback, resolveRouteLabel } from './route-registry';

const HOME = { href: '/', label: 'Résumé' };
const PLAN = { href: '/plan', label: 'Plan' };
const ACTIVITE = { href: '/activite', label: 'Activité' };
const MOI = { href: '/moi', label: 'Moi' };

describe('route-registry', () => {
  describe('resolveRouteLabel', () => {
    it('matches hubs and static routes', () => {
      expect(resolveRouteLabel('/')).toBe('Résumé');
      expect(resolveRouteLabel('/plan')).toBe('Plan');
      expect(resolveRouteLabel('/activite')).toBe('Activité');
      expect(resolveRouteLabel('/moi')).toBe('Moi');
      expect(resolveRouteLabel('/coach')).toBe('Coach');
      expect(resolveRouteLabel('/settings/privacy')).toBe('Profil');
    });

    it('matches Plan children', () => {
      expect(resolveRouteLabel('/plan/semaine')).toBe('La semaine');
      expect(resolveRouteLabel('/plan/bilan')).toBe('Bilan hebdo');
      expect(resolveRouteLabel('/plan/charge')).toBe('Charge');
      expect(resolveRouteLabel('/plan/adaptation')).toBe('Adaptation');
    });

    it('matches Activité children, including dynamic segments', () => {
      expect(resolveRouteLabel('/activite/nouvelle')).toBe('Nouvelle activité');
      expect(resolveRouteLabel('/activite/abc123')).toBe('Séance');
      expect(resolveRouteLabel('/activite/abc123/edit')).toBe('Édition');
    });

    it('matches Journal surfaces', () => {
      expect(resolveRouteLabel('/journal')).toBe('Journal');
      expect(resolveRouteLabel('/journal/analyses')).toBe('Analyses');
      expect(resolveRouteFallback('/journal/analyses')).toEqual({
        href: '/journal',
        label: 'Journal',
      });
    });

    it('ignores search / hash when matching', () => {
      expect(resolveRouteLabel('/plan/semaine?week=2026-07-20')).toBe('La semaine');
      expect(resolveRouteLabel('/moi/performance?sport=run')).toBe('Performance');
    });

    it('falls back to a generic label for unknown routes', () => {
      expect(resolveRouteLabel('/unknown/path')).toBe('Retour');
    });
  });

  describe('isTransientRoute', () => {
    it('marks activity edit as transient (skipped by the nav stack)', () => {
      expect(isTransientRoute('/activite/abc123/edit')).toBe(true);
      expect(isTransientRoute('/activite/abc123/edit?x=1')).toBe(true);
    });

    it('does not mark activity detail or entry as transient', () => {
      expect(isTransientRoute('/activite/abc123')).toBe(false);
      expect(isTransientRoute('/activite/nouvelle')).toBe(false);
    });
  });

  describe('resolveRouteFallback', () => {
    it('sends Plan flows back to /plan', () => {
      expect(resolveRouteFallback('/plan/semaine')).toEqual(PLAN);
      expect(resolveRouteFallback('/plan/bilan')).toEqual(PLAN);
    });

    // Charge and adaptation are block-scale readings; Back lands on Plan, not Today.
    it('sends charge and adaptation back to /plan', () => {
      expect(resolveRouteFallback('/plan/charge')).toEqual(PLAN);
      expect(resolveRouteFallback('/plan/adaptation')).toEqual(PLAN);
    });

    it('sends Activité flows back to /activite', () => {
      expect(resolveRouteFallback('/activite/nouvelle')).toEqual(ACTIVITE);
      expect(resolveRouteFallback('/activite/abc123')).toEqual(ACTIVITE);
      expect(resolveRouteFallback('/activite/cmrvpthya01xkmsm80lybbzqd')).toEqual(ACTIVITE);
    });

    it('resolves edit page fallback back to its parent detail', () => {
      expect(resolveRouteFallback('/activite/session-42/edit')).toEqual({
        href: '/activite/session-42',
        label: 'Séance',
      });
    });

    it('sends Moi children and every /settings child back to /moi', () => {
      expect(resolveRouteFallback('/moi/corps')).toEqual(MOI);
      expect(resolveRouteFallback('/moi/objectifs')).toEqual(MOI);
      expect(resolveRouteFallback('/moi/performance')).toEqual(MOI);
      expect(resolveRouteFallback('/moi/calibration')).toEqual(MOI);
      expect(resolveRouteFallback('/settings/account')).toEqual(MOI);
      expect(resolveRouteFallback('/settings/integrations')).toEqual(MOI);
      expect(resolveRouteFallback('/settings/equipment')).toEqual(MOI);
      expect(resolveRouteFallback('/settings/privacy')).toEqual(MOI);
    });

    it('sends remaining /today drill-downs and nutrition back to Résumé', () => {
      expect(resolveRouteFallback('/today/recovery')).toEqual(HOME);
      expect(resolveRouteFallback('/today/sleep')).toEqual(HOME);
      expect(resolveRouteFallback('/nutrition')).toEqual(HOME);
    });

    it('labels legal walls without inventing a shell hub parent', () => {
      expect(resolveRouteLabel('/consent')).toBe('Consentements');
      expect(resolveRouteLabel('/privacy')).toBe('Confidentialité');
      expect(resolveRouteLabel('/terms')).toBe('Conditions');
      // No defaultParent → HOME only as last resort; gate fail-closes entry.
      expect(resolveRouteFallback('/consent')).toEqual(HOME);
      expect(resolveRouteFallback('/privacy')).toEqual(HOME);
      expect(resolveRouteFallback('/terms')).toEqual(HOME);
    });

    it('defaults to home when no matcher applies', () => {
      expect(resolveRouteFallback('/unknown')).toEqual(HOME);
    });

    // Deleted outright rather than redirected: a stale bookmark must not resolve
    // to a label that implies the surface still exists.
    it('has no matcher left for the removed /training and legacy stub routes', () => {
      for (const gone of [
        '/training',
        '/training/planning',
        '/training/weekly-review',
        '/training/manual',
        '/training/history',
        '/training/trips',
        '/activite/sejours',
        '/activite/sejours/trip-1',
        '/today/effort',
        '/today/adaptation',
        '/settings',
        '/settings/calibration',
        '/settings/goals',
        '/progress',
        '/biology',
      ]) {
        expect(resolveRouteLabel(gone)).toBe('Retour');
        expect(resolveRouteFallback(gone)).toEqual(HOME);
      }
    });
  });
});
