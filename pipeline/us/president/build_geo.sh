#!/usr/bin/env bash
# Builds web/data/us/geo.json: US county shapes for the map.
#
# Layers in the output TopoJSON:
#   counties  2019 Census counties (50 states + DC); Alaska merged into one shape (02000)
#   ct2023    Connecticut planning regions (used for 2024, when CT reports by region)
#   states    state outlines, dissolved from counties
#
# Shapes are projected to Albers USA (Alaska and Hawaii as insets) and simplified.
# Needs: mapshaper (npm i -g mapshaper), and data/raw/ filled by fetch_data.sh.
set -euo pipefail
cd "$(dirname "$0")/../../.."

RAW=data/raw
C2019=$RAW/c2019/cb_2019_us_county_500k.shp
C2023=$RAW/c2023/cb_2023_us_county_500k.shp
OUT=web/data/us/geo.json
TMP=$(mktemp -d)

# 50 states + DC (drops Puerto Rico and the territories)
STATES="'01','02','04','05','06','08','09','10','11','12','13','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','44','45','46','47','48','49','50','51','53','54','55','56'"

mapshaper "$C2019" \
  -filter "[$STATES].indexOf(STATEFP) > -1" \
  -each "id = STATEFP === '02' ? '02000' : GEOID, st = STATEFP" \
  -dissolve id copy-fields=st \
  -proj albersusa \
  -simplify 6% keep-shapes \
  -rename-layers counties \
  -o "$TMP/counties.json" format=geojson

mapshaper "$C2023" \
  -filter "STATEFP === '09'" \
  -each "id = GEOID, st = STATEFP" \
  -filter-fields id,st \
  -proj albersusa \
  -simplify 6% keep-shapes \
  -rename-layers ct2023 \
  -o "$TMP/ct2023.json" format=geojson

mapshaper -i "$TMP/counties.json" "$TMP/ct2023.json" combine-files \
  -target counties \
  -dissolve st + name=states \
  -target '*' \
  -o "$OUT" format=topojson quantization=100000 target='*'

rm -rf "$TMP"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
