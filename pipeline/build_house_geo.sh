#!/usr/bin/env bash
# Builds web/data/house/<year>.json: congressional district shapes for each House election,
# one TopoJSON file per year with one layer, "districts" (id "SS-DD": state FIPS and
# district number, "00" at large). The page loads only the year it shows.
#   2020  116th Congress districts (Census), with North Carolina's 2019 remedial map
#          (Session Law 2019-249), which was first used in the 2020 election
#   2022  118th Congress districts (Census)
#   2024  119th Congress districts (Census)
#
# Same projection as web/data/geo.json (Albers USA, Alaska and Hawaii as insets), so the
# page can draw both with one projection. 50 states only: DC and the territories elect
# non-voting delegates and are left out.
# Needs: mapshaper, and data/raw/congress/shapes filled by fetch_congress.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

SH=data/raw/congress/shapes
TMP=$(mktemp -d)
STATES="'01','02','04','05','06','08','09','10','12','13','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','44','45','46','47','48','49','50','51','53','54','55','56'"

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

# North Carolina 2019 map, from the General Assembly's map service (NCGA_Congress_2019)
mapshaper "$SH/nc_congress_2019.geojson" \
  -each "id = '37-' + String(District).padStart(2, '0'), st = '37'" \
  -filter-fields id,st \
  -proj albersusa \
  -o "$TMP/nc2019.json" format=geojson
mapshaper -i "$TMP/d2020raw.json" "$TMP/nc2019.json" combine-files \
  -merge-layers name=d2020 \
  -o "$TMP/d2020.json" format=geojson

mkdir -p web/data/house
for y in 2020 2022 2024; do
  mapshaper -i "$TMP/d$y.json" \
    -rename-layers districts \
    -filter-islands min-area=2000000 remove-empty \
    -simplify 6% keep-shapes \
    -o "web/data/house/$y.json" format=topojson quantization=100000
done
rm -rf "$TMP"
du -h web/data/house/*.json
