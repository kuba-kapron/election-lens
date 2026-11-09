# Election night checklist, November 3–4, 2026

Times are Warsaw time (CET).

## Before polls close (by 00:30)

1. Open two terminal windows in the project folder.
2. Window 1, the page:
   `cd web && uv run python -m http.server 8000`
   then open http://localhost:8000/#race=senate&year=2026 in the browser
   (the governor races are under Governor).
3. Window 2, the importer:
   `uv run pipeline/live.py`
   It prints one line per race every minute: source, % counted, top two.
   Stop it with Ctrl+C.
4. Check that the page says "updated" with the current time and has no "Test data" label.
5. Keep the Mac plugged in, and stop it from sleeping (System Settings > Lock Screen, or run
   `caffeinate -d` in a third window).
6. Public copy (optional), a third window: `pipeline/publish.sh --loop` uploads web/ to
   Cloudflare Pages every 150 s. Page changes reach the public site only while it runs.

## When polls close

| Warsaw | Races |
|---|---|
| 00:00 | Kentucky (most of the state closes an hour earlier) |
| 01:00 | Georgia, South Carolina, Virginia, Florida (most) |
| 01:30 | North Carolina, Ohio (Senate + governor), West Virginia |
| 02:00 | Alabama, Delaware, Illinois, Maine, Massachusetts, Mississippi, New Hampshire, New Jersey, Oklahoma, Rhode Island, rest of Florida, Texas (most) |
| 02:30 | Arkansas |
| 03:00 | Colorado, Kansas, Louisiana, Michigan, Minnesota, New Mexico, South Dakota, Tennessee, Wyoming, rest of Texas |
| 04:00 | Iowa, Montana, Nebraska |
| 05:00 | Idaho, Oregon |
| 06:00–07:00 | Alaska |

Governor races (36) are under Governor; official results for South Carolina, Iowa, Georgia,
Florida, Oregon, South Dakota, Rhode Island, Texas, New York, Maryland and Arizona (some only
once their files fill in), civicAPI for the rest.

Times from CBS News (the moment a state's last polls close). Official state results are read
for North Carolina, South Carolina, Georgia, Texas, Virginia, Iowa, Delaware, South Dakota,
Oregon and Rhode Island; every other race comes from civicAPI (unofficial, labeled on the
page). Virginia and Rhode Island show civicAPI until their official report has numbers, then
switch by themselves. Florida's election-night site (floridaelectionwatch.gov) is behind a bot
check, so Florida comes from civicAPI. A source that had numbers and then fails keeps its last
numbers (marked stale after 10 minutes).

Official sources usually post the first numbers 15–45 minutes after polls close.

House: official state results for 182 districts (NC, SC, IA, FL, TX, GA, VA, OR, NY, DE, SD, MD, UT,
WA, IN, ND; Florida and Virginia once their files fill in, North Dakota once its page switches
from 2024 to 2026: until then the importer prints "ND page shows the election of 11/5/2024"); the other districts from civicAPI
(unofficial), asked one state at a time, three states per round, on the 2026 district maps.
Districts show who is leading until you call them (below). The importer prints one House line
per round ("435 races, N with votes"). Louisiana's House vote tonight is a primary.

## What to watch

- **The importer's lines.** In brackets after a race you'll see why a source was skipped:
  - "test data, not shown": civicAPI hasn't switched to real numbers yet (normal before polls close).
  - "results file is still empty": Florida, before its polls close.
  - "HTTP 403 (refusal 1 of 3)": a site refused us. After 3 refusals the importer leaves that
    site alone and the race moves to the next source.
- **"slow; keeping the last copy"**: a site timed out or answered 5xx. Not a refusal: the
  importer keeps its last numbers and tries again in 3 minutes.
- **"Not refreshed for a while"** in a race's panel: no fresh numbers for 10 minutes. Check
  the importer window.
- **civicAPI numbers** are unofficial. When a county or state posts numbers you can see
  yourself, compare. If they're far off, switch that race to manual entry.

## Typing numbers in by hand

Use this when a race has no working source, or a source looks wrong:

```
uv run pipeline/live_manual.py set MI-sen El-Sayed=1234567 Rogers=1200345 --pct 45 --source "AP via NBC News"
uv run pipeline/live_manual.py clear MI-sen          # back to automatic
```

Race ids: the two-letter state plus "-sen" (e.g. MI-sen, NH-sen), and OH-gov, TX-gov. The page shows the source you type.

## Race calls

The page never calls a race itself. When a news organization calls one:

```
uv run pipeline/live_manual.py call XX-sen Lastname --by AP
uv run pipeline/live_manual.py call XX-3 Lastname --by AP     # House district (XX-AL at large)
uv run pipeline/live_manual.py uncall XX-sen                  # if it was a mistake
```

XX is the state code and Lastname the candidate's last name as the page shows it. Never copy a
real example: a copied command once called Wyoming by mistake. The importer reads calls at the
start of each round, so a call (or uncall) shows within a minute. House districts can be called
but their numbers can't be typed in.

## Maine

Maine counts first choices on election night. If nobody passes 50%, the ranked-choice count
takes about a week, so the race can't be called tonight unless someone wins outright.

## If something breaks

- Page blank or stuck: reload with Cmd+Option+R (Safari caches hard).
- Importer crashed, or you changed its code: start it again (Ctrl+C, then the same command).
  Nothing is lost; it re-reads everything and rebuilds the charts from the snapshots.
- A state's site keeps refusing: leave it. Use civicAPI or manual entry, never a workaround.
