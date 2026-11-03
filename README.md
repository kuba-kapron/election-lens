# Election Lens

Election Lens is an open-source website for exploring election results at every level, from the whole country down to counties and municipalities, and for following new elections live.

## Status

Early development. Working now: US presidential results by county, 2000–2024, and Senate (by state and county) and House (by district) results, 2020–2024. Next milestone: live tracking of key races in the US midterm elections on 3 November 2026.

## Run it locally

The site is plain HTML, CSS and JavaScript with no build step. Python is managed with [uv](https://docs.astral.sh/uv/): install it once (`brew install uv`), and uv fetches the right Python version (pinned in `.python-version`) on first run. From the repository root:

```
cd web
uv run python -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly from disk does not work, because the browser blocks loading the data files.)

The page opens on the map colored by state, with the national result in electoral votes. Links can point at a year, view and place, for example `#year=2024&view=shift&map=counties&place=48201` (Harris County, Texas, shift since 2020). Other options: `map=counties` colors the map by county, `vote=popular` shows the national popular vote, and `arrows=on` draws shift arrows in the Shift view. `race=senate` or `race=house` switches office (`#race=house&year=2024&place=06-12` is California's 12th district; `seat=special` picks a state's special Senate election).

## Rebuild the data

The processed data in `web/data/` is committed, so this is only needed when sources change. It requires uv, git and [mapshaper](https://github.com/mbloch/mapshaper) (`npm install -g mapshaper`).

```
./pipeline/fetch_data.sh          # downloads raw sources into data/raw/
./pipeline/build_geo.sh           # county shapes -> web/data/geo.json
uv run pipeline/build_results.py  # results -> web/data/results.json
```

Senate and House (needs mapshaper too; one file needs a manual download, see the script):

```
./pipeline/fetch_congress.sh        # FEC, Clerk of the House, MEDSL, Census -> data/raw/congress/
./pipeline/build_house_geo.sh       # district shapes -> web/data/house/plans-<year>.json + plans.json
uv run pipeline/build_senate.py     # -> web/data/senate.json
uv run pipeline/build_house.py      # -> web/data/house.json
uv run pipeline/fetch_portraits.py  # official portraits of members of Congress -> photos/congress/
uv run pipeline/build_photos.py     # shrinks them -> web/img/congress/
```

Candidates who have served in Congress are matched to their Congress (bioguide) ID using the
public-domain [congress-legislators](https://github.com/unitedstates/congress-legislators)
list; that gives their official portrait (public domain, from
[unitedstates/images](https://github.com/unitedstates/images)), one first name across years
("Nick LaLota") and whether they were the incumbent (sitting on election day). Other
candidates show their initials.

Both builds compare every race's leading candidates across sources and stop on an unexplained difference above 0.1%. Known differences and corrections are listed, with their sources, at the top of each script.

Candidate portraits: put original photos in `photos/` (not committed) and run `uv run pipeline/build_photos.py`. See `web/img/candidates/README.md` for file names.

Party icons: put them in `photos/parties/` named by party code (`D.svg`, `R.svg`; also `L`, `G`, `I`; SVG preferred) and run the same script. A party without an icon shows its letter, as in "(D)".

## Scope

**Now**
- United States: presidential results by county and state, 2000–2024, with a map of winner and margin, a map of shift since the previous election, the Electoral College result, and each place's results over time
- United States: Senate results by state and county and House results by district, 2020–2024, with seats won, Senate seats that changed party, runoffs and ranked-choice rounds

**Next**
- Live results on election night, 3 November 2026, for:
  - Senate: Texas, Michigan, Georgia, North Carolina, South Carolina, Florida, Louisiana, Mississippi, Maine, Ohio
  - Governor: Ohio, Texas
- Certified 2026 US results; a Shift view for Senate and House; House/Senate before 2020
- Poland: historical results down to gmina level, and live tracking for the 2027 parliamentary election

**Later**
- More countries, party pages, comparisons, left–right trends over time

## Data sources

- US Census Bureau apportionment counts: electoral votes per state
- [MIT Election Data and Science Lab](https://github.com/MEDSL/county-returns): official county presidential returns, 2000–2016
- [Tony McGovern, US County Level Election Results](https://github.com/tonmcg/US_County_Level_Election_Results_08-24) (MIT license): county presidential results, 2020–2024
- US Census Bureau cartographic boundary files: county shapes (2019, and 2023 for Connecticut); congressional districts (116th, 118th, 119th Congress)
- [Federal Election Commission, Federal Elections 2020 and 2022](https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/): certified Senate and House results
- [Clerk of the House, election statistics](https://clerk.house.gov/Members/ElectionInformation) 2020–2024: certified Senate and House results (the source for 2024, a check for 2020 and 2022)
- MIT Election Data and Science Lab (Harvard Dataverse, CC0): Senate statewide 1976–2024 (a check, and earlier winners for seat history); Senate precinct returns summed to counties; House precinct returns 2024 (a check)
- North Carolina General Assembly: 2019 congressional map, used in 2020
- Planned: [OpenElections](https://github.com/openelections), state election offices, Państwowa Komisja Wyborcza (PKW)

Each dataset keeps its original license and terms; see the source for details.

Known gaps:
- Alaska reports by state house district, so it is shown as one statewide area. For 2004, 2020 and 2024 the district data is unreliable, so Alaska uses its certified statewide totals (US House Clerk, National Archives certificates of ascertainment).
- Connecticut reported 2024 results by its new planning regions, so 2024 is mapped by region and earlier years by the old eight counties.
- Florida 2000: the county figures predate certification and put Gore 202 votes ahead; the statewide total uses the certified result (Bush by 537).
- Kansas City, Missouri, reports apart from its counties; for 2000–2016 it is counted in Jackson County.
- 2020 and 2024 figures are compiled counts, within about 0.1% of the certified national totals.
- Senate counties: 2020 needs a file behind a Dataverse form (see `fetch_congress.sh`); without it 2020 is statewide only. No county figures for California 2022 (missing from the source), Indiana 2022 (only 36 of 92 counties published precinct results), and Indiana and New Jersey 2024 (the precinct source does not add up to the official totals). Connecticut is mapped by its old counties for the Senate.
- Ranked-choice 2024 races (Alaska at large, Maine's 2nd district) show only the round confirmed by the official source; the note in the panel says which.
- Senate and House have no Shift view yet: Senate seats come up every six years and House districts were redrawn for 2022.

## License

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). If you run a modified version of Election Lens as a service, you must make your source code available under the same license. Third-party libraries and fonts in `web/vendor/` keep their own licenses (see `web/vendor/README.md`).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.
