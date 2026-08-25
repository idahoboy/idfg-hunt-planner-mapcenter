#!/usr/bin/env bash
# Build and publish the demo to GitHub Pages (gh-pages branch, served from /).
#
#   ./scripts/deploy-pages.sh
#
# Differs from the container build in two ways, both deliberate:
#   - VITE_BASE is the repo sub-path, because Pages serves from
#     https://<user>.github.io/<repo>/ rather than the site root. Every runtime
#     fetch (config YAML, thumbnails, SDK assets) resolves against it.
#   - SDK assets come from the Esri CDN instead of being bundled, which takes
#     the branch from ~100MB to ~17MB. The container still bundles them so it
#     works on networks that block js.arcgis.com.
set -euo pipefail

REPO="${PAGES_REPO:-idfg-hunt-planner-mapcenter}"
OWNER="${PAGES_OWNER:-idahoboy}"
REMOTE="git@github.com:${OWNER}/${REPO}.git"

# Pin the CDN to the SDK version actually installed, so assets and code agree.
SDK_MINOR="$(node -p "require('@arcgis/core/package.json').version.split('.').slice(0,2).join('.')")"

echo "building for /${REPO}/ against SDK ${SDK_MINOR} assets"
rm -rf dist
VITE_BASE="/${REPO}/" \
VITE_ESRI_ASSETS_PATH="https://js.arcgis.com/${SDK_MINOR}/@arcgis/core/assets" \
  npm run build

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -R dist/. "$WORK/"
touch "$WORK/.nojekyll"          # keep Pages from hiding _-prefixed paths
cp "$WORK/index.html" "$WORK/404.html"   # SPA fallback for unknown paths

cd "$WORK"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy Map Center demo to GitHub Pages

Generated from main by scripts/deploy-pages.sh; do not edit this branch."
git push -q --force "$REMOTE" gh-pages

echo "deployed -> https://${OWNER}.github.io/${REPO}/"
