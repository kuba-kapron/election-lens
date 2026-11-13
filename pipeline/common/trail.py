"""Each race's path through the night, for the charts in the race panels.

    web/data/us/live/trail-<office>.json = {"office", "updated", "races": {id: {
        "cands": ["Jon Ossoff", "Mike Collins", ...],   # first-seen order, never reordered
        "srcs": ["civicAPI", "Georgia Secretary of State"],
        "pts": [[unix seconds, pct counted or null, total, source index, votes per cand...], ...]}}}

A point is added only when a race's numbers (votes, total, share counted or source) change,
and only once it has votes. Votes, not margins, so the page can draw the margin, the shares or
the lead, and a lead changing hands loses nothing. Numbers are kept as reported: a source that
revises its count down makes the line go down; a change of source is a new source index.

Built from the snapshots (data/live/snapshots/<office>/) when the importer starts, then extended
every round, so a restart loses nothing and the charts can be rebuilt after a reader fix.
"""

import gzip
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path


class Trail:
    def __init__(self, office, test=False):
        self.office = office
        self.test = test  # --replay: chart the test numbers too (the file says so)
        self.races = {}
        self.changed = False
        self.updated = None

    def add(self, data, t):
        """Add one office file's numbers (as written to web/data/us/live/<office>.json) at time t."""
        for rid, r in (data.get("races") or {}).items():
            rd = (r.get("rounds") or [None])[0]
            if not rd or not rd.get("total") or (r.get("test") and not self.test):
                continue
            tr = self.races.setdefault(rid, {"cands": [], "srcs": [], "pts": []})
            names = [c["name"] for c in r["cands"]]
            for n in names:
                if n not in tr["cands"]:
                    tr["cands"].append(n)
            src = (r.get("source") or {}).get("name") or "?"
            if src not in tr["srcs"]:
                tr["srcs"].append(src)
            votes = [0] * len(tr["cands"])
            for n, v in zip(names, rd["votes"]):
                votes[tr["cands"].index(n)] = v
            pct = round(r["pct"], 1) if r.get("pct") is not None else None
            pt = [int(t), pct, rd["total"], tr["srcs"].index(src)] + votes
            if tr["pts"] and tr["pts"][-1][1:] == pt[1:]:
                continue
            tr["pts"].append(pt)
            self.changed = True

    def load_snapshots(self, folder):
        """Rebuild from the night's snapshots, oldest first (file names are UTC times)."""
        for f in sorted(Path(folder).glob("*.json.gz")):
            try:
                t = datetime.strptime(f.name[:16], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).timestamp()
                self.add(json.loads(gzip.decompress(f.read_bytes())), t)
            except (OSError, ValueError, KeyError) as e:
                print(f"trail: skipped {f.name}: {e}")
        self.changed = True

    def write(self, out_dir):
        """Rewrite trail-<office>.json if anything was added; returns its "updated" time or None."""
        if not self.changed:
            return None
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        out = Path(out_dir) / f"trail-{self.office}.json"
        tmp = out.with_suffix(".tmp")
        tmp.write_text(json.dumps({"office": self.office, "updated": now, "test": self.test, "races": self.races},
                                  separators=(",", ":"), ensure_ascii=False))
        os.replace(tmp, out)
        self.changed = False
        self.updated = now
        return now
