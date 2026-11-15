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

cd "$root/app"
npm ci
VITE_BASE="/${repo}/" npm run build

cp -R "$root/app/dist/." "$tmp/"
touch "$tmp/.nojekyll"
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Publish dashboard build"
git remote add origin "$(git -C "$root" remote get-url origin)"
git push -q --force origin gh-pages
echo "published gh-pages for ${repo}"
