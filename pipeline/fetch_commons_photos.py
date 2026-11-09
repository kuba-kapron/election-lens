"""Download the candidate photos the owner approved from the review sheet made by
pipeline/find_commons_photos.py (all 14 free-licensed photos were approved on November 3, 2026).

    uv run pipeline/fetch_commons_photos.py            # every photo marked "needs your approval"
    uv run pipeline/fetch_commons_photos.py nc-cooper  # only these keys

Saves each photo (Commons' 960-pixel version) to photos/people/<key>.jpg (not committed)
and its credit (author, license, Commons page) to photos/people/credits.json. Then run
pipeline/build_photos.py, which shrinks them into web/img/people/ for the page.
"""

import json
import sys
import time
from pathlib import Path

import live_fetch as F

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "people" / "candidates.json"
OUT = ROOT / "photos" / "people"


def main():
    wanted = set(sys.argv[1:])
    found = json.loads(SRC.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    credits_path = OUT / "credits.json"
    credits = json.loads(credits_path.read_text()) if credits_path.exists() else {}
    for r in found:
        if not r["status"].startswith("free") or (wanted and r["key"] not in wanted):
            continue
        credit = {"name": r["name"], "author": r["author"], "license": r["license"], "page": r["page"]}
        photo = OUT / f"{r['key']}.jpg"
        if not photo.exists():
            time.sleep(5)  # Wikimedia's image server limits scripts: go slowly
            try:
                data = F.fetch(r["thumb"].replace("&amp;", "&"), min_interval=24 * 3600)
            except F.Refused as e:
                print(f"  {r['key']:16} not downloaded: {e}. Run again later for the rest.")
                break
            photo.write_bytes(data)
            print(f"  {r['key']:16} {len(data) // 1024:4} KB  {r['license']}, {r['author']}")
        credits[r["key"]] = credit
        credits_path.write_text(json.dumps(credits, indent=2, ensure_ascii=False) + "\n")  # saved as we go
    print(f"{len(credits)} photos with credits in {credits_path.relative_to(ROOT)}; now run pipeline/build_photos.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
