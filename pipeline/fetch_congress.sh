#!/usr/bin/env bash
# Downloads the Senate and House sources into data/raw/congress/ (not committed to git).
#
#   FEC, "Federal Elections 2020" and "2022": certified results (spreadsheets)
#   FEC, 2024 congressional general election candidate list
#   Clerk of the House, "Statistics of the ... Election", 2020, 2022, 2024 (PDF)
#   MEDSL (Harvard Dataverse, CC0): Senate statewide 1976-2024; Senate precinct returns
#     2022 and 2024; House precinct returns 2024
#   Census cartographic boundary files: congressional districts, 116th, 118th, 119th Congress
#   NC General Assembly: 2019 congressional map (Session Law 2019-249), used in 2020
#   unitedstates/congress-legislators (public domain): every member of Congress with their
#     Congress (bioguide) ID, used to find official portraits (pipeline/fetch_portraits.py)
#
# One more file needs a manual download, because Dataverse asks for a short "guestbook"
# form (name, email, institution, position) first:
#   2020 Senate precinct returns, https://doi.org/10.7910/DVN/ER9XTV
#   file 2020-SENATE-precinct-general.csv -> save as data/raw/congress/senate-precinct-2020.csv
# Without it, 2020 Senate results are statewide only.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=data/raw/congress
mkdir -p "$RAW/shapes"

get() {  # get <url> <file>: download once
  [ -s "$2" ] || curl -sSfL --retry 3 -o "$2" "$1"
}
dataverse() {  # dataverse <file id> <file>
  get "https://dataverse.harvard.edu/api/access/datafile/$1?format=original" "$2"
}

get https://www.fec.gov/documents/4228/federalelections2020.xlsx "$RAW/fec2020.xlsx"
get https://www.fec.gov/documents/5676/federalelections2022.xlsx "$RAW/fec2022.xlsx"
get https://www.fec.gov/documents/5548/2024congressgecands.xlsx "$RAW/fec2024-congress-cands.xlsx"
for y in 2020 2022 2024; do
  get "https://clerk.house.gov/member_info/electionInfo/$y/statistics$y.pdf" "$RAW/clerk$y.pdf"
done

dataverse 13887039 "$RAW/senate-state-1976-2024.csv"
dataverse 13996913 "$RAW/senate-precinct-2022.csv"
dataverse 13731184 "$RAW/senate-precinct-2024.csv"
dataverse 13731101 "$RAW/house-precinct-2024.csv"

for f in GENZ2020/shp/cb_2020_us_cd116_500k GENZ2022/shp/cb_2022_us_cd118_500k GENZ2024/shp/cb_2024_us_cd119_500k; do
  name=$(basename "$f")
  get "https://www2.census.gov/geo/tiger/$f.zip" "$RAW/shapes/$name.zip"
  unzip -o -q "$RAW/shapes/$name.zip" -d "$RAW/shapes/$name"
done
get "https://services5.arcgis.com/gRcZqepTaRC6tVZL/arcgis/rest/services/NCGA_Congress_2019/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson" \
  "$RAW/shapes/nc_congress_2019.geojson"

for f in current historical; do
  get "https://unitedstates.github.io/congress-legislators/legislators-$f.json" "$RAW/legislators-$f.json"
done

[ -s "$RAW/senate-precinct-2020.csv" ] || echo "Note: $RAW/senate-precinct-2020.csv is missing (manual download, see above)."
echo "Raw congressional data ready in $RAW"
