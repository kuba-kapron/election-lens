#!/usr/bin/env bash
# Downloads the raw sources into data/raw/ (not committed to git).
#   - Official county presidential returns 2000-2016, MIT Election Data and Science Lab
#     https://github.com/MEDSL/county-returns
#   - County presidential results 2020 and 2024 compiled by Tony McGovern (MIT license)
#     https://github.com/tonmcg/US_County_Level_Election_Results_08-24
#   - US Census cartographic boundary files for counties (2019 and 2023),
#     shipped inside that repository's cartography/ folder
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=data/raw
mkdir -p "$RAW"

if [ ! -d "$RAW/medsl" ]; then
  git clone --depth 1 https://github.com/MEDSL/county-returns.git "$RAW/medsl"
fi

if [ ! -d "$RAW/tonmcg" ]; then
  git clone --depth 1 https://github.com/tonmcg/US_County_Level_Election_Results_08-24.git "$RAW/tonmcg"
fi

unzip -o -q "$RAW/tonmcg/cartography/2020/build/cb_2019_us_county_500k.zip" -d "$RAW/c2019"
unzip -o -q "$RAW/tonmcg/cartography/2024/build/cb_2023_us_county_500k.zip" -d "$RAW/c2023"

# city labels: Natural Earth populated places (public domain), built by pipeline/build_places.sh
if [ ! -f "$RAW/places/ne_10m_populated_places_simple.shp" ]; then
  mkdir -p "$RAW/places"
  curl -sSfL -A "ElectionLens/0.1 (election results map, hobby project)" -o "$RAW/places/places.zip" \
    https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places_simple.zip
  unzip -o -q "$RAW/places/places.zip" -d "$RAW/places"
fi

echo "Raw data ready in $RAW"
