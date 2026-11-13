#!/bin/bash
# check.sh [view]: does the page in the working tree draw exactly what the last commit draws?
#
# Records 52 views and click sequences (tools/check/check.html) twice in headless Chromium: the
# committed web/ (git HEAD) and the working tree, both with tonight's live files, then compares.
# For changes that should look the same (cleanups, a new country next to the US pages). After an
# intended change, read the differences: the new recording is the next baseline once committed.
# Output in data/check/ (gitignored). The baseline is reused while HEAD and the live files stay
# the same. Keeps the Mac awake while it runs (caffeinate; not with the lid closed).
set -u
# keep the Mac awake for the whole run (both recordings), not one recording at a time
[ -z "${CHECK_AWAKE:-}" ] && CHECK_AWAKE=1 exec caffeinate -i "$0" "$@"
cd "$(dirname "$0")/../.."
OUT=data/check
mkdir -p "$OUT"
live_md5() { cat web/data/us/live/*.json 2>/dev/null | md5 -q; }
KEY="$(git rev-parse HEAD) $(live_md5) ${1:-all}"

if [ "$(cat "$OUT/base.key" 2>/dev/null)" != "$KEY" ]; then
  echo "recording the committed page ($(git rev-parse --short HEAD))..."
  rm -rf "$OUT/base-web"
  mkdir -p "$OUT/base-web"
  git archive HEAD web | tar -x -C "$OUT/base-web" --strip-components 1
  # live files are not committed: use the working tree's, the same for both recordings, where
  # the committed page looks for them (data/us/live/; data/live/ before November 13, 2026)
  for d in "$OUT/base-web/data/us" "$OUT/base-web/data"; do
    [ -d "$d" ] && { rm -rf "$d/live"; [ -d web/data/us/live ] && ln -s "$PWD/web/data/us/live" "$d/live"; break; }
  done
  tools/check/record.sh "$OUT/base.txt" "$OUT/base-web" ${1:+"$1"} || exit 1
  echo "$KEY" > "$OUT/base.key"
fi
echo "recording the working tree..."
tools/check/record.sh "$OUT/new.txt" web ${1:+"$1"} || exit 1
[ "$(live_md5)" = "$(cut -d' ' -f2 "$OUT/base.key")" ] || echo "WARNING: live files changed during the run: run again"
uv run python tools/check/compare.py "$OUT/base.txt" "$OUT/new.txt"
