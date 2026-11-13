#!/bin/bash
# record.sh <out file> <web dir> [view]: opens every test view of the page in headless Chromium
# and writes what it draws to <out file>. [view] runs one view only (its JSON from check.html).
# Used by check.sh; needs Playwright's Chromium (~/Library/Caches/ms-playwright) or CHROME=<path>.
set -u
cd "$(dirname "$0")/../.."
OUT=$1 WEB=$2
CHROME=${CHROME:-$(ls -d ~/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium 2>/dev/null | tail -1)}
[ -x "$CHROME" ] || { echo "Chromium not found: set CHROME=<path to the browser>"; exit 1; }
PROFILE=$(mktemp -d -t election-lens-check)
uv run python tools/check/server.py "$OUT" "$WEB" & SRV=$!
# remove the browser's profile folder once Chromium has closed (it writes to it while closing)
done_() {
  kill $SRV 2>/dev/null
  pkill -f "$PROFILE" 2>/dev/null
  for _ in $(seq 1 20); do pgrep -f "$PROFILE" >/dev/null || break; sleep 0.5; done
  rm -rf "$PROFILE" 2>/dev/null || { sleep 2; rm -rf "$PROFILE"; }
}
trap done_ EXIT
sleep 1
ONLY=${3:+?only=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$3")}
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" --force-prefers-reduced-motion \
  --window-size=1400,1000 --remote-debugging-port=0 \
  "http://127.0.0.1:8765/_check.html$ONLY" >/dev/null 2>&1 &
# a full run takes about 4 minutes; give up after 25
for i in $(seq 1 1500); do grep -q '^### END' "$OUT" 2>/dev/null && break; sleep 1; done
echo "$(grep -c '^### {' "$OUT") views, $(wc -c < "$OUT" | tr -d ' ') bytes, ${i}s"
grep -q '^### END' "$OUT" || { echo "the run did not finish"; exit 1; }
grep -q '^### {' "$OUT" || { echo "no views recorded: the page or the browser did not start"; exit 1; }
