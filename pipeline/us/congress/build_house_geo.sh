#!/usr/bin/env bash
# Builds the congressional district maps for every House election, storing each state's map
# once: web/data/house/plans-<year>.json holds only the states whose districts were new that
# year, and web/data/house/plans.json says which year's file each state uses for each election
# (2026 Wyoming -> 2020: one at-large district all along). Layer "districts", ids "SS-DD"
# (state FIPS and district number, "00" at large).
#   2020  116th Congress districts (Census), with North Carolina's 2019 remedial map
#          (Session Law 2019-249), which was first used in the 2020 election
#   2022  118th Congress districts (Census)
#   2024  119th Congress districts (Census)
#   2026  119th Congress districts, except the nine states that drew new maps for 2026
#          (AL, CA, FL, LA, NC, OH, TN, TX, UT): 120th Congress districts (Census TIGER/Line
#          2026), trimmed to the coastline of the 2024 file. Census notes that its Missouri
#          file may show Missouri's new map, which the courts blocked for 2026, so only those
#          nine states are taken from it.
#
# Which states changed is measured (pipeline/us/congress/house_plans.py), not typed in. One level of
# detail for every source (points closer than 1 km merged), because the 2026 TIGER files are
# far more detailed than the earlier cartographic ones.
#
# Same projection as web/data/geo.json (Albers USA, Alaska and Hawaii as insets). 50 states
# only: DC and the territories elect non-voting delegates and are left out.
# Needs: mapshaper, and data/raw/congress/shapes filled by fetch_congress.sh.
set -euo pipefail
cd "$(dirname "$0")/../../.."

SH=data/raw/congress/shapes
TMP=$(mktemp -d)
STATES="'01','02','04','05','06','08','09','10','12','13','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','44','45','46','47','48','49','50','51','53','54','55','56'"
NEW2026="'01','06','12','22','37','39','47','48','49'"

layer() {  # layer <shapefile> <district field> <name> [extra filter]
  mapshaper "$1" \
    -filter "[$STATES].indexOf(STATEFP) > -1 ${4:-}" \
    -each "id = STATEFP + '-' + $2, st = STATEFP" \
    -filter-fields id,st \
    -proj albersusa \
    -o "$TMP/$3.json" format=geojson
}

layer "$SH/cb_2020_us_cd116_500k/cb_2020_us_cd116_500k.shp" CD116FP d2020raw "&& STATEFP !== '37'"
layer "$SH/cb_2022_us_cd118_500k/cb_2022_us_cd118_500k.shp" CD118FP d2022
layer "$SH/cb_2024_us_cd119_500k/cb_2024_us_cd119_500k.shp" CD119FP d2024
layer "$SH/cb_2024_us_cd119_500k/cb_2024_us_cd119_500k.shp" CD119FP d2026rest "&& [$NEW2026].indexOf(STATEFP) < 0"

# North Carolina 2019 map, from the General Assembly's map service (NCGA_Congress_2019)
mapshaper "$SH/nc_congress_2019.geojson" \
  -each "id = '37-' + String(District).padStart(2, '0'), st = '37'" \
  -filter-fields id,st \
  -proj albersusa \
  -o "$TMP/nc2019.json" format=geojson
mapshaper -i "$TMP/d2020raw.json" "$TMP/nc2019.json" combine-files \
  -merge-layers name=d2020 \
  -o "$TMP/d2020.json" format=geojson

# 2026: the nine new state maps (TIGER), trimmed to the land outline of the 2024 file
mkdir -p "$TMP/cd120"
for f in "$SH"/cd120/tl_2026_*_cd120.zip; do
  unzip -o -q "$f" -d "$TMP/cd120/$(basename "$f" .zip)"
done
mapshaper "$SH/cb_2024_us_cd119_500k/cb_2024_us_cd119_500k.shp" \
  -filter "[$NEW2026].indexOf(STATEFP) > -1" -dissolve STATEFP -o "$TMP/land9.shp"
mapshaper -i "$TMP"/cd120/*/tl_2026_*_cd120.shp combine-files -merge-layers \
  -filter "[$NEW2026].indexOf(STATEFP) > -1" \
  -clip "$TMP/land9.shp" \
  -each "id = STATEFP + '-' + CD120FP, st = STATEFP" \
  -filter-fields id,st \
  -proj albersusa \
  -o "$TMP/d2026new.json" format=geojson
mapshaper -i "$TMP/d2026new.json" "$TMP/d2026rest.json" combine-files \
  -merge-layers name=d2026 \
  -o "$TMP/d2026.json" format=geojson

# which states drew a new map each year, and one file per year with only those states
mkdir -p web/data/house
python3 -m pipeline.us.congress.house_plans "$TMP" web/data/house/plans.json 2020 2022 2024 2026
for y in 2020 2022 2024 2026; do
  mapshaper -i "$TMP/d$y.json" \
    -rename-layers districts \
    -filter-islands min-area=2000000 remove-empty \
    -simplify interval=1000 keep-shapes \
    -filter "$(cat "$TMP/new_$y.txt").indexOf(st) > -1" \
    -o "web/data/house/plans-$y.json" format=topojson quantization=100000
done
rm -rf "$TMP"
du -h web/data/house/*.json
