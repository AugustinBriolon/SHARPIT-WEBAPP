# CI coach offline evals (P4c) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation

## Goal

Run deterministic coach eval harnesses on every CI check so P2/P3d regressions fail the build without LLM keys or a database.

## Change

In `.github/workflows/ci.yml`, after `yarn test`:

```yaml
- name: Coach offline evals
  run: |
    yarn api eval:coach-memory
    yarn api eval:weekly-brief
  env:
    YARN_NODE_LINKER: node-modules
```

## Non-goals

- Wiring into deploy
- LLM bench (`bench:coach-models`) — billed, needs secrets
- Raising thresholds beyond current golden fixtures
