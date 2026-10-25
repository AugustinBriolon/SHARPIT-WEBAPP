# ADR-110: The carnet waits on values, not on pages

**Status:** Accepted
**Date:** 2026-10-25
**Author:** Augustin Briolon
**Amends:** ADR-072 (point 9: navigations are instant)

---

## Context

ADR-072 point 9 made every carnet page one `'use cache: private'` scope of five minutes
(`CARNET_FRESHNESS`) that awaits all of its reads at the top, with a `loading.tsx` skeleton below
the shared layout for a navigation that is not ready yet.

That skeleton (`CarnetPageSkeleton`) draws the whole page as grey blocks, including the labels,
section names and units that never change. The athlete asked for the opposite: text that never
changes shows at once, and a skeleton stands only where a value is still being read, since that
value is the parameter and can differ from one reading to the next.

The Next.js docs shipped with this version (`instant-navigation.md`, `use-cache-private.md`)
describe the tool: an async component wrapped in `<Suspense>` streams in over its fallback, and a
`'use cache: private'` function caches one read in the browser, with a stale time of at least five
minutes so the route's App Shell can carry it.

---

## Decision

1. **Static text is never behind a skeleton.** A page renders synchronously: kickers, titles that
   do not depend on a reading, section labels, figure labels and units come from the page itself
   and show in the first paint.
2. **A value waits alone.** Each value that comes from a reading (a figure, a section title that
   is a verdict, a sentence, a ring, a chart) is wrapped in `<Reading>`, an async server component
   inside `<Suspense>` whose fallback is a micro-skeleton of that value's own size. Two values
   from the same reading resolve together but each keeps its own skeleton.
3. **The private cache moves from the page to the read.** Each read is its own
   `'use cache: private'` function with `cacheLife(CARNET_FRESHNESS)`, so a page no longer awaits
   anything at its top level and several `<Reading>`s of one read share one cache entry.
   Anything that depends on the clock (the training day) is computed inside the read, never in the
   page.
4. **A read that fails says so in place.** A `<Reading>` whose read returns null renders the
   value's empty form (« — ») or the section's unreadable line; it never takes the page down
   (ADR-072 point 4 holds).
5. **No whole-page skeleton remains.** `CarnetPageSkeleton`, `CarnetSkeletonFrame` and the
   `loading.tsx` files that render them are removed once every page is converted. A region that is
   one unit of data (a chart, a reading list) may wait as one micro-skeleton of its own shape.
6. **Motion is unchanged.** A counted figure still counts (ADR-072 point 8); the skeleton pulse
   respects Reduce Motion (`motion-reduce:animate-none`) and ADR-107 still applies.

---

## Rationale

- The athlete sees the page at once and sees exactly what is still being read; nothing that is
  already known is hidden.
- `<Suspense>` per value is the mechanism the framework documents for a static shell with
  streamed values; the private cache keeps the five-minute freshness and the prefetch of ADR-072.
- One read per function removes the page-wide `Promise.all` and lets a slow read hold up only its
  own values.

---

## Alternatives Considered

### Alternative 1: Keep the whole-page skeleton and make it more accurate

**Pros:** no change to how pages read.

**Cons:** it still hides text that never changes and still blocks every value on the slowest read.

**Rejected because:** it is the behaviour the athlete asked to remove.

### Alternative 2: One `<Suspense>` per card instead of per value

**Pros:** far fewer boundaries.

**Cons:** a card's labels and units hide until its read lands, which is the same complaint at a
smaller size.

**Rejected because:** the unit of waiting must be the value.

---

## Consequences

### Positive

- Labels, titles and units are in the first paint on a direct visit and on a client navigation.
- A slow endpoint delays only the values that depend on it.
- One shared `Reading` and one `Skel` replace the per-page skeleton frames.

### Negative

- Pages gain one boundary per value, so a page's markup carries more structure; the page's logic
  moves into small read functions.
- Each `<Reading>` of one read re-awaits the same cache entry; a read that is not cached would run
  once per value, so every read must stay inside a private cache.
- A failure that was one « unreadable » line per section becomes one empty value per figure.

---

## Review Criteria

- If navigations stop being instant after the private cache moves to the read, return the cache
  to the page and keep the micro-skeletons inside it.
- If the number of boundaries costs measurable render time on the long pages (La saison, a
  session), group the figures of one row into one `<Reading>`.
