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
- Navigation is year first, then race: one ribbon with every year we have (2000–2026); the
  races (President | Senate | House | Governor) are the site navigation in the top bar next
  to the wordmark (own row on phones); races without data that year are greyed out
  with the reason on hover. Switching years keeps the race when that year has it, else
  President, else Senate (decided with the owner on 3 November 2026).
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
pipeline/build_house_geo.sh  district shapes -> web/data/house/plans-<year>.json + plans.json:
                             each state's map stored once (the year it first appeared), the
                             index says which file each state uses per election (mapshaper;
                             changed states measured by pipeline/house_plans.py)
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

## Live results, US midterms, 3 November 2026 (built 3 November)

Polls close from about 00:00 Warsaw time on 4 November. All 35 Senate races (Florida and Ohio
are specials) and the governor races in Ohio and Texas. The first twelve (Senate in TX, MI, GA,
NC, SC, FL, LA, MS, ME, OH; governor in OH, TX) were the owner's list; the other 25 Senate
races were added the same day, from civicAPI only. Poll closing times: CBS News. Page: year 2026, Senate or Governor
(`#race=senate&year=2026`; old `#race=live` links still open it).

```
pipeline/live_races.py   the 37 races: candidates, poll closing times, sources in order
pipeline/live_sources.py readers: NC (precinct zip), Clarity (SC, IA: JSON + county XML),
                         FL (county extract), TX (statewide HTML), Enhanced Voting (GA, VA,
                         RI: Excel/CSV report), DE (JSON), SD (CSV), OR (page), civicAPI
pipeline/live_fetch.py   polite fetching: every request goes through it
pipeline/live.py         importer loop -> web/data/live.json (not committed); --replay to test
pipeline/live_manual.py  numbers or race calls typed in by hand -> data/live/ (not committed)
LIVE-CHECKLIST.md        what to run and watch on election night
```

Rules agreed with the owner:

- Polite fetching: at most one request per address every 3 minutes, honest User-Agent
  ("ElectionLens", no personal details), robots.txt followed, "changed since" requests,
  back off and stop after refusals, never work around a block.
- Official state results first; civicAPI (free, attribution required, unofficial: aggregates
  state/county sites and sometimes local media) as fallback, always labeled; its test data is
  never shown as real. Manual entries override both and name their source.
- No race calls of our own: a race is marked won only when entered by hand with who called it.
- Governor races (all 36, added 3 November): official readers where the state has one for the
  governor contest (SC, IA, GA, FL, OR, SD, RI, TX, NY, MD, AZ), else civicAPI. No governor
  history yet, so no "last time" comparison.
- Official live sources (surveyed 3 November, each tested on an earlier election where the
  site keeps one): NC, SC, FL, TX, GA, VA, IA, DE, SD, OR, RI; for governor also NY (plain
  results page), MD (results page), AZ (Enhanced Voting, report not yet published).
  Also checked: CA (refuses scripts, 403), PA (certificate fails verification; not bypassed),
  NV (results site needs browser cookies), VT (app, data address not found), HI (media.txt
  file exists for the primary; the general's file was not published yet), WI and CT (no
  statewide election-night results). Not checked yet (House only): IN, MO, ND, UT, WA. Refused or blocked scripts
  (403, captcha or JavaScript check): OH, MI, KY, OK, NM, MT, ID, AR, MN (captcha), and
  Clarity's shared domain (results.enr.clarityelections.com, used by CO, WV, AL). Louisiana's
  robots.txt forbids its results data. No statewide live results: MS, ME, NH, MA, NJ, IL, AK
  (PDF summary only), WY, KS. Nebraska's results host does not resolve from here. All of
  those use civicAPI. The footer names the official sources in use from live.json.
- Candidate photos for people without an official congressional portrait come from Wikimedia
  Commons: `find_commons_photos.py` (Wikipedia article infobox -> Commons file page, free
  licenses only: public domain, CC0, CC BY, CC BY-SA) writes a review sheet; only photos the
  owner approves are fetched (`fetch_commons_photos.py`) and credited in the footer (author,
  license with link). Wikimedia's APIs (/w/, /api/) are closed to scripts by robots.txt and
  its search and image servers rate-limit scripts: go slowly (one request every few seconds).
- Senate balance on the 2026 Senate panel: the 65 seats not up (class 1, filled in 2024; class 3,
  filled in 2022, minus the FL/OH specials) are counted by who holds them now, from the
  legislator list (the source for current membership). Each seat is matched to its race in our
  certified results; where the holder differs from the race's winner (appointment, party
  switch, vacancy, or an error in either source) the seat gets a note for a person to check,
  and nothing stops.
  Plus seats called by hand (solid) and leads (light). Control: 51, or 50 for Republicans
  (Vice President Vance breaks ties).
- House (added 3 November): all 435 races from one civicAPI request per round (its race search,
  type "House of Representatives"), written to live.json "house" keyed "SS-DD" like house.json,
  drawn on the 2026 district map. Shown as leading only: civicAPI's calls are not used and 435
  hand calls are not realistic. Previous result only where the state kept its 2024 map.
  Louisiana's House vote on 3 November is an all-candidate primary (general 12 December).
- Local first; going public later only needs an upload of live.json (ordinary hosting with
  SFTP/rsync and no caching of live.json, or the page's ?t= query).

Next after election night: governor results 2020, 2022, 2024 (the owner wants them; decided
2 November 2026 to build the live page first). Even years only for now (2021/2023 odd-year
races later). Sources: MEDSL "State Precinct-Level Returns" per state (2022 and 2024 open,
CC0; 2020 behind the Dataverse guestbook, so the owner downloads it), each race checked against
its state's certified statewide result (no FEC-style national source for governors). The
per-state files total about 2 GB: ask before downloading.

Also after election night: tidy pipeline/ into topic folders (common/ with the polite fetcher,
xlsx and state codes; president/, congress/, photos/, live/), run as `uv run -m pipeline.<topic>.<script>`;
check that every build's output is byte-for-byte unchanged. Agreed 3 November 2026, postponed so
tonight's tested live scripts and checklist stay as they are.

Later: certified 2026 results, Senate/House before 2020, Alaska by house district, Poland
(PKW results down to gmina, live for the 2027 parliamentary election), more countries.
