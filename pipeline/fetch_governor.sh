#!/usr/bin/env bash
# Downloads governor sources into data/raw/governor/ (not committed to git).
#
#   MEDSL (MIT Election Data and Science Lab) official precinct returns on GitHub, every office
#   on the ballot, governor included:
#     2018: STATE_precinct_general.zip (all states, state offices)       ~76 MB
#     2022: one zip per state, the 36 states that elect a governor then  ~60 MB
#     2024: one zip per state, the 11 states that elected a governor     ~25 MB
#   2020 (11 races) is on Harvard Dataverse behind a guestbook form; not fetched.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=data/raw/governor
mkdir -p "$RAW/2018" "$RAW/2022" "$RAW/2024"
UA="ElectionLens/0.1 (election results map, hobby project)"
GH=https://github.com/MEDSL

get() {  # get <url> <file>: download once, slowly
  [ -s "$2" ] && return
  curl -sSfL --retry 3 -A "$UA" -o "$2" "$1"
  sleep 2
}

get "$GH/2018-elections-official/raw/master/STATE/STATE_precinct_general.zip" "$RAW/2018/STATE_precinct_general.zip"
for st in ak al ar az ca co ct fl ga hi ia id il ks ma md me mi mn ne nh nm nv ny oh ok or pa ri sc sd tn tx vt wi wy; do
  get "$GH/2022-elections-official/raw/main/individual_states/2022-$st-local-precinct-general.zip" "$RAW/2022/$st.zip"
done
for st in de in mo mt nc nd nh ut vt wa wv; do
  get "$GH/2024-elections-official/raw/main/individual_states/${st}24.zip" "$RAW/2024/$st.zip"
done
echo "done: $(du -sh "$RAW" | cut -f1) in $RAW"
