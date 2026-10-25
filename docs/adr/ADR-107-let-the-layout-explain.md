# ADR-107: Let the layout explain — no redundant labels or secondary descriptions

**Status:** Accepted  
**Date:** 2026-10-25  
**Author:** Augustin  
**Supersedes:** N/A

---

## Context

Carnet pages and settings carried a kicker and a lead under every title, hints under figures and a description under every row, most of them restating what the title, the value or the structure already showed.

---

## Decision

Adopt the rule: avoid unnecessary labels and secondary descriptions; let the layout do the explaining. Text stays when it carries data, names an error and its fix, offers the next step of an actionable empty state, confirms a destructive action, or states consent / legal terms.

---

## Rationale

Every extra line competes with the figure the athlete came for. Structure (grouping, order, weight) explains faster than prose.

---

## Consequences

### Positive

- Denser, calmer pages; less copy to translate and maintain in `copy-en.json`.

### Negative

- First-time users get less hand-holding; titles and values must be self-evident.

---

## Review Criteria

Revisit if onboarding or support data shows athletes misreading a screen that lost its description.
