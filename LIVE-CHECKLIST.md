# Election night checklist, 3–4 November 2026

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

## When polls close

| Warsaw | Races | Source |
|---|---|---|
| 01:00 | Georgia, South Carolina, Florida (most of the state) | GA: civicAPI · SC: official · FL: official |
| 01:30 | North Carolina, Ohio (Senate + governor) | NC: official · OH: civicAPI |
| 02:00 | Michigan, Maine, Mississippi, Texas (Senate + governor), rest of Florida | TX: official (statewide) · others: civicAPI |
| 03:00 | Louisiana; last polls in Michigan and Texas | LA: civicAPI |

Official sources usually post the first numbers 15–45 minutes after polls close.

## What to watch

- **The importer's lines.** In brackets after a race you'll see why a source was skipped:
  - "test data, not shown": civicAPI hasn't switched to real numbers yet (normal before polls close).
  - "results file is still empty": Florida, before its polls close.
  - "HTTP 403 (refusal 1 of 3)": a site refused us. After 3 refusals the importer leaves that
    site alone and the race moves to the next source.
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

Race ids: NC-sen, SC-sen, GA-sen, FL-sen, OH-sen, OH-gov, MI-sen, ME-sen, MS-sen, TX-sen,
TX-gov, LA-sen. The page shows the source you type.

## Race calls

The page never calls a race itself. When a news organization calls one:

```
uv run pipeline/live_manual.py call GA-sen Ossoff --by AP
uv run pipeline/live_manual.py uncall GA-sen          # if it was a mistake
```

## Maine

Maine counts first choices on election night. If nobody passes 50%, the ranked-choice count
takes about a week, so the race can't be called tonight unless someone wins outright.

## If something breaks

- Page blank or stuck: reload with Cmd+Option+R (Safari caches hard).
- Importer crashed: start it again. Nothing is lost; it re-reads everything.
- A state's site keeps refusing: leave it. Use civicAPI or manual entry, never a workaround.
