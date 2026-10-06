/**
 * Route registry — single source of truth for back-navigation labels
 * and default parent fallbacks (when the app-managed stack is empty).
 *
 * Matched top-down: first regex wins.
 */

export type RouteEntry = {
  /** Displayed by MobileBackLink and pushed on the stack. */
  label: string;
  /** Fallback destination when the nav stack has no previous entry. */
  defaultParent?: { href: string; label: string };
  /**
   * Modal-like screen: never sits on the app nav stack.
   * After leaving, Back must return to the real previous page — not reopen this route.
   */
  transient?: boolean;
};

type Matcher = {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => RouteEntry;
};

const HOME_PARENT = { href: '/', label: 'Résumé' } as const;
const PLAN_PARENT = { href: '/plan', label: 'Plan' } as const;
const ACTIVITY_PARENT = { href: '/activite', label: 'Activité' } as const;
const MOI_PARENT = { href: '/moi', label: 'Moi' } as const;

const MATCHERS: Matcher[] = [
  { pattern: /^\/$/, resolve: () => ({ label: 'Résumé' }) },
  { pattern: /^\/plan$/, resolve: () => ({ label: 'Plan', defaultParent: HOME_PARENT }) },
  { pattern: /^\/activite$/, resolve: () => ({ label: 'Activité', defaultParent: HOME_PARENT }) },
  { pattern: /^\/moi$/, resolve: () => ({ label: 'Moi', defaultParent: HOME_PARENT }) },
  { pattern: /^\/coach$/, resolve: () => ({ label: 'Coach', defaultParent: HOME_PARENT }) },

  {
    pattern: /^\/plan\/semaine$/,
    resolve: () => ({ label: 'La semaine', defaultParent: PLAN_PARENT }),
  },
  {
    pattern: /^\/plan\/bilan$/,
    resolve: () => ({ label: 'Bilan hebdo', defaultParent: PLAN_PARENT }),
  },
  // Charge and adaptation are block-scale readings, so Back lands on Plan.
  {
    pattern: /^\/plan\/charge$/,
    resolve: () => ({ label: 'Charge', defaultParent: PLAN_PARENT }),
  },
  {
    pattern: /^\/plan\/adaptation$/,
    resolve: () => ({ label: 'Adaptation', defaultParent: PLAN_PARENT }),
  },

  {
    // Saisie: back uses nav stack when present; empty stack → Activité hub.
    pattern: /^\/activite\/nouvelle$/,
    resolve: () => ({ label: 'Nouvelle activité', defaultParent: ACTIVITY_PARENT }),
  },
  {
    pattern: /^\/activite\/([^/]+)\/edit$/,
    resolve: (m) => ({
      label: 'Édition',
      defaultParent: { href: `/activite/${m[1]}`, label: 'Séance' },
      transient: true,
    }),
  },
  {
    // Detail opened from the Activité hub list — empty-stack fallback is the hub.
    // Exclude removed séjours paths so stale bookmarks do not label as « Séance ».
    pattern: /^\/activite\/(?!sejours$)[^/]+$/,
    resolve: () => ({ label: 'Séance', defaultParent: ACTIVITY_PARENT }),
  },

  {
    pattern: /^\/today\/recovery$/,
    resolve: () => ({ label: 'Récupération', defaultParent: HOME_PARENT }),
  },
  {
    pattern: /^\/today\/sleep$/,
    resolve: () => ({ label: 'Sommeil', defaultParent: HOME_PARENT }),
  },

  {
    pattern: /^\/moi\/corps$/,
    resolve: () => ({ label: 'Corps', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/moi\/objectifs$/,
    resolve: () => ({ label: 'Objectifs', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/moi\/performance$/,
    resolve: () => ({ label: 'Performance', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/moi\/calibration$/,
    resolve: () => ({ label: 'Seuils & repères', defaultParent: MOI_PARENT }),
  },

  {
    pattern: /^\/nutrition$/,
    resolve: () => ({ label: 'Nutrition', defaultParent: HOME_PARENT }),
  },

  {
    pattern: /^\/journal$/,
    resolve: () => ({ label: 'Journal', defaultParent: HOME_PARENT }),
  },
  {
    pattern: /^\/journal\/analyses$/,
    resolve: () => ({
      label: 'Analyses',
      defaultParent: { href: '/journal', label: 'Journal' },
    }),
  },

  {
    pattern: /^\/settings\/account$/,
    resolve: () => ({ label: 'Compte', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/integrations$/,
    resolve: () => ({ label: 'Intégrations', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/maintenance$/,
    resolve: () => ({ label: 'Maintenance', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/appearance$/,
    resolve: () => ({ label: 'Apparence', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/equipment$/,
    resolve: () => ({ label: 'Équipement', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/about$/,
    resolve: () => ({ label: 'À propos', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/memory$/,
    resolve: () => ({ label: 'Mémoire du coach', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/privacy$/,
    resolve: () => ({ label: 'Profil', defaultParent: MOI_PARENT }),
  },
  {
    pattern: /^\/settings\/pro$/,
    resolve: () => ({ label: 'Pro', defaultParent: MOI_PARENT }),
  },
  // Legal walls live outside the app shell (no tab bar / NavStackTracker).
  // Labels only — empty-stack fallback stays HOME; PrivacyConsentGate fail-closes
  // any attempt to enter the shell without health/legal consent.
  { pattern: /^\/consent$/, resolve: () => ({ label: 'Consentements' }) },
  { pattern: /^\/privacy$/, resolve: () => ({ label: 'Confidentialité' }) },
  { pattern: /^\/terms$/, resolve: () => ({ label: 'Conditions' }) },
];

/** Strip search + hash to run the pathname against the matchers. */
function pathnameOf(href: string): string {
  const noHash = href.split('#', 1)[0]!;
  return noHash.split('?', 1)[0]!;
}

function match(href: string): { entry: RouteEntry } | null {
  const pathname = pathnameOf(href);
  for (const { pattern, resolve } of MATCHERS) {
    const m = pathname.match(pattern);
    if (m) {
      return { entry: resolve(m) };
    }
  }
  return null;
}

/** Human label for a pushed stack entry. */
export function resolveRouteLabel(href: string): string {
  return match(href)?.entry.label ?? 'Retour';
}

/** True for modal-like routes that must not accumulate on the nav stack. */
export function isTransientRoute(href: string): boolean {
  return match(href)?.entry.transient === true;
}

/** Where to send Back when the app stack is empty for this route. */
export function resolveRouteFallback(href: string): { href: string; label: string } {
  const entry = match(href)?.entry;
  return entry?.defaultParent ?? HOME_PARENT;
}
