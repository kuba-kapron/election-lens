# Election Lens

Election Lens is an open-source website for exploring election results at every level, from the whole country down to counties and municipalities, and for following new elections live.

## Status

Early development. Working now: a map of US presidential results by county, 2000–2024. Next milestone: live tracking of key races in the US midterm elections on 3 November 2026.

## Run it locally

The site is plain HTML, CSS and JavaScript with no build step. Python is managed with [uv](https://docs.astral.sh/uv/): install it once (`brew install uv`), and uv fetches the right Python version (pinned in `.python-version`) on first run. From the repository root:

```
cd web
uv run python -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly from disk does not work, because the browser blocks loading the data files.)

The page opens on the map colored by state, with the national result in electoral votes. Links can point at a year, view and place, for example `#year=2024&view=shift&map=counties&place=48201` (Harris County, Texas, shift since 2020). Other options: `map=counties` colors the map by county, and `vote=popular` shows the national popular vote.

## Rebuild the data

The processed data in `web/data/` is committed, so this is only needed when sources change. It requires uv, git and [mapshaper](https://github.com/mbloch/mapshaper) (`npm install -g mapshaper`).

```
./pipeline/fetch_data.sh          # downloads raw sources into data/raw/
./pipeline/build_geo.sh           # county shapes -> web/data/geo.json
uv run pipeline/build_results.py  # results -> web/data/results.json
```

Candidate portraits: put original photos in `photos/` (not committed) and run `uv run pipeline/build_photos.py`. See `web/img/candidates/README.md` for file names.

## Scope

**Now**
- United States: presidential results by county and state, 2000–2024, with a map of winner and margin, a map of shift since the previous election, the Electoral College result, and each place's results over time

**Next**
- Live results on election night, 3 November 2026, for:
  - Senate: Texas, Michigan, Georgia, North Carolina, South Carolina, Florida, Louisiana, Mississippi, Maine, Ohio
  - Governor: Ohio, Texas
- Certified 2026 US results and House/Senate history
- Poland: historical results down to gmina level, and live tracking for the 2027 parliamentary election

**Later**
- More countries, party pages, comparisons, left–right trends over time

## Data sources

- US Census Bureau apportionment counts: electoral votes per state
- [MIT Election Data and Science Lab](https://github.com/MEDSL/county-returns): official county presidential returns, 2000–2016
- [Tony McGovern, US County Level Election Results](https://github.com/tonmcg/US_County_Level_Election_Results_08-24) (MIT license): county presidential results, 2020–2024
- US Census Bureau cartographic boundary files: county shapes (2019, and 2023 for Connecticut)
- Planned: [OpenElections](https://github.com/openelections), state election offices, Państwowa Komisja Wyborcza (PKW)

Each dataset keeps its original license and terms; see the source for details.

Known gaps:
- Alaska reports by state house district, so it is shown as one statewide area. Alaska 2004 and 2020 are left out because the source totals are unreliable.
- Connecticut reported 2024 results by its new planning regions, so 2024 is mapped by region and earlier years by the old eight counties.
- Florida 2000: the county figures predate certification and put Gore 202 votes ahead; the statewide total uses the certified result (Bush by 537).
- Kansas City, Missouri, reports apart from its counties; for 2000–2016 it is counted in Jackson County.
- 2020 and 2024 figures are compiled counts, within about 0.1% of the certified national totals.

## License

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). If you run a modified version of Election Lens as a service, you must make your source code available under the same license. Third-party libraries and fonts in `web/vendor/` keep their own licenses (see `web/vendor/README.md`).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.
