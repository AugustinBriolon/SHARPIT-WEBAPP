# ADR-145: The carnet installs as an app and caches no reading

**Status:** Accepted
**Date:** 2026-11-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** amends [ADR-072](./ADR-072-the-web-becomes-a-reading-carnet.md) (the service worker's retirement); see [ADR-008](./ADR-008-pwa-offline-snapshot-and-sw-lifecycle.md)

---

## Context

The first web app was an installable PWA with an offline snapshot (ADR-008). When the web became
the carnet (ADR-072) its service worker was retired: `RetireServiceWorker` and a self-destructing
`public/sw.js` unregistered it and dropped its caches, so no stale page could be served. The
manifest went with it, and the carnet could no longer be added to a home screen as an app.

On 2026-11-23 the owner asked for the web app to be fully PWA-compatible again, as the first
versions were.

---

## Decision

Make the carnet installable again, with a service worker that caches no reading.

- **Manifest.** `app/manifest.ts`: standalone display, start and scope at `/`, French.
- **Icons.** 192, 512 and a full-bleed maskable 512, drawn by `app/pwa-icon/[file]/route.tsx`
  from the brand mark's one SVG (`BrandIconCanvas`), like the favicon and the Apple touch icon.
  Their names end in `.png` so the proxy serves them without a session.
- **Service worker.** `public/sw.js` precaches one file, `offline.html`, and answers a failed
  navigation with it. It never caches a page, a reading or an API answer. On activation it drops
  every other cache, which finishes retiring the old worker's.
- **Registration.** `RegisterServiceWorker` replaces `RetireServiceWorker` in the root layout.
- **iOS.** `appleWebApp` metadata, so a carnet added to a home screen opens without Safari's
  chrome; the Apple touch icons already existed.

---

## Rationale

What ADR-072 removed was the risk of a stale reading served from a cache. Installing as an app
does not need that cache: it needs a manifest, icons and a registered worker. Keeping the worker
to a single offline page gives the installed app something better than the browser's error when
the network is gone, at no risk of showing yesterday's verdict as today's.

---

## Alternatives Considered

### Alternative 1: Bring back the offline snapshot

**Description:** Cache the last readings so the carnet opens offline, as ADR-008 did.

**Pros:**

- The installed app shows something useful with no network.

**Cons:**

- A cached verdict can be read as the day's; the carnet's private caching (ADR-110) would have a
  second, harder-to-reason-about cache in front of it.

**Rejected because:** it is the hazard ADR-072 removed, and nothing asked for offline reading.

### Alternative 2: Manifest only, no service worker

**Description:** Ship the manifest and icons; register nothing.

**Pros:**

- No worker to maintain.

**Cons:**

- Offline, the installed app shows the browser's error page; some browsers still want a worker
  before they offer to install.

**Rejected because:** one precached page costs little and makes the installed app whole.

---

## Consequences

### Positive

- The carnet can be installed from Chrome, Edge and Safari (Add to Home Screen) with its icon.
- Offline, a navigation shows a page that says so and offers to retry.
- No reading is cached by the worker.

### Negative

- A service worker is back: a bad one can break navigation until it updates. It is kept to about
  thirty lines and one cache to bound that.
- `offline.html` is static: it uses system colours and the system font, not the design tokens.
- The installed app shows nothing of the carnet without a network.

### Scientific debt created

- None.

---

## Review Criteria

- If offline reading is asked for, decide what a stale reading may show before caching one.
- If the worker ever needs a second cache, version it and delete the old one on activation.
