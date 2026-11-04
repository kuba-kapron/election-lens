#!/usr/bin/env bash
# Upload the site to Cloudflare Pages, once or every few minutes on election night.
#
#   pipeline/publish.sh            # one upload
#   pipeline/publish.sh --loop     # every 150 seconds until Ctrl+C (the importer runs separately)
#
# Uploads web/ only (the page, images and data; nothing from data/ or photos/), without Finder's
# .DS_Store files and half-written *.tmp files. Cloudflare keeps files that did not change, so
# each upload sends only the live files that did. Free plan: 500 uploads a month; a night at one
# every 150 s is about 200.
# Needs: wrangler (npm, in this project's node_modules) and a one-time `npx wrangler login`.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=election-lens
EVERY=150

upload() {
  local tmp
  tmp=$(mktemp -d)
  rsync -a --exclude '.DS_Store' --exclude '*.tmp' web/ "$tmp/"
  if npx wrangler pages deploy "$tmp" --project-name "$PROJECT" --branch main --commit-dirty=true >"$tmp.log" 2>&1; then
    echo "$(date +%H:%M:%S) uploaded"
  else
    echo "$(date +%H:%M:%S) upload failed (the site keeps the previous version):"
    tail -5 "$tmp.log"
  fi
  rm -rf "$tmp" "$tmp.log"
}

if [ "${1:-}" = "--loop" ]; then
  while true; do
    upload
    sleep "$EVERY"
  done
else
  upload
fi
