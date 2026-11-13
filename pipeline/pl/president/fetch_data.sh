#!/usr/bin/env bash
# Downloads the official results of the 2025 presidential election (rounds on May 18 and June 1)
# from the National Electoral Commission (PKW) into data/raw/pl/president/2025/ (not committed):
# https://prezydent2025.pkw.gov.pl/prezydent2025/pl/dane_w_arkuszach
#   protokoly_po_obwodach*   every polling station's count (32,143 per round): the results
#   obwody_glosowania*       the polling stations: address, type, border description
#   wyniki_*_po_gminach*     PKW's own totals by gmina, to check our sums against
#   kandydaci*               the candidates
# The file names carry the time of PKW's last update (1758650309 = September 23, 2025); if PKW
# publishes a newer version, take the names from the page above. About 5 MB in all.
set -euo pipefail
cd "$(dirname "$0")/../../.."

DIR=data/raw/pl/president/2025
BASE=https://prezydent2025.pkw.gov.pl/prezydent2025/data/csv
VERSION=1758650309
mkdir -p "$DIR"
for f in protokoly_po_obwodach protokoly_po_obwodach_w_drugiej_turze \
         obwody_glosowania obwody_glosowania_w_drugiej_turze \
         wyniki_gl_na_kandydatow_po_gminach wyniki_gl_na_kandydatow_po_gminach_w_drugiej_turze \
         kandydaci kandydaci_w_drugiej_turze; do
  if [ ! -f "$DIR/$f.zip" ]; then
    curl -sSfL -A "ElectionLens/0.1 (election results map, hobby project)" -o "$DIR/$f.zip" "$BASE/${f}_csv.$VERSION.zip"
    sleep 3  # one request at a time, slowly
  fi
  unzip -o -q "$DIR/$f.zip" -d "$DIR"
done
echo "PKW files ready in $DIR"
