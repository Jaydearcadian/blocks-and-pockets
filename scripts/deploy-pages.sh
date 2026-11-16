#!/usr/bin/env bash
# Build the dashboard for GitHub Pages and publish it to the orphan gh-pages branch.
# Usage: scripts/deploy-pages.sh <repo-name>
# Needs an authenticated gh (or a git credential helper) and an "origin" remote. Force-pushes gh-pages only.
set -euo pipefail

repo="${1:?usage: scripts/deploy-pages.sh <repo-name>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gh auth status >/dev/null

# The build reads the working tree, not HEAD, and bakes in any VITE_* setting. Publish only what is committed.
if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "refusing to publish: the working tree has uncommitted changes" >&2
  exit 1
fi
if compgen -G "$root/app/.env*" | grep -v '\.env\.example$' >/dev/null; then
  echo "refusing to publish: app/.env* would be baked into the build" >&2
  exit 1
fi
if env | grep -q '^VITE_'; then
  echo "refusing to publish: a VITE_* variable is set in the environment" >&2
  exit 1
fi

cd "$root/app"
npm ci
VITE_BASE="/${repo}/" npm run build

cp -R "$root/app/dist/." "$tmp/"
touch "$tmp/.nojekyll"
cd "$tmp"
git init -q -b gh-pages
git add -A
# The throwaway repo has no identity of its own, so it takes the author set in this repo.
name="$(git -C "$root" config user.name)"
email="$(git -C "$root" config user.email)"
git -c user.name="$name" -c user.email="$email" commit -q -m "Publish dashboard build"
git remote add origin "$(git -C "$root" remote get-url origin)"
git push -q --force origin gh-pages
echo "published gh-pages for ${repo}"
