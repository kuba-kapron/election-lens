"""Which states drew a new district map each year (called by build_house_geo.sh).

Compares every district between consecutive years: a state counts as unchanged when it has
the same district numbers and every district keeps its area (within 1%) and its centre
(within 2 km). Census files of different years draw the same unchanged line with slightly
different points, so lines are compared by shape, not point by point.

    python3 -m pipeline.us.congress.house_plans <dir with d2020.json, d2022.json, ...> <out plans.json> 2020 2022 2024 2026

Writes plans.json: for each year, the year whose map each state uses ({"2026": {"56": 2020,
...}}), and <dir>/new_<year>.txt, the states with a new map that year, as a list mapshaper's
-filter can use. Each state map is then stored once, in the file of the year it first
appeared (web/data/us/house/plans-<year>.json).
"""

import json
import sys
from pathlib import Path


def rings(g):
    return g["coordinates"] if g["type"] == "Polygon" else [r for p in g["coordinates"] for r in p]


def stats(g):
    """Area and centre of a projected polygon (shoelace formula)."""
    a = cx = cy = 0.0
    for r in rings(g):
        for (x1, y1), (x2, y2) in zip(r, r[1:]):
            c = x1 * y2 - x2 * y1
            a += c
            cx += (x1 + x2) * c
            cy += (y1 + y2) * c
    a /= 2
    return abs(a), ((cx / (6 * a), cy / (6 * a)) if a else (0.0, 0.0))


def districts(path):
    return {f["properties"]["id"]: stats(f["geometry"])
            for f in json.loads(Path(path).read_text())["features"] if f.get("geometry")}


def same(a, b):
    if set(a) != set(b):
        return False
    for i in b:
        (aa, ca), (ab, cb) = a[i], b[i]
        if abs(aa - ab) / max(aa, 1) > 0.01 or ((ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2) ** 0.5 > 2000:
            return False
    return True


def main():
    tmp, out, years = Path(sys.argv[1]), Path(sys.argv[2]), [int(y) for y in sys.argv[3:]]
    plans, prev = {}, None
    for y in years:
        d = districts(tmp / f"d{y}.json")
        states = sorted({i[:2] for i in d})
        plans[y] = {}
        new = []
        for st in states:
            mine = {i: v for i, v in d.items() if i[:2] == st}
            if prev and st in plans[prev[0]] and same({i: v for i, v in prev[1].items() if i[:2] == st}, mine):
                plans[y][st] = plans[prev[0]][st]
            else:
                plans[y][st] = y
                new.append(st)
        (tmp / f"new_{y}.txt").write_text(json.dumps(new))
        print(f"{y}: {len(new)} states with a new map")
        prev = (y, d)
    out.write_text(json.dumps({str(y): p for y, p in plans.items()}, separators=(",", ":")) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
