#!/usr/bin/env bash
# Downloads Poland's administrative borders for one year into data/raw/pl/prg/<year>/ (not
# committed): voivodeships, powiats and gminas from the national boundary register (Państwowy
# Rejestr Granic, GUGiK), as of January 1 of that year. "Available free of charge for any use":
# https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/
#
#   ./pipeline/pl/fetch_prg.sh 2025      # the borders in force for the 2025 presidential election
#
# Each year's package is about 380 MB (shapefiles, about 1 GB unpacked).
set -euo pipefail
cd "$(dirname "$0")/../.."

YEAR=${1:?usage: fetch_prg.sh <year>}
DIR=data/raw/pl/prg/$YEAR
mkdir -p "$DIR"
if [ ! -f "$DIR/prg.zip" ]; then
  curl -sSfL -A "ElectionLens/0.1 (election results map, hobby project)" -o "$DIR/prg.zip.part" \
    "https://opendata.geoportal.gov.pl/prg/granice_archiwalne/PRG_jednostki_administracyjne_$YEAR.zip"
  mv "$DIR/prg.zip.part" "$DIR/prg.zip"
fi
unzip -o -q "$DIR/prg.zip" -d "$DIR"
echo "Borders for $YEAR ready in $DIR"
