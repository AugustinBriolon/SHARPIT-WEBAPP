# CI & Vercel preview speed

Speed up feature-branch CI and Vercel preview deploys **without** weakening
secret scanning on code changes.

## Deploys: only the apps a push touches

Three Vercel projects build from this repository: `sharpit-webapp` (`apps/web`), `sharpit-api` (`apps/api`),
`sharpit-hub` (`apps/hub`). What each one is built from is listed once, in
[`scripts/ci/deploy-scopes.mjs`](../../scripts/ci/deploy-scopes.mjs).

- **Deploy workflow** ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)): runs when CI
  finishes green on a push to `main` (`workflow_run`), so a red commit never costs a Vercel build.
  [`scripts/ci/affected-apps.mjs`](../../scripts/ci/affected-apps.mjs) lists the apps whose scope changed since the
  last commit Deploy succeeded on (a CI run cancelled by a newer push is folded into the next one) and the
  workflow calls those projects' Deploy Hooks (secrets `VERCEL_DEPLOY_HOOK_WEB`, `_API`, `_HUB`). A docs-only push
  skips CI and deploys nothing. Manual run: _Actions → Deploy → Run workflow_ with the apps to deploy.
- **Vercel builds skip type checking** (`typescript.ignoreBuildErrors` in each `next.config.ts`): CI already
  typechecks the commit Deploy ships, so the build does not pay for it twice. A manual Deploy run or a
  `vercel deploy` from a laptop is not gated by CI: run `yarn typecheck` first.
- **Vercel's own Git deployments** are off since 2026-09-27 (`git.deploymentEnabled: false` in each
  `vercel.json`), so a push creates no deployment at all on the projects it does not touch, and branches build no
  preview.
- **`ignoreCommand`** stays as a second guard: [`scripts/ci/vercel-ignore-build.mjs`](../../scripts/ci/vercel-ignore-build.mjs)
  `--app <name>` skips a build when nothing in the app's scope changed since its last deployment
  (`VERCEL_GIT_PREVIOUS_SHA`); unknown range → build (fail open).

### Deploy Hooks (one-time, per project)

Vercel → project → Settings → Git → Deploy Hooks → name `github-main`, branch `main` → copy the URL → GitHub → repo →
Settings → Secrets and variables → Actions → `VERCEL_DEPLOY_HOOK_WEB` (`sharpit-webapp`), `VERCEL_DEPLOY_HOOK_API`
(`sharpit-api`), `VERCEL_DEPLOY_HOOK_HUB` (`sharpit-hub`). A hook URL deploys the project to whoever has it: keep it
a secret.

### Local check of the ignore script

```bash
# Simulate a docs-only range (expect exit 0 = skip)
git diff --name-only HEAD^ HEAD   # inspect
node scripts/ci/vercel-ignore-build.mjs; echo $?

# Unit tests for the path rules
yarn web vitest run src/contracts/vercel-ignore-build.test.ts
```

## GitHub Actions

### CI

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — on every push to `main` and every PR: `yarn install
--immutable`, `prisma generate`, `yarn typecheck`, then `yarn test` (which includes the presentation architecture
guard test).

- `paths-ignore` for docs / markdown so docs-only PRs skip the heavy install + `yarn test` suite.
- `yarn test` caps Vitest at 4 workers per package (`turbo run test -- --maxWorkers=4`). Turbo runs every
  package's suite at once and each Vitest defaults to one worker per core, so the whole run meant ~100 workers
  on 12 cores: the first test of a file, which pays its dynamic `import()` of a heavy handler graph, went past
  the 15 s timeout at random. Capped, the run is faster (≈54 s against ≈63 s) and stable. Running `vitest` in
  one package keeps its full parallelism.
- `concurrency` with `cancel-in-progress: true` cancels obsolete runs on the same PR/ref.
- Yarn cache via `actions/setup-node` + `actions/cache` on `node_modules` / `.yarn/cache` keyed by `yarn.lock`.

### GitGuardian / secret audit

[`.github/workflows/gitguardian.yml`](../../.github/workflows/gitguardian.yml)

- **Runs ggshield** on PRs and `main` pushes whenever non-docs paths change (includes `src/`, lockfiles, `.env*`, workflows, config) **when** `GITGUARDIAN_API_KEY` is set.
- Feature branches are covered via `pull_request` only (avoids duplicate push+PR runs).
- **Skipped** on pure docs / screenshot / markdown-only changes (`paths-ignore`).
- If the Action secret is unset, the job warns and exits successfully; keep the **GitGuardian GitHub App** check ("GitGuardian Security Checks") enabled so secret audit stays on the critical path for code changes.
- To enable path-filtered ggshield in Actions: add repository secret `GITGUARDIAN_API_KEY`.

## Verify

1. Open a PR that only touches `docs/**` → Vercel deployment should cancel via ignore step; Guard + GitGuardian workflows should not run (paths-ignore).
2. Open a PR that changes `src/**` or `yarn.lock` → Vercel builds; Guard runs tests; GitGuardian scans.
3. Push twice quickly on the same feature branch → older preview/CI runs cancel in favour of the latest.
