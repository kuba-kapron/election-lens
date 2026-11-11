#!/usr/bin/env bash
# City labels for the map -> web/data/places.json: US cities from Natural Earth's populated
# places (public domain; fetched by fetch_data.sh), projected like the map shapes (Albers USA,
# Alaska and Hawaii as insets, same as build_geo.sh) so they land in the right county.
# Each city: [name, state FIPS, population (metro, Natural Earth's pop_max), x, y, capital], largest
# first; capital: 2 = national (Washington), 1 = state capital, 0 = neither (Natural Earth's featurecla).
# Needs: mapshaper.
set -euo pipefail
cd "$(dirname "$0")/../../.."

TMP=$(mktemp -d)
mapshaper data/raw/places/ne_10m_populated_places_simple.shp \
  -filter "adm0_a3 == 'USA'" \
  -filter-fields name,adm1name,pop_max,featurecla \
  -proj albersusa \
  -o "$TMP/places.json" format=geojson

python3 - "$TMP/places.json" web/data/places.json <<'EOF'
import json, sys
states = json.load(open("web/data/results.json"))["states"]
fips = {s["name"]: f for f, s in states.items()}
out = []
for f in json.load(open(sys.argv[1]))["features"]:
    p, g = f["properties"], f["geometry"]
    st = fips.get(p["adm1name"])
    if not st or not g:
        continue
    x, y = g["coordinates"]
    cap = 2 if p["featurecla"].startswith("Admin-0 capital") else 1 if p["featurecla"].startswith("Admin-1 capital") else 0
    out.append([" ".join(p["name"].split()), st, int(p["pop_max"]), round(x), round(y), cap])
out.sort(key=lambda c: -c[2])
open(sys.argv[2], "w").write(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
print(f"{len(out)} cities -> {sys.argv[2]}")
EOF
rm -rf "$TMP"
