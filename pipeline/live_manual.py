"""Type in live numbers or race calls by hand. The importer (pipeline/live.py) picks them up
on its next round (within a minute).

    uv run pipeline/live_manual.py set MI-sen El-Sayed=1234567 Rogers=1200345 --pct 45 --source "AP via NBC News"
    uv run pipeline/live_manual.py clear MI-sen                  # back to the automatic sources
    uv run pipeline/live_manual.py call GA-sen Ossoff --by AP     # someone has called the race
    uv run pipeline/live_manual.py uncall GA-sen
    uv run pipeline/live_manual.py call KY-3 McGarvey --by AP     # House district (KY-AL / WY-AL at large)
    uv run pipeline/live_manual.py show

Names are last names as the page shows them; race ids are in pipeline/live_races.py
(two-letter state + "-sen" for the 35 Senate races, plus OH-gov and TX-gov). Every entry needs its source, which the page shows. --total is all votes counted,
including other candidates; without it, the listed candidates' votes are the total.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import live_races as LR

ROOT = Path(__file__).resolve().parent.parent
MANUAL = ROOT / "data" / "live" / "manual.json"
CALLS = ROOT / "data" / "live" / "calls.json"
RACES = {r["id"]: r for r in LR.RACES}
HOUSE_FILE = ROOT / "web" / "data" / "live" / "house.json"  # tonight's House candidates, from the importer


def load(path):
    return json.loads(path.read_text()) if path.exists() else {}


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def last_names(race):
    return {LR.last_name(n).lower(): LR.last_name(n) for n, _ in race["cands"]}


def house_district(text):
    """ "KY-3", "ky-03", "WY-AL" -> ("KY-03", that district's race from the importer's file), or None."""
    st, _, num = text.upper().partition("-")
    if len(st) != 2 or not (num.isdigit() or num == "AL"):
        return None
    num = "00" if num == "AL" else num.zfill(2)
    import live_sources as S
    if st not in S.ABBR_TO_FIPS:
        return None
    races = json.loads(HOUSE_FILE.read_text())["races"] if HOUSE_FILE.exists() else {}
    race = races.get(f"{S.ABBR_TO_FIPS[st]}-{num}")
    if not race:
        sys.exit(f"No House race {st}-{num} in {HOUSE_FILE.name} (is the importer running?)")
    return f"{st}-{num}", race


def race_id(text):
    rid = next((r for r in RACES if r.lower() == text.lower()), None)
    if not rid:
        sys.exit(f"Unknown race {text!r}. Races: {', '.join(RACES)}")
    return rid


def main():
    ap = argparse.ArgumentParser(description="Enter live numbers or race calls by hand.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("set", help="enter vote totals for a race")
    s.add_argument("race")
    s.add_argument("votes", nargs="+", help="Lastname=votes, one per candidate")
    s.add_argument("--pct", type=float, help="share of the expected vote counted, 0-100")
    s.add_argument("--total", type=int, help="all votes counted, including other candidates")
    s.add_argument("--source", required=True, help='where the numbers come from, e.g. "AP via NBC News"')
    c = sub.add_parser("clear", help="remove a race's manual entry")
    c.add_argument("race")
    k = sub.add_parser("call", help="record that a race has been called")
    k.add_argument("race")
    k.add_argument("winner", help="last name")
    k.add_argument("--by", required=True, help='who called it, e.g. "AP"')
    u = sub.add_parser("uncall", help="remove a race call")
    u.add_argument("race")
    sub.add_parser("show", help="list manual entries and calls")
    a = ap.parse_args()

    manual, calls = load(MANUAL), load(CALLS)
    if a.cmd == "show":
        print(json.dumps({"manual": manual, "calls": calls}, indent=2, ensure_ascii=False))
        return 0
    district = house_district(a.race)
    if district and a.cmd in ("set", "clear"):
        sys.exit("House districts can be called or uncalled; numbers for them are not entered by hand.")
    if district:
        rid, hrace = district
        names = {c["last"].lower(): c["last"] for c in hrace["cands"]}
    else:
        rid = race_id(a.race)
        names = last_names(RACES[rid])
    if a.cmd == "set":
        votes = {}
        for item in a.votes:
            name, _, n = item.partition("=")
            if name.lower() not in names or not n.replace(",", "").isdigit():
                sys.exit(f"Use Lastname=votes with one of: {', '.join(names.values())}")
            votes[names[name.lower()]] = int(n.replace(",", ""))
        if a.total is not None and a.total < sum(votes.values()):
            sys.exit("--total is smaller than the candidates' votes added up")
        now = time.time()
        manual[rid] = {"votes": votes, "pct": a.pct, "total": a.total, "source": a.source, "at_unix": now,
                       "at": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        save(MANUAL, manual)
        print(f"{rid}: {votes} ({a.pct if a.pct is not None else '?'}% counted), source: {a.source}")
    elif a.cmd == "clear":
        manual.pop(rid, None)
        save(MANUAL, manual)
        print(f"{rid}: manual entry removed; automatic sources again")
    elif a.cmd == "call":
        if a.winner.lower() not in names:
            sys.exit(f"Winner must be one of: {', '.join(names.values())}")
        calls[rid] = {"winner": names[a.winner.lower()], "by": a.by,
                      "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        save(CALLS, calls)
        print(f"{rid}: called for {calls[rid]['winner']} by {a.by}")
    elif a.cmd == "uncall":
        calls.pop(rid, None)
        save(CALLS, calls)
        print(f"{rid}: call removed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
