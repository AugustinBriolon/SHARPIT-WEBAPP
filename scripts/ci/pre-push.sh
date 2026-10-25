#!/usr/bin/env bash
# Runs, before a push, what GitHub's CI and Vercel's build run, on the commit being pushed.
#
# Why a clean checkout: the checks passed locally while CI failed, because ignored and generated
# files (next-env.d.ts, .next, build output) satisfied them here and do not exist on a runner.
# So the commit goes to a throwaway worktree that holds tracked files only; node_modules is
# linked in, never reinstalled.
#
# 1. the lockfile, with the Yarn the repo pins (CI and Vercel run `install --immutable`)
# 2. typecheck, the text-colour guard, every package's tests, the offline coach evals (ci.yml)
# 3. the build of every app (Vercel's `yarn build`)
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

echo "pre-push 1/3 · lockfile with the pinned Yarn"
corepack yarn install --immutable --mode=skip-build >/dev/null

tmp=$(mktemp -d)
cleanup() {
  git -C "$root" worktree remove --force "$tmp" >/dev/null 2>&1 || rm -rf "$tmp"
}
trap cleanup EXIT
git worktree add -q --detach "$tmp" HEAD

# Dependencies are shared with the working copy: the root and each workspace's own node_modules.
ln -s "$root/node_modules" "$tmp/node_modules"
for dir in apps/* packages/*; do
  if [ -d "$root/$dir/node_modules" ]; then
    ln -s "$root/$dir/node_modules" "$tmp/$dir/node_modules"
  fi
done

cd "$tmp"
echo "pre-push 2/3 · CI: typecheck, colour guard, tests, evals"
yarn typecheck
node scripts/ci/check-hardcoded-text-colors.mjs
yarn test
yarn api eval:coach-memory >/dev/null
yarn api eval:weekly-brief >/dev/null
yarn api eval:coach-prompt-improve >/dev/null

echo "pre-push 3/3 · Vercel: build of every app"
yarn build
echo "pre-push: all green"
