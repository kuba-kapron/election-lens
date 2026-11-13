# Election Lens: notes for Claude Code

Open-source (AGPL-3.0) website for exploring election results at every level, from the whole
country down to counties, and for following elections live. A hobby and portfolio project by
the repository owner. Started in a claude.ai conversation on October 29–31, 2026; this file
carries over what was decided there.

## What exists now

US presidential results 2000–2024 on one static page (`web/`):

- Map colored by state (default) or county; click a state to zoom in and see its counties,
  click a county to zoom to it. Typeahead state finder (combobox).
- Map control **Winner | Margin | Shift** (president; Senate, House and governors have
  Winner | Margin): Winner = states (or seats) solid for a hold, striped for a flip, and
  tonight called races solid, leads in one light shade; Margin = shaded by margin; Shift =
  change in margin since the previous election, with optional **Arrows** (left = toward
  Democrats, right = toward Republicans, length = size of shift, constant screen size when
  zoomed). Winner colors states only (the county map shows the margin). Maine and Nebraska
  show a badge with the second candidate's district electoral votes in split years.
- Country panels: electoral votes (president) or one totals bar per office (Senate, House,
  governors; also a state's House delegation): logos and big counts of certain seats, ▲ gained
  ▼ lost (green/red), Democrats from the left, Republicans from the right, light = leading,
  a mark at control (or half); then a "Popular vote" section with the same layout.
- Side panel: results with candidate portraits (or initials), full names, winner checkmark
  and bold, margin history chart. Tooltips with share bars (Margin) or a compact shift line.
- Light/dark toggle (follows the system until clicked, then remembered in localStorage).
- Navigation is race first, then year (decided November 10, 2026): the races (President |
  Senate | House | Governor) are the site navigation in the top bar (own row on phones); the
  year ribbon lists only the years the race in view has, in one row that scrolls sideways
  (‹ ›, arrow keys), each year with a thin bar in the winner's color (Electoral College
  winner; Senate or House majority; light for tonight) and the result on hover. Picking a race
  the year in view lacks opens its nearest earlier year (else its latest). Two elections of one
  kind in a year will be labeled "2019 Apr".
- Country selector next to the wordmark: flag (SVG in a 24×16 box at its own proportions, the
  outline drawn over its edge; each flag SVG needs width and height) and name; one country for
  now. US flag drawn to the official proportions, colors from the DDD-F-416E version. The flag
  also sits in every results card's top-right corner and starts the breadcrumb.
- City names on the map (added November 3, 2026): the largest metros for the whole country,
  more as you zoom in; the selected state's cities first, neighbors in grey; a name goes right
  of its dot, else left, below or above, never over another name, and avoids covering other
  cities' dots; same screen size at every zoom and screen width. Alaska and Hawaii cities show
  only for the country or their own state (their insets sit near other states). Three sizes by
  metro population (3M+, 500k+, smaller); Washington with a star, state capitals with a ring (a
  selected state's capital always gets a name when there is room).
- Addresses (decided November 13, 2026): language first, then the country's English name:
  `/en/usa/`, later `/pl/usa/`, `/en/poland/`, `/pl/poland/`. One index.html serves them all
  (web/_redirects on Cloudflare, tools/serve.py locally); web/js/site.js reads the address, and
  any other one (`/`, old links) is shown as `/en/usa/` with what follows it kept. File paths in
  the page start at the root (`/data/...`), not relative: a `<base>` tag would break the map's
  `url(#flip-dem)` stripes in some browsers.
- Languages (decided November 13, 2026): every text the page shares goes through t() in
  web/js/texts.js (index.html: data-t), with number formats; each country's view writes its labels
  through t() from the start. The US views' texts stay in English in the code until the US pages
  are translated. Poland: English first (/en/poland/), then Polish (/pl/poland/). In English,
  voivodeships and cities that have an English name are translated (Lower Silesian, Warsaw);
  other place names stay Polish.
- Shareable links: `#year=2024&view=shift&map=counties&color=margin&arrows=on&place=48201`.
  Defaults are left out of the link; old `#2024/margin/48201` and `vote=popular` (opens
  Margin) links still work.
- Panel headlines: the office in small capitals above the place ("U.S. SENATE" over
  "Georgia", "GOVERNOR" over "Fulton County, GA"), year and update time in the grey line.
- Under the map and panel, two cards (decided November 9, 2026): **Races** lists every race at
  the map's level (country: states, races or all 435 districts; a state: its counties or
  districts; at the lowest level, the level above with this place marked), sortable
  A–Z | Closest | D → R (each reverses on a second click), first 40 rows with Show all and a
  filter on longer lists. **History** shows the same race at the same level in every election:
  one shared bar chart and rows (tonight included as counted so far; district numbers on
  another map faded). Country charts switch Seats | Popular vote on the card, starting from the
  map's Winner | Margin.

## Layout

```
pipeline/                        run from the repository root: `uv run -m pipeline.<path>.<script>`
                                 for Python (`pipeline.us.live.manual`), `./pipeline/...sh` for shell
  common/fetch.py                polite fetching: every request goes through it
  common/xlsx.py                 Excel reader (stdlib only)
  common/trail.py                race charts through the night (no country rules)
  common/fetch_commons_photos.py download Commons photos the owner approved, with credits
  us/                            everything specific to the United States (pl/ for Poland later)
  us/states.py                   state codes, county code fixes (norm_fips)
  us/president/fetch_data.sh     raw sources -> data/raw/ (gitignored)
  us/president/build_geo.sh      county shapes -> web/data/us/geo.json (needs mapshaper)
  us/president/build_results.py  results + electoral votes -> web/data/us/results.json (stdlib only)
  us/president/build_places.sh   Natural Earth populated places -> web/data/us/places.json (city
                                 labels: US cities projected like the map, largest first; mapshaper)
  us/congress/fetch_congress.sh  FEC, Clerk, MEDSL, Census, NC map -> data/raw/congress/
  us/congress/sources.py         shared readers: FEC spreadsheets, Clerk PDF text (pypdf), member IDs
  us/congress/build_house_geo.sh district shapes -> web/data/us/house/plans-<year>.json + plans.json:
                                 each state's map stored once (the year it first appeared), the
                                 index says which file each state uses per election (mapshaper;
                                 changed states measured by us/congress/house_plans.py)
  us/congress/build_senate.py    -> web/data/us/senate.json (statewide, counties, seat history)
  us/congress/build_house.py     -> web/data/us/house.json (435 districts per year)
  us/governor/fetch_governor.sh  MEDSL precinct returns 2018, 2022, 2024 -> data/raw/governor/
  us/governor/build_governor.py  -> web/data/us/governor.json (statewide governor results per year)
  us/photos/build_photos.py      photos/ originals -> web/img/candidates/*.jpg + photos.json;
                                 photos/parties/D.svg etc. -> web/img/parties/ + parties.json (Pillow)
  us/photos/fetch_portraits.py   official portraits of candidates who served -> photos/congress/
  us/photos/find_commons_photos.py  Wikimedia Commons photos for US candidates: review sheet (see Live)
  us/live/                       election night, see "Live results" below
  pl/                            Poland (started November 13, 2026)
  pl/fetch_prg.sh <year>         borders as of that year (Państwowy Rejestr Granic, GUGiK, free for
                                 any use; ~380 MB) -> data/raw/pl/prg/<year>/
  pl/build_geo.sh <year>         -> web/data/pl/geo-<year>.json: gminas (Warsaw as its 18 districts,
                                 as PKW reports it), powiats, voivodeships; ids = PKW's TERYT codes
  pl/president/fetch_data.sh     PKW's 2025 files (stations, both rounds) -> data/raw/pl/president/2025/
  pl/president/build_results.py  -> web/data/pl/president.json: both rounds by gmina, powiat,
                                 voivodeship, country; checked against PKW's gmina table and totals
  publish.sh                     upload web/ to Cloudflare Pages (wrangler in package.json; --loop)
web/index.html, style.css    the page; plain JS + D3 v7, no build step
web/js/                      the page's code as ES modules (split from one app.js on November 12,
                             2026). The files directly in web/js/ are shared by every country and
                             never import a country's folder (November 13, 2026): main (loads the
                             country, then draws), site (language and country from the address),
                             country (the country description's contract: map, levels, years,
                             finder, links; and view()), texts (t("key")), state, format,
                             components (candidate rows, bars, portraits, list rows), map (SVG,
                             zoom, hover, clicks), tooltip, legend, nav (year ribbon), panel,
                             cards, finder, actions (render, select), theme
web/js/us/                   the United States: country.js (its description), data (loading),
                             rules (election rules), colors (party colors), components (party
                             tags, totals bar, live lines), map (counties, districts, states,
                             stripes, arrows), actions (map tools, years and races), hash
                             (links), panel, cards, legend, tooltip, live, trail, places, views/
web/js/us/views/             one view per kind of race (president; statewide: Senate and governors;
                             House), each with the same parts: map colors, click target, hover box,
                             legend, panel, Races and History cards, year-ribbon result, headline
                             (views/index.js lists them). The page asks view(); a new office adds
                             a view, a new country its own folder (web/js/pl/ next)
tools/serve.py                   the page on your computer, like Cloudflare serves it (port 8000)
tools/check/check.sh             does the working tree draw what the last commit draws? 52 views
                                 and click sequences (check.html) recorded in headless Chromium,
                                 compared step by step; output in data/check/ (gitignored). Run
                                 after changes that should not change the US pages; ~4 minutes
web/vendor/                      D3, topojson-client, Public Sans (vendored, licenses in README there)
photos/                          original candidate photos (gitignored)
```

Run: `uv run python tools/serve.py` (http://localhost:8000/en/usa/; serves web/ like Cloudflare, see
Addresses below, and tells browsers to re-check files, so a normal reload shows changes).
Python is managed with uv (pinned 3.14).

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
- Plain, short UI labels; longer explanations go in `title` hover text or the legend. No
  summary sentences under totals or results: facts go in grey lines ("Called by AP ·
  259,504 votes counted (92%)"); caveats as small notes or an asterisk under the legend.
- Seats changing party: "Pickup" tonight, "Flipped" for past years. Checkmarks only on
  tonight's called races (past winners are obvious). One shared component per kind of
  display (the totals bar, the race grey line), so views stay alike across years and levels.
- Dates in American style everywhere, site and notes: "November 3, 2026", no "3rd"
  (decided November 6, 2026; other languages may come later, with their own formats).
  Possessives AP style: a name ending in "s" takes only the apostrophe ("Texas' 13th
  district"), built with `possessive()` in web/js/format.js.
- Check changes in a browser at desktop and phone widths, in light and dark mode.

## Senate and House results 2020–2024

Built October 31, 2026 (office switch President | Senate | House on the page, `#race=senate`).
Official figures: FEC (2020, 2022) and Clerk of the House (2024); each build cross-checks
sources and asserts seats, Senate control and flips against documented totals.
Decided with the owner:

- Sources: MEDSL (Harvard Dataverse) statewide Senate 1976–2024, House by district
  1976–2024, Senate precinct returns 2020/2022/2024 summed to counties. Cross-check against
  the FEC's official "Federal Elections 2020/2022" compilations. MEDSL's simplified party
  labels have errors (Lummis WY 2020, Duckworth IL 2022, Van Hollen MD 2022 come out as
  "other"); work from the detailed party and verify.
- No Shift view for Senate and House yet: the same Senate seat is up every
  6 years and House districts were redrawn for 2022 (and some for 2024). Revisit later by
  looking at what TV networks do.
- Runoffs and ranked-choice (decided November 11, 2026): a map-wide **November | Final**
  control in the map tools (only in years where some race had more rounds). Final (default):
  the deciding round colors the map and decides the winner. November: every race at its
  November count; races that went on show who advanced (→, bold, Runoff grey on the Winner
  map, or the party when all who advanced share it). Where the final round exists only
  statewide/district-wide, counties show the first round, labeled. Countries with a second
  round everywhere (Poland's presidential, France's parliamentary) will use the same control
  ("Round 1 | Round 2").
- Independents are colored by caucus: King and Sanders in Democratic blue (noted as
  independents who caucus with Democrats); Osborn and McMullin in purple (`--ind`, also used
  for other small parties). Greens are green and Libertarians gold, matching their icons.
- Members of Congress are matched to their Congress (bioguide) ID with the
  congress-legislators list (`congress.member()`): FEC ID first, checked against the name
  (the FEC reuses IDs). The ID gives the official portrait, one first name per person across
  years (the shorter form: "Nick", not "Nicholas") and the incumbent flag, taken from term
  dates because the FEC's mark is wrong in about 25 places (special-election winners, all of
  Arizona and Nebraska in 2024, open seats in Delaware and Oregon 2024).

## Live results, US midterms, November 3, 2026 (built November 3)

Polls close from about 00:00 Warsaw time on November 4. All 35 Senate races (Florida and Ohio
are specials) and the governor races in Ohio and Texas. The first twelve (Senate in TX, MI, GA,
NC, SC, FL, LA, MS, ME, OH; governor in OH, TX) were the owner's list; the other 25 Senate
races were added the same day, from civicAPI only. Poll closing times: CBS News. Page: year 2026, Senate or Governor
(`#race=senate&year=2026`; old `#race=live` links still open it).

```
pipeline/us/live/races.py    the 37 races: candidates, poll closing times, sources in order
pipeline/us/live/sources.py  readers: NC (precinct zip), Clarity (SC, IA: JSON + county XML),
                             FL (county extract), TX (statewide HTML), Enhanced Voting (GA, VA,
                             RI: Excel/CSV report), DE (JSON), SD (CSV), OR (page), civicAPI
pipeline/common/fetch.py     polite fetching: every request goes through it
pipeline/us/live/importer.py importer loop -> web/data/us/live/{senate,governor,house}.json (not
                             committed); --replay to test
pipeline/us/live/manual.py   numbers or race calls typed in by hand -> data/live/ (not committed)
LIVE-CHECKLIST.md            what to run and watch on election night
```

Rules agreed with the owner:

- Polite fetching: at most one request per address every 3 minutes, honest User-Agent
  ("ElectionLens", no personal details), robots.txt followed, "changed since" requests,
  back off and stop after refusals, never work around a block.
- Official state results first; civicAPI (free, attribution required, unofficial: aggregates
  state/county sites and sometimes local media) as fallback, always labeled; its test data is
  never shown as real. Manual entries override both and name their source.
- No race calls of our own: a race is marked won only when entered by hand with who called it.
- Governor races (all 36, added November 3): official readers where the state has one for the
  governor contest (SC, IA, GA, FL, OR, SD, RI, TX, NY, MD, AZ), else civicAPI. No governor
  history yet, so no "last time" comparison.
- Official live sources (surveyed November 3, each tested on an earlier election where the
  site keeps one): NC, SC, FL, TX, GA, VA, IA, DE, SD, OR, RI; for governor also NY (plain
  results page), MD (results page), AZ (Enhanced Voting, report not yet published).
  Also checked: CA (refuses scripts, 403), PA (certificate fails verification; not bypassed),
  NV (results site needs browser cookies), VT (app, data address not found), HI (media.txt
  file exists for the primary; the general's file was not published yet), WI and CT (no
  statewide election-night results). House-only states (IN, MO, ND, UT, WA): see House below. Refused or blocked scripts
  (403, captcha or JavaScript check): OH, MI, KY, OK, NM, MT, ID, AR, MN (captcha), and
  Clarity's shared domain (results.enr.clarityelections.com, used by CO, WV, AL). Louisiana's
  robots.txt forbids its results data. No statewide live results: MS, ME, NH, MA, NJ, IL, AK
  (PDF summary only), WY, KS. Nebraska's results host does not resolve from here. All of
  those use civicAPI. The footer names the official sources in use in the office being viewed.
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
  (Vice President Vance breaks ties). One rule for every year (decided November 12, 2026,
  `tieBreaker()` in web/js/us/rules.js): a 50–50 Senate goes to the Vice President's party, taken from the
  presidential results: the sitting VP in a midterm, the incoming one in a presidential year
  (undecided at 50–50 until that race is decided). The panel's majority mark counts certain
  seats only; the ribbon and the History card count leads too ("so far").
- House (added November 3): all 435 races from one civicAPI request per round (its race search,
  type "House of Representatives"), then official results replace them district by district
  for 16 states (pipeline/us/live/house.py: NC, SC, IA, FL, TX, GA, VA, OR, NY, DE, SD, MD, UT
  from the files already read for Senate/governor; WA, IN, ND for the House only; 182
  districts). Utah's and Washington's Enhanced Voting reports are named "All Results Excel" /
  sheet "Summary Results" and list over/under votes as choices (skipped); Washington moved to
  Enhanced Voting (results.votewa.gov, election "20261103"), no earlier general there to test.
  Indiana: the results app's JSON (data/settings.json gives the version letter, then
  OffCatC_1005_<letter>.json), no precinct counts. North Dakota: statewide results page, read
  only when its hidden election date is 11/3/2026 (it showed 2024 on November 3; tested on that
  page, matches the certified 2024 result exactly). Missouri refuses scripts. Tested against certified 2024 House
  results where the site keeps 2024: NC, SC, IA, FL, GA, VA, every contested district within
  0.5%. Florida's file is in the Windows character set (cp1252). Not yet: AZ, RI (report
  names unknown until published). Written to web/data/us/live/house.json,
  keyed "SS-DD" like house.json,
  drawn on the 2026 district map. Shown as leading only: civicAPI's calls are not used and 435
  hand calls are not realistic. Previous result only where the state kept its 2024 map.
  Louisiana's House vote on November 3 is an all-candidate primary (general December 12).
- Record of the night (not committed): each changed source file, gzipped, at most one version
  per source every 10 minutes and 1 GB in all (data/raw/live/archive/<key>/<UTC time>.gz, with
  url.txt), so readers can be fixed and the night re-read without asking the sites again; and
  each office's file after every round that changed more than fetch times
  (data/live/snapshots/<office>/, 20-80 KB each). Not in --replay. Saving never stops the importer.
- Live files, one per office (decided November 3, so a viewer re-reads only the office in view,
  every 30 seconds): web/data/us/live/senate.json, governor.json, house.json, each
  {"office", "year", "updated", "races": {id: race}, "night"}; ids "GA-sen", "TX-gov", "13-05".
  The Senate file also has "not_up" (the balance); "night" (any votes yet, Senate calls) is
  repeated in every file for the year ribbon.
- Race charts ("Through the night", added November 3): web/data/us/live/trail-<office>.json, built by
  pipeline/common/trail.py from the snapshots when the importer starts (a restart loses nothing)
  and extended every round. Per race: candidates in first-seen order, sources, and points
  [unix time, % counted, total, source index, votes...], added only when the numbers change and
  once there are votes. Votes, not margins; numbers as reported. The page loads a chart file only
  when a race panel is open, and again only when the office file's "trail_updated" changes. Step
  line of the leader's lead over the runner-up, scaled to the count from 5% of the latest total
  (earlier lopsided counts are clipped), dashed line at a change of source, hover box with the
  numbers and time. X axis: votes counted, not the clock (decided November 6, 2026): US sources'
  "% counted" differ in meaning (precincts, polling places, civicAPI's expected vote), can go
  backwards and sit at 100% while mail is counted. For a country with one national source the
  share counted can be the axis (TRAIL_X = "pct" in web/js/us/trail.js). --replay charts its test data, marked; a real run rebuilds the files from snapshots.
- Public copy: Cloudflare Pages (project election-lens), `pipeline/publish.sh --loop` uploads
  web/ every 150 s (about 200 of the free plan's 500 uploads a month per night); the importer
  runs separately. Page changes reach it only through that upload.
- Added on election night (November 4): a source that had votes and then fails keeps its last
  reading (Virginia's report list is briefly empty while it publishes); timeouts and 5xx are
  "slow" (cached copy kept, site paused 3 min), not refusals. civicAPI was overloaded: one race
  took ~36 s and the all-states House list returned 502s, so House lists are asked one state at
  a time (3 per round, polls-closed and longest-waiting first; official-source states skipped
  except Florida). House districts can be called by hand (`call KY-3 Name --by AP`), and a
  called race with no numbers still shows its winner. Clarity's share counted is summed from
  county precincts (its summary counts fully reported counties). A source may drop half of a
  double surname (NY's "Joel Azumah" for Anabilah-Azumah). Florida moved election night to
  floridaelectionwatch.gov behind a Cloudflare bot check: not used (civicAPI instead).
- Pickups: a called race won by the other party than last time (Senate seat history; governors
  from web/data/us/governor.json, 2022, or 2024 for NH and VT). Seats with no earlier result are
  left out, noted under the legend.
- Runoff calls (added November 10, 2026): `call XX-N Name1 Name2 --runoff --by AP` records who
  advanced (Louisiana's House primary). Between parties: Runoff grey, undecided. Within one
  party: won for that party (a pickup if the seat changes party). Shown with → and bold.
- House seats, past years and tonight (decided November 7, 2026, after Wikipedia's approach):
  previous holder = the one incumbent running (the party of their last win, e.g. Kiley ran
  without a party in 2026), else the last winner of the same district number (approximate
  on a redrawn map), else a new seat ("new" in lists, "New seat" in the panel). The legend
  note names the redrawn states. House cards show one net number per party: seats won minus
  seats won last time once every race in view is decided; while counting, called races against
  their previous holders (the map's pickups). Senate and governors keep ▲ gained ▼ lost.

Governor history (started November 4, 2026 for tonight's pickups): MEDSL official precinct
returns on GitHub, 2018 (all states' state offices, one zip), 2022 and 2024 (per state, only the
states with a governor race), summed to the state by build_governor.py. Fusion lines summed per
candidate; New Mexico 2022 has no party labels (taken from the same people's other MEDSL
races). Gaps: Tennessee 2022 has no governor rows; 2020 is behind the Dataverse guestbook (the
owner downloads it). Still to do: check every race against its state's certified result (no
FEC-style national source; New York 2018 is about 350,000 short for Cuomo), then governor
pages for past years. Even years only for now (2021/2023 odd-year races later).

pipeline/ was sorted into folders on November 11, 2026 (agreed November 3, postponed past election
night): common/ for what any country uses, us/ by office; every build's output was checked
byte-for-byte unchanged. Poland goes in pipeline/pl/. web/data/ has one folder per country
since November 13, 2026 (web/data/us/, later web/data/pl/; the page picks it from the address, see
COUNTRIES in web/js/site.js); web/img/ is still shared.

Poland, 2025 presidential election (data built November 13, 2026; page view next):
- Results: PKW's polling-station counts (32,143 per round) summed to gmina, powiat and
  voivodeship; national totals are PKW's official candidate totals. Three military stations abroad
  (Irbil, Baghdad, At Tiri) have no figures in the station files: their votes are in the national
  totals only (the build checks the gap stays tiny). Abroad and ships: national total only.
- Borders: PRG's 2025 archive (the state at the end of 2025: legal borders as of January 1, 2025,
  with survey corrections; the six towns of 2026 are not in it). Warsaw from PRG's registry units.
- Obwód (polling station) map: no official borders exist; Kraków publishes its own. Maybe later,
  drawn from PKW's border descriptions and PRG address points (a separate project). No dots map.

Later: certified 2026 results, Senate/House before 2020, Alaska by house district, Poland
(the page view; live for the 2027 parliamentary election), more countries.
