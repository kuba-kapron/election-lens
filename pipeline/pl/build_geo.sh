#!/usr/bin/env bash
# Builds web/data/pl/geo-<year>.json: Poland's map for elections held under that year's borders.
#
#   ./pipeline/pl/build_geo.sh 2025      # needs ./pipeline/pl/fetch_prg.sh 2025 first
#
# Layers in the output TopoJSON (ids are PKW's TERYT codes, so results join without a table):
#   gminas        the 2,478 gminas outside Warsaw (6 digits: voivodeship, powiat, gmina) and
#                 Warsaw's 18 districts (146502-146519), which PKW reports in place of the city
#   powiats       dissolved from gminas (4 digits)
#   voivodeships  dissolved from gminas (2 digits)
# Source: Państwowy Rejestr Granic (GUGiK). Projected to Poland's national grid (PUWG 1992,
# EPSG:2180) and simplified; powiats and voivodeships come from the simplified gminas, so their
# borders line up exactly. Needs mapshaper.
set -euo pipefail
cd "$(dirname "$0")/../.."

YEAR=${1:?usage: build_geo.sh <year>}
SRC=data/raw/pl/prg/$YEAR/PRG_jednostki_administracyjne_$YEAR
OUT=web/data/pl/geo-$YEAR.json
TMP=$(mktemp -d)
mkdir -p web/data/pl

# the gminas, without Warsaw as a whole
mapshaper "$SRC/A03_Granice_gmin.shp" \
  -filter "JPT_KOD_JE.slice(0, 6) !== '146501'" \
  -each "id = JPT_KOD_JE.slice(0, 6)" \
  -filter-fields id \
  -o "$TMP/gminas.shp"
# Warsaw's districts (registry units 146502_8 ... 146519_8)
mapshaper "$SRC/A05_Granice_jednostek_ewidnecyjnych.shp" \
  -filter "/^1465(0[2-9]|1[0-9])_8$/.test(JPT_KOD_JE)" \
  -each "id = JPT_KOD_JE.slice(0, 6)" \
  -filter-fields id \
  -o "$TMP/warsaw.shp"

mapshaper -i "$TMP/gminas.shp" "$TMP/warsaw.shp" combine-files \
  -merge-layers name=gminas \
  -proj EPSG:2180 \
  -simplify 4% keep-shapes \
  -clean \
  -each "pw = id.slice(0, 4), wj = id.slice(0, 2)" \
  -dissolve pw name=powiats + \
  -dissolve wj name=voivodeships target=gminas + \
  -each "id = pw" target=powiats \
  -each "id = wj" target=voivodeships \
  -filter-fields id target='*' \
  -o "$OUT" format=topojson quantization=100000 target='*'

rm -rf "$TMP"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
