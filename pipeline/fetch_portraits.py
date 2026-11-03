"""Download official portraits of the Senate and House candidates who have served in Congress.

Reads the Congress (bioguide) IDs that build_senate.py and build_house.py attach to
candidates, and downloads each person's official portrait from the unitedstates/images
project (https://github.com/unitedstates/images). The portraits are US government works,
in the public domain. Originals go to photos/congress/<ID>.jpg (not committed); then run
pipeline/build_photos.py to make the small round portraits the page uses.

    uv run pipeline/fetch_portraits.py

Files already downloaded are skipped. Some members have no portrait there yet; they are
listed at the end and keep their initials on the page.
"""

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "photos" / "congress"
URL = "https://unitedstates.github.io/images/congress/225x275/{}.jpg"


def congress_ids():
    ids = set()
    for name in ("senate", "house"):
        data = json.loads((ROOT / "web" / "data" / f"{name}.json").read_text())
        for races in data["races"].values():
            for race in races.values() if isinstance(races, dict) else races:
                ids.update(c["bio"] for c in race["cands"] if "bio" in c)
    for live in sorted((ROOT / "web" / "data" / "live").glob("*.json")):  # tonight's candidates (pipeline/live.py)
        for race in json.loads(live.read_text())["races"].values():
            ids.update(c["bio"] for c in race["cands"] if "bio" in c)
    return sorted(ids)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    ids = congress_ids()
    new, missing = 0, []
    for bio in ids:
        path = OUT / f"{bio}.jpg"
        if path.exists():
            continue
        try:
            with urllib.request.urlopen(URL.format(bio), timeout=30) as r:
                path.write_bytes(r.read())
            new += 1
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            missing.append(bio)
        time.sleep(0.1)  # be gentle with the host
    print(f"{len(ids)} members of Congress among the candidates; {new} portraits downloaded, "
          f"{len(ids) - len(missing)} on disk in {OUT.relative_to(ROOT)}")
    if missing:
        print(f"No portrait available for {len(missing)}: {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
