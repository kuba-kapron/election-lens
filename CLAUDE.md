# Election Lens: notes for Claude Code

Open-source (AGPL-3.0) website for exploring election results at every level, from the whole
country down to counties, and for following elections live. A hobby and portfolio project by
the repository owner. Started in a claude.ai conversation on 29–31 October 2026; this file
carries over what was decided there.

## What exists now

US presidential results 2000–2024 on one static page (`web/`):

- Map colored by state (default) or county; click a state to zoom in and see its counties,
  click a county to zoom to it. Typeahead state finder (combobox).
- Two views: **Margin** (who won, by how much) and **Shift** (change in margin since the
  previous election), with optional **Arrows** in Shift (left = toward Democrats,
  right = toward Republicans, length = size of shift, constant screen size when zoomed).
- National panel toggle: **Electoral College** (default) or **Popular vote**. In Electoral
  College + States + Margin, states are solid for a hold and striped for a flip; Maine and
  Nebraska show a badge with the second candidate's district electoral votes in split years.
- Side panel: results with candidate portraits (or initials), full names, winner checkmark
  and bold, margin history chart. Tooltips with share bars (Margin) or a compact shift line.
- Light/dark toggle (follows the system until clicked, then remembered in localStorage).
- Shareable links: `#year=2024&view=shift&map=counties&vote=popular&arrows=on&place=48201`.
  Defaults are left out of the link; old `#2024/margin/48201` links still work.

## Layout

```
pipeline/fetch_data.sh       raw sources -> data/raw/ (gitignored)
pipeline/build_geo.sh        county shapes -> web/data/geo.json (needs mapshaper)
pipeline/build_results.py    results + electoral votes -> web/data/results.json (stdlib only)
pipeline/build_photos.py     photos/ originals -> web/img/candidates/*.jpg + photos.json;
                             photos/parties/D.svg etc. -> web/img/parties/ + parties.json (Pillow)
pipeline/fetch_congress.sh   FEC, Clerk, MEDSL, Census, NC map -> data/raw/congress/
pipeline/fetch_portraits.py  official portraits of candidates who served -> photos/congress/
pipeline/build_house_geo.sh  district shapes -> web/data/house/<year>.json (mapshaper)
pipeline/build_senate.py     -> web/data/senate.json (statewide, counties, seat history)
pipeline/build_house.py      -> web/data/house.json (435 districts per year)
pipeline/congress.py, xlsx.py  shared readers: FEC spreadsheets, Clerk PDF text (pypdf)
web/index.html, app.js, style.css   the page; plain JS + D3 v7, no build step
web/vendor/                  D3, topojson-client, Public Sans (vendored, licenses in README there)
photos/                      original candidate photos (gitignored)
```

Run: `cd web && uv run python -m http.server 8000`. Python is managed with uv (pinned 3.14).
Safari caches aggressively: reload with Cmd+Option+R after changes.

## Data rules (important)

- Every number on the site must come from a source; never fill in results from memory.
  Overrides of source data are listed in `build_results.py` with two sources each.
- Sources: MIT Election Data and Science Lab county returns 2000–2016 (official);
  Tony McGovern's compiled county results 2020–2024; Census apportionment for electoral votes.
- `build_results.py` asserts that electoral votes match the official totals for every year
  (as won from state results, "election-night" style); keep those checks passing.
- Known fixes already applied: Florida 2000 uses the certified statewide total (county data
  predates certification); Alaska 2004/2020/2024 use certified statewide totals; Kansas City
  is folded into Jackson County MO; Connecticut 2024 is mapped by planning region.
- Alaska is one statewide area (it reports by house district). Connecticut 2024 cannot show a
  county-level shift. Both are documented in README "Known gaps".

## Conventions the owner asked for

- National level: the Electoral College winner is listed first everywhere; states and
  counties list the local winner first. Winners are bold with a checkmark.
- Side panel uses full public names without middle names (Donald Trump, Barack Obama;
  George W. Bush keeps the W.); everywhere else uses last names.
- Default toggle option sits on the left (States | Counties, Electoral College | Popular vote).
- Segmented controls share one style; the theme toggle is one button with a sliding thumb.
- Plain, short UI labels; longer explanations go in `title` hover text or the legend.
- Check changes in a browser at desktop and phone widths, in light and dark mode.

## Senate and House results 2020–2024

Built 31 October 2026 (office switch President | Senate | House on the page, `#race=senate`).
Official figures: FEC (2020, 2022) and Clerk of the House (2024); each build cross-checks
sources and asserts seats, Senate control and flips against documented totals.
Decided with the owner:

- Sources: MEDSL (Harvard Dataverse) statewide Senate 1976–2024, House by district
  1976–2024, Senate precinct returns 2020/2022/2024 summed to counties. Cross-check against
  the FEC's official "Federal Elections 2020/2022" compilations. MEDSL's simplified party
  labels have errors (Lummis WY 2020, Duckworth IL 2022, Van Hollen MD 2022 come out as
  "other"); work from the detailed party and verify.
- Margin only for Senate and House. No Shift view yet: the same Senate seat is up every
  6 years and House districts were redrawn for 2022 (and some for 2024). Revisit later by
  looking at what TV networks do.
- Runoffs and ranked-choice: the deciding round (Georgia runoffs, final RCV round) colors
  the map and decides the winner; the panel also shows the first round. Where the final
  round exists only statewide/district-wide, counties show the first round, labeled.
- Independents are colored by caucus: King and Sanders in Democratic blue (noted as
  independents who caucus with Democrats); Osborn and McMullin in purple (`--ind`, also used
  for other small parties). Greens are green and Libertarians gold, matching their icons.
- Members of Congress are matched to their Congress (bioguide) ID with the
  congress-legislators list (`congress.member()`): FEC ID first, checked against the name
  (the FEC reuses IDs). The ID gives the official portrait, one first name per person across
  years (the shorter form: "Nick", not "Nicholas") and the incumbent flag, taken from term
  dates because the FEC's mark is wrong in about 25 places (special-election winners, all of
  Arizona and Nebraska in 2024, open seats in Delaware and Oregon 2024).

## Next: live results, US midterms, 3 November 2026

Polls close from about 01:00 Warsaw time on 4 November. Races to follow live:

- Senate: Texas, Michigan, Georgia, North Carolina, South Carolina, Florida, Louisiana,
  Mississippi, Maine, Ohio
- Governor: Ohio, Texas

Plan agreed so far (not yet built):

1. Inspect each state's official results site to see whether it publishes a machine-readable
   file (JSON/CSV/XML). Maine may not publish live statewide results, and its Senate race uses
   ranked-choice voting.
2. Hybrid importer: automatic for states with a usable data file, quick manual entry for the
   rest. Writes `web/data/live.json`; the live page polls it.
3. Reuse the existing map, panel, colors and portraits for the live page.
4. Dry run with 2024 results replayed as if live, then a one-page election-night checklist.

Open question: local only, or a public link (GitHub Pages / Cloudflare Pages plus a way to
publish updates every few minutes)?

Next after election night: governor results 2020, 2022, 2024 (the owner wants them; decided
2 November 2026 to build the live page first). Even years only for now (2021/2023 odd-year
races later). Sources: MEDSL "State Precinct-Level Returns" per state (2022 and 2024 open,
CC0; 2020 behind the Dataverse guestbook, so the owner downloads it), each race checked against
its state's certified statewide result (no FEC-style national source for governors). The
per-state files total about 2 GB: ask before downloading.

Later: certified 2026 results, Senate/House before 2020, Alaska by house district, Poland
(PKW results down to gmina, live for the 2027 parliamentary election), more countries.
