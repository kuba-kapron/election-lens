"""Governor results 2018, 2022, 2024 -> web/data/governor.json (statewide, per candidate).

Source: MEDSL official precinct returns (pipeline/fetch_governor.sh), summed to the state.
Candidates on several party lines (New York's fusion ballots) are summed into one; the party is
Democratic or Republican when any of their lines is, else the line with the most votes.
Blank, over- and under-votes are left out; write-ins count toward the total only.

Gaps: Tennessee 2022 has no governor rows in MEDSL's file; 2020 is not fetched (Dataverse form).
Not yet cross-checked against each state's certified result (planned; see CLAUDE.md).

    {"years": {"2022": {"FIPS": {"total": n, "cands": [{"name", "party", "caucus", "votes"}]}}}}
"""

import csv
import re
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/governor"
OUT = ROOT / "web/data/governor.json"
csv.field_size_limit(10**9)

OFFICES = {"GOVERNOR", "GOVERNOR/LIEUTENANT GOVERNOR", "GOVERNOR AND LIEUTENANT GOVERNOR"}
# ballot counters and non-votes some states report as if they were candidates
NOT_VOTES = ("BLANK", "OVERVOTE", "UNDERVOTE", "OVER VOTE", "UNDER VOTE", "SPOILED", "VOID", "TOTAL VOTES", "REGISTERED",
             "PUBLIC COUNTER", "STATE BALLOTS", "BALLOTS CAST", "CAST VOTES", "ABSENTEE", "AFFIDAVIT", "FEDERAL", "EMERGENCY")
SMALL = {"LIBERTARIAN": "L", "GREEN": "G"}


def rows(zpath):
    with zipfile.ZipFile(zpath) as z:
        for n in z.namelist():
            if n.endswith(".csv") and not n.startswith("__"):
                yield from csv.DictReader(io.TextIOWrapper(z.open(n), encoding="utf-8", errors="replace"))


def party_of(lines):
    """lines: {party_detailed: votes} -> D, R, L, G, O, or None when the source gives no party"""
    words = re.split(r"[^A-Z]+", " ".join(lines).upper())
    if any(w.startswith("DEM") for w in words):  # "DEMOCRAT", "DEM/PROG" (Vermont)
        return "D"
    if any(w.startswith("REP") for w in words):
        return "R"
    top = max(lines, key=lines.get).upper()
    if not top.strip():
        return None
    return next((v for k, v in SMALL.items() if k in top), "O")


# running mates without a separator in the source (display only)
NAME_FIX = {"SPENCER J COX DEIDRE M HENDERSON": "SPENCER J COX", "BRIAN SMITH KING REBEKAH CUMMINGS": "BRIAN SMITH KING"}


def title(name):
    """MEDSL names are upper case and some carry the running mate:
    'KIM REYNOLDS/ADAM GREGG' -> 'Kim Reynolds', 'RON DESANTIS' -> 'Ron DeSantis'."""
    name = NAME_FIX.get(name, name)
    name = re.split(r"\s*/\s*|\s+AND\s+|\s+&\s+", name)[0]
    name = re.sub(r"^GOVERNOR\s+", "", name)

    def word(w):
        if len(w) <= 3 and w.upper() in ("JB", "JD"):
            return w.upper()
        w = w.capitalize()
        w = re.sub(r"^(Mc|O')(\w)", lambda m: m[1] + m[2].upper(), w)
        return {"Desantis": "DeSantis", "Dewine": "DeWine"}.get(w, w)
    return " ".join(word(w) for w in name.split())


def norm(name):
    """first and last word, to match a person across files: 'KATHY C HOCHUL' -> 'KATHY HOCHUL'"""
    w = re.sub(r"[^A-Z ]", "", title(name).upper()).split()
    return f"{w[0]} {w[-1]}" if w else ""


def known_parties(years):
    """Party by person, from the governor races that give one and MEDSL's statewide Senate file,
    for sources that leave the party out (New Mexico 2022)."""
    known = {}
    for sts in years.values():
        for r in sts.values():
            for c in r["cands"]:
                if c["party"]:
                    known.setdefault((c["st"], norm(c["raw"])), c["party"])
    f = ROOT / "data/raw/congress/senate-state-1976-2024.csv"
    if f.exists():
        for r in csv.DictReader(open(f, encoding="utf-8")):
            p = party_of({r["party_detailed"]: 1})
            if p:
                known.setdefault((str(r["state_fips"]).zfill(2), norm(r["candidate"])), p)
    return known


def build_year(files):
    out = {}
    for zp in files:
        votes = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))  # state -> cand -> party -> votes
        modes = defaultdict(set)  # (state, county, precinct) -> modes, to avoid counting TOTAL twice
        keep = []
        for r in rows(zp):
            if (r.get("office") or "").strip().upper() not in OFFICES:
                continue
            if (r.get("stage") or "GEN").upper() not in ("GEN", ""):
                continue
            keep.append(r)
            modes[(r["state_fips"], r.get("county_fips"), r.get("precinct"))].add((r.get("mode") or "").upper())
        for r in keep:
            m = (r.get("mode") or "").upper()
            if m != "TOTAL" and "TOTAL" in modes[(r["state_fips"], r.get("county_fips"), r.get("precinct"))]:
                continue
            name = (r.get("candidate") or "").strip().upper()
            if not name or name in ("TOTAL", "ELIGIBLE") or any(x in name for x in NOT_VOTES):
                continue
            try:
                v = int(float(r.get("votes") or 0))
            except ValueError:
                continue
            wi = (r.get("writein") or "").upper() == "TRUE" or name in ("WRITEIN", "WRITE-IN", "SCATTERING")
            st = r["state_fips"].zfill(2)
            votes[st]["WRITEIN" if wi else name][(r.get("party_detailed") or "").upper()] += v
        for st, cands in votes.items():
            total = sum(sum(p.values()) for p in cands.values())
            cs = [{"name": title(n), "raw": n, "st": st, "party": party_of(p), "votes": sum(p.values())}
                  for n, p in cands.items() if n != "WRITEIN"]
            cs.sort(key=lambda c: -c["votes"])
            out[st] = {"total": total, "cands": [c for c in cs if c["votes"] > 0]}
    return out


def main():
    years = {}
    for y in ("2018", "2022", "2024"):
        files = sorted((RAW / y).glob("*.zip"))
        if not files:
            sys.exit(f"no files in {RAW / y}: run pipeline/fetch_governor.sh")
        years[y] = build_year(files)
    known = known_parties(years)
    for y, sts in years.items():
        for st, r in sts.items():
            for c in r["cands"]:
                if not c["party"]:
                    c["party"] = known.get((st, norm(c["raw"])))
                    if c["party"]:
                        print(f"  {y} {st} {c['name']}: party {c['party']} from another race of theirs")
                    elif c["votes"] > 0.01 * r["total"]:
                        print(f"  {y} {st} {c['name']}: no party in the source, shown as other")
                    c["party"] = c["party"] or "O"
                c["caucus"] = c["party"] if c["party"] in ("D", "R") else "I"
                del c["raw"], c["st"]
    OUT.write_text(json.dumps({"years": years}, separators=(",", ":"), ensure_ascii=False) + "\n")
    for y, sts in years.items():
        print(y, len(sts), "states")
        for st, r in sorted(sts.items()):
            a = r["cands"][0]
            b = r["cands"][1] if len(r["cands"]) > 1 else {"name": "-", "party": "", "votes": 0}
            print(f"  {st} {a['name']} ({a['party']}) {a['votes']:,} - {b['name']} ({b['party']}) {b['votes']:,}  total {r['total']:,}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
