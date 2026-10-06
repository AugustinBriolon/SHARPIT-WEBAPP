<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SHARPIT — Agent context

**Layout:** Yarn workspaces + Turborepo monorepo ([ADR-048](docs/adr/ADR-048-web-repository-becomes-a-monorepo.md)). The Next.js apps are `apps/web` (the UI), `apps/hub` (the apex: AASA, `/connect/*`, legal pages — ADR-051) and `apps/api` (route handlers only, mounted from `@sharpit/server/handlers`); shared UI is `packages/ui` (`@sharpit/ui`) — every `src/…` path in these docs is relative to it. The pure domain is `packages/core` (`@sharpit/core`, formerly `src/core`), shared helpers `packages/shared` (`@sharpit/shared`), the Prisma schema and client `packages/db` (`@sharpit/db`), the code the web may import `packages/app` (`@sharpit/app/lib/…`: pure modules, view models, `api.` payload types — never the server or the database, [ADR-050](docs/adr/ADR-050-web-builds-from-an-app-package-not-the-server.md)), the server application code `packages/server` (`@sharpit/server/lib|infrastructure|adapters|presentation|athlete-state|data/…`, formerly `@/lib/…` and friends — it never imports an app); `src/presentation`, `src/adapters` and `src/athlete-state` stay in the app. Run app scripts with `yarn web <script>` and domain scripts with `yarn core <script>`; `yarn test` / `yarn typecheck` / `yarn lint` / `yarn build` at the root go through Turbo.

**Phase:** Stabilization — Core frozen. Express the Digital Twin vertically as a **Digital Twin coach** (analyses + programme + suivi toward a goal); do not add core engines.

**Before implementing, read:**

- [`docs/models/CORE_ARCHITECTURE.md`](docs/models/CORE_ARCHITECTURE.md) — **architectural constitution** (frozen Core)
- [`docs/product/PRODUCT.md`](docs/product/PRODUCT.md) — constitution, execution doctrine, athlete journey
- [`docs/design/DESIGN_LANGUAGE.md`](docs/design/DESIGN_LANGUAGE.md) — visual and interaction law
- [`docs/design/DESIGN_SYSTEM_PROMPT.md`](docs/design/DESIGN_SYSTEM_PROMPT.md) — agent-facing design prompt (tokens, patterns, anti-patterns)
- [`docs/design/INFORMATION_ARCHITECTURE.md`](docs/design/INFORMATION_ARCHITECTURE.md) — required when changing navigation, page hierarchy, contextual Coach entry points, or athlete-facing information structure
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — code structure and conventions
- [`docs/domain/DOMAIN.md`](docs/domain/DOMAIN.md) — domain concepts and Digital Twin
- [`docs/EVENT_DRIVEN_ARCHITECTURE.md`](docs/EVENT_DRIVEN_ARCHITECTURE.md) — sync and orchestration (athlete-centric)
- [`docs/INSTANT_UX_ARCHITECTURE.md`](docs/INSTANT_UX_ARCHITECTURE.md) — optimistic UI, cache strategy, Instant / Background / Blocking
- [`docs/ATHLETE_SNAPSHOT.md`](docs/ATHLETE_SNAPSHOT.md) — canonical athlete state (Morning Experience)

Point-in-time audits, sprint reports, design capture folders, and Superpowers plans live under [`docs/archive/`](docs/archive/) or [`docs/audits/`](docs/audits/) — **not** product/design law.

## Agent skills (curated allowlist)

Skills live in [`.agents/skills/`](.agents/skills/). **Only the folders listed below are allowed.** Do not install Expo/other-DB/Prisma-v7 packs without an explicit product decision. Prefer project docs above before any skill.

**Precedence (always):** `docs/design/DESIGN_LANGUAGE.md` + `DESIGN_SYSTEM_PROMPT.md` + `INFORMATION_ARCHITECTURE.md` + `PRODUCT.md` + `CORE_ARCHITECTURE.md` **win** over skill taste defaults (including `design-taste-frontend` / `emil-design-eng` / `better-interface`) and over anything in `docs/archive/`. Skills refine execution; they do not redefine SHARPIT's visual or domain law.

**Explicitly approved (Augustin Briolon — 2026-09-13):** `design-taste-frontend` (aka **taste** / taste-skill), `caveman`, `better-interface`, `emil-design-eng`. Install via `npx skills add <owner/repo> -s <skill> -a cursor -y`. Restore from lock with `npx skills experimental_install`.

### How to invoke (Augustin)

- **Slash commands** (project: `.cursor/commands/*.md`): type `/` in Cursor chat → `/caveman`, `/better-interface`, `/emil-design-eng`, `/design-taste` or `/taste`. Each command tells the agent to **read** the matching `.agents/skills/<name>/SKILL.md` first (run `npx skills experimental_install` if missing).
- **Natural language**: name the skill (e.g. « critique UI with better-interface », « speak caveman ») — agent should still read `SKILL.md` and respect precedence above.
- Skills under `.agents/skills/` are gitignored; commands + `skills-lock.json` + this allowlist are the shared contract.

### When to invoke

| Situation                                          | Skill(s)                                                                                                    | How to use                                                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| UI / surface work inside the existing DS           | `impeccable`                                                                                                | Read skill, then apply **only** within `DESIGN_LANGUAGE.md` / `DESIGN_SYSTEM_PROMPT.md` tokens and patterns.                                   |
| Anti-slop / landing-style craft (approved taste)   | `design-taste-frontend` (aka taste)                                                                         | Explicitly approved. Still subordinate to `docs/design/*` — never override tokens, IA, or SHARPIT product UI with pack defaults.               |
| Design-eng polish / interaction feel               | `emil-design-eng`                                                                                           | Explicitly approved. Use for craft/polish judgment; docs + DS remain law.                                                                      |
| Cross-cut interface review (a11y/layout/type/UI)   | `better-interface`                                                                                          | Explicitly approved. Orchestrates `better-*` review; keep FR copy and existing DS.                                                             |
| Terse / token-saving agent communication           | `caveman`                                                                                                   | Explicitly approved. Compression style only — do not drop technical accuracy or French UI strings.                                             |
| Product craft / "is this SHARPIT-quality?"         | `hallmark`                                                                                                  | Use for judgment passes on athlete-facing flows, not greenfield restyles.                                                                      |
| Product / domain workshop (needs, model, strategy) | `layers-intro` → then the matching `layers-*`                                                               | Start with intro; pick one layer per question (user-needs, domain, surface, …).                                                                |
| Motion / micro-interactions (web)                  | `animate`, then `motion-foundations` / `motion-patterns`, then `transitions-dev` / `transitions-polish`     | Web only. CSS-first per ADR-028; Motion for state-bound animation only. Never Expo/RN skills.                                                  |
| GSAP / ScrollTrigger (landing, carnet)             | `gsap-core`, `gsap-scrolltrigger`, `gsap-react`, then `gsap-timeline` / `gsap-plugins` / `gsap-performance` | Official GreenSock skills (Augustin, 2026-10-06). `useGSAP` + `gsap.matchMedia` for Reduce Motion; starting states set before the first paint. |
| Accessibility pass                                 | `accessibility`                                                                                             | Before shipping interactive UI changes.                                                                                                        |
| Copy / microcopy tone                              | `better-writing`                                                                                            | Athlete-facing strings; keep French UI as shipped.                                                                                             |
| UI anti-patterns audit                             | `anti-ui-slop`                                                                                              | Audit only — do not invent a new aesthetic.                                                                                                    |
| Next.js / React performance patterns               | `vercel-react-best-practices`                                                                               | Server Components, caching, waterfalls.                                                                                                        |
| New tests / red-green                              | `tdd`                                                                                                       | Default for behaviour changes.                                                                                                                 |
| Hard bug / regression                              | `diagnosing-bugs`                                                                                           | Build a tight feedback loop before hypothesising.                                                                                              |
| PR / diff review                                   | `code-review`                                                                                               | After implementation, before commit request.                                                                                                   |
| Domain model / Digital Twin language               | `domain-modeling`                                                                                           | With `docs/domain/DOMAIN.md`; Core stays frozen.                                                                                               |
| Prisma migrate / generate / validate (Postgres v6) | `prisma-cli-*`, `prisma-database-setup-postgresql`                                                          | Match the exact CLI skill to the command; stack is **PostgreSQL + Prisma 6**.                                                                  |
| Agent docs / skill authoring                       | `writing-for-agents`                                                                                        | When editing agent-facing markdown.                                                                                                            |
| Open research question                             | `research`                                                                                                  | Spikes, unknown APIs — not for Core invention.                                                                                                 |
| Merge conflicts                                    | `resolving-merge-conflicts`                                                                                 | When git conflicted.                                                                                                                           |
| "Which skill fits?"                                | `find-skills` / `grill-me`                                                                                  | Router / clarification — prefer this table first.                                                                                              |

### Explicitly out of scope (do not re-add casually)

- Expo / React Native animation or mobile imagegen (`animate-expo`, `imagegen-frontend-mobile`, …)
- Other Leonxlnx taste variants that fight `docs/design/*` (`industrial-brutalist-ui`, `stitch-design-taste`, `gpt-taste`, `minimalist-ui`, …) — only `design-taste-frontend` is approved
- Prisma setups for MongoDB, Cockroach, MySQL, SQLite, SQL Server
- Prisma **v7** upgrade skills while the repo is on Prisma 6
- Duplicate UI directors beyond the allowlist (`ui-design`, …) — **`impeccable` + `docs/design/*` remain canonical**; approved taste/design-eng skills refine, they do not replace docs
