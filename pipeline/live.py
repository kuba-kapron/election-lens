"""Live results importer for election night, 3 November 2026. Writes web/data/live.json.

    uv run pipeline/live.py              # check every source, rewrite the file, repeat every minute
    uv run pipeline/live.py --once       # one round, then stop
    uv run pipeline/live.py --replay 20  # test: 2024 presidential results counted over 20 minutes

Each race takes its numbers from the first of its sources (pipeline/live_races.py) that has
votes, skipping any that says its data is a test. A manual entry (pipeline/live_manual.py)
overrides the sources; a race call is only ever entered by hand, with who made it. Sites are
asked at most once every 3 minutes (pipeline/live_fetch.py); the file is rewritten every
minute so the page's "updated" times stay current.
"""

import argparse
import gzip
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import congress as C
import live_fetch as F
import live_house as LH
import live_races as LR
import live_sources as S

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data" / "live.json"
MANUAL = ROOT / "data" / "live" / "manual.json"
CALLS = ROOT / "data" / "live" / "calls.json"
STALE_AFTER = 10 * 60  # seconds: a source not refreshed for this long is marked stale


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def load(path):
    return json.loads(path.read_text()) if path.exists() else {}


def people(race):
    """Candidates as the page shows them, with Congress IDs (portraits) and incumbency."""
    out = []
    for name, party in race["cands"]:
        first, last = name.split(" ", 1)[0], LR.last_name(name)
        chamber = "sen" if race["office"] == "senate" else None
        m = C.member(race["st"], first, last, chamber or "sen", 2026)
        p = {"name": name, "last": last, "party": party, "caucus": party if party in ("D", "R") else "I",
             "inc": bool(chamber) and C.sitting(m, chamber, 2026),
             "photo": f"{race['st'].lower()}-{last.lower()}"}  # web/img/people/<photo>.jpg, if approved
        if m:
            p["bio"] = m["bio"]
        out.append(p)
    return out


def index_of(race, raw):
    """Which listed candidate a source's name is, or None (counted as other).

    The best match wins (last and first name over last name only), so two candidates with
    one surname stay apart (Alaska: Dan Sullivan and Daniel J. Sullivan Jr.); a tie is None.
    """
    scores = [C.matches(raw, LR.last_name(name), name.split(" ", 1)[0]) for name, _ in race["cands"]]
    best = max(scores, default=0)
    return scores.index(best) if best and scores.count(best) == 1 else None


def align(race, names, votes_by_name, total):
    """Votes in the order of race["cands"], plus everyone else's as other."""
    v = [0] * len(race["cands"])
    for raw, n in votes_by_name.items():
        i = index_of(race, raw)
        if i is not None:
            v[i] += n
    return v, max(0, total - sum(v))


def previous(race, senate):
    if not race.get("prev"):
        return None
    year, seat = race["prev"]
    st = S.ABBR_TO_FIPS[race["st"]]
    r = next((x for x in senate["races"][str(year)] if x["st"] == st and x["seat"] == seat), None)
    if not r:
        return None
    rd = r["rounds"][-1]
    return {"year": year, "seat": seat, "total": rd["total"],
            "cands": [{"name": c["name"], "party": c["party"], "caucus": c["caucus"], "votes": rd["votes"][i]}
                      for i, c in enumerate(r["cands"])]}


def read_race(race, args, started):
    """(reading, source, errors) for the first source with votes."""
    errors, first_ok = [], None
    if args.replay:
        return S.read_replay(race, {}, started, args.replay), {"kind": "replay"}, errors
    for src in race["sources"]:
        try:
            r = S.READERS[src["kind"]](race, src)
        except (F.Refused, ValueError, KeyError) as e:
            errors.append(f"{src['kind']}: {e}")
            continue
        except Exception as e:  # a reader bug must not stop the other races
            errors.append(f"{src['kind']}: {type(e).__name__}: {e}")
            continue
        if r.test and not args.allow_test:
            errors.append(f"{src['kind']}: test data, not shown")
            continue
        if r.total > 0:
            return r, src, errors
        first_ok = first_ok or (r, src)
    return (*first_ok, errors) if first_ok else (None, None, errors)


def build(race, reading, src, errors, manual, calls, senate):
    now = time.time()
    out = {"id": race["id"], "st": S.ABBR_TO_FIPS[race["st"]], "office": race["office"], "seat": race["seat"],
           "polls_close": race["polls_close"], "all_closed": race.get("all_closed", race["polls_close"]),
           "cands": people(race), "prev": previous(race, senate), "errors": errors}
    kind = src["kind"] if src else None
    name, url, official = LR.SOURCE_NAMES.get(kind or "manual", ("", None, True))
    if src and src.get("name"):  # official sources that name themselves (Clarity, Enhanced Voting states)
        name, url, official = src["name"], src.get("page"), True
    m = manual.get(race["id"])
    if m:  # typed in by hand: overrides the sources
        v = [int(m["votes"].get(c["last"], 0)) for c in out["cands"]]
        total = int(m.get("total") or sum(v))
        reading = S.Reading([c["name"] for c in out["cands"]], [], v, total, pct=m.get("pct"),
                            pct_of="estimated vote counted", fetched=m["at_unix"])
        name, url, official, kind = f"Entered by hand from {m['source']}", None, False, "manual"
    if reading is None:
        out.update({"rounds": [], "counties": {}, "pct": None, "source": None, "status": "no data"})
        return out
    v, other = align(race, reading.names, dict(zip(reading.names, reading.votes)), reading.total)
    counties = {}
    for fips, c in reading.counties.items():
        if fips:
            cv, co = align(race, list(c["votes"]), c["votes"], c["total"])
            counties[fips] = cv + [co, c["total"]]
    out["counties"] = counties
    out["county_pct"] = {f: round(c["pct"], 1) for f, c in reading.counties.items() if f and c.get("pct") is not None}
    out["rounds"] = [{"kind": "general", "label": "Votes counted so far", "votes": v, "other": other,
                      "total": reading.total}]
    out["county_round"] = 0
    out["pct"] = round(reading.pct, 1) if reading.pct is not None else None
    out["pct_of"] = reading.pct_of
    out["source"] = {"name": name, "url": url, "official": official, "kind": kind,
                     "fetched": iso(reading.fetched), "as_of": reading.as_of}
    out["stale"] = bool(reading.fetched) and kind != "manual" and now - reading.fetched > STALE_AFTER
    out["test"] = reading.test
    call = calls.get(race["id"])
    if call:
        out["call"] = {"winner": next((i for i, c in enumerate(out["cands"]) if c["last"] == call["winner"]), None),
                       "by": call["by"], "at": call["at"]}
    # the page lists the leader first, like the Senate history
    order = sorted(range(len(v)), key=lambda i: -v[i])
    if out.get("call") and out["call"]["winner"] is not None:
        order.remove(out["call"]["winner"])
        order.insert(0, out["call"]["winner"])
        out["call"]["winner"] = 0
    out["cands"] = [out["cands"][i] for i in order]
    out["rounds"][0]["votes"] = [v[i] for i in order]
    out["counties"] = {f: [c[i] for i in order] + c[len(order):] for f, c in counties.items()}
    out["status"] = "counting" if reading.total else "no votes yet"
    return out


def not_up(senate):
    """The 65 Senate seats not up in 2026, and who holds each now.

    Class 1 seats were elected in 2024 and class 3 seats in 2022 (our certified results),
    except Florida's and Ohio's class 3 seats, which are up again tonight in special elections.
    A seat can change hands without an election (death or resignation and an appointment, a
    party switch, a vacancy), so each is checked against the legislator list's current members:
    where they differ, the current holder counts and the seat carries a note. Nothing stops.
    """
    by_fips = {f: a for a, f in S.ABBR_TO_FIPS.items()}
    current = {}
    for f in ("legislators-current.json",):
        for p in json.loads((C.RAW / f).read_text()):
            t = p["terms"][-1]
            if t["type"] == "sen" and t.get("class") in (1, 3) and t["end"] >= "2026-11-03":
                side = (t.get("caucus") or t.get("party") or "")[:1]
                current[(t["state"], t["class"])] = {"party": side if side in ("D", "R") else "I",
                                                     "name": p["name"].get("official_full") or p["name"]["last"]}
    seats = []
    for year, cls in (("2024", 1), ("2022", 3)):
        for r in senate["races"][year]:
            st = by_fips[r["st"]]
            if r["cls"] != cls or (year == "2022" and st in ("FL", "OH")):
                continue
            # California 2022 and 2024: a short special and the full term for the same seat
            if r["seat"] == "special" and any(x["st"] == r["st"] and x["cls"] == cls and x["seat"] == "regular"
                                              for x in senate["races"][year]):
                continue
            w = r["cands"][0]
            seat = {"st": r["st"], "cls": cls, "year": int(year), "seat": r["seat"], "elected": w["name"],
                    "elected_party": w["caucus"], "party": w["caucus"], "name": w["name"]}
            now = current.get((st, cls))
            if not now:
                seat.update(party=None, name=None, note=f"Vacant now; won in {year} by {w['name']}.")
            elif now["party"] != w["caucus"] or LR.last_name(w["name"]) not in now["name"]:
                seat.update(party=now["party"], name=now["name"],
                            note=f"Won in {year} by {w['name']} ({w['caucus']}); now held by {now['name']} ({now['party']}).")
            seats.append(seat)
    changed = [x["note"] for x in seats if x.get("note")]
    print(f"Senate seats not up: {len(seats)}; changed since their election: {len(changed)}"
          + "".join(f"\n   {n}" for n in changed), flush=True)
    before = {"D": 0, "R": 0, "I": 0}
    for p in json.loads((C.RAW / "legislators-current.json").read_text()):
        t = p["terms"][-1]
        if t["type"] == "sen" and t["end"] >= "2026-11-03":
            side = (t.get("caucus") or t.get("party") or "")[:1]
            before[side if side in ("D", "R") else "I"] += 1
    return {"seats": seats, "before": before}


PARTY = {"Democratic": "D", "Republican": "R", "Libertarian": "L", "Green": "G", "Independent": "I"}


def house(args, started, history, plans):
    """All 435 House races from one civicAPI request: {"SS-DD": race}, shaped like house.json's
    races so the page can reuse its House views, plus live fields (pct, source, status).
    The previous result is the same district in 2024, only where the state kept its map."""
    try:
        d = json.loads(F.fetch(LR.HOUSE_SEARCH))
    except (F.Refused, ValueError) as e:
        print(f"{time.strftime('%H:%M:%S')} House   none: {e}", flush=True)
        return {}
    out = {}
    for r in d.get("races", []):
        if r.get("type") != "House of Representatives" or not (r.get("election_date") or "").startswith("2026-11-03"):
            continue
        st, dist = r.get("province"), str(r.get("district") or "")
        if st not in S.ABBR_TO_FIPS or "-" not in dist:
            continue
        num = dist.split("-")[1]
        did = f"{S.ABBR_TO_FIPS[st]}-{'00' if num == 'AL' else num.zfill(2)}"
        cands, votes, other = [], [], 0
        for c in r.get("candidates") or []:
            n = int(c.get("votes") or 0)
            if "write" in c["name"].lower():
                other += n
                continue
            name = " ".join(c["name"].replace('"', "").split())
            last = LR.last_name(name)
            m = C.member(st, name.split(" ", 1)[0], last, "rep", 2026)
            p = {"name": name, "last": last, "party": PARTY.get(c.get("party"), "O"),
                 "caucus": PARTY.get(c.get("party")) if c.get("party") in ("Democratic", "Republican") else "I",
                 "inc": C.sitting(m, "rep", 2026), "photo": f"{st.lower()}-{last.lower()}"}
            if m:
                p["bio"] = m["bio"]
            cands.append(p)
            votes.append(n)
        test = bool(r.get("test_data"))
        if test and not args.allow_test:
            votes, other = [0] * len(votes), 0
        order = sorted(range(len(votes)), key=lambda i: -votes[i])
        first, last_close = LR.close_times(st)
        total = sum(votes) + other
        race = {"st": S.ABBR_TO_FIPS[st], "cands": [cands[i] for i in order],
                "rounds": [{"kind": "general", "label": "Votes counted so far", "votes": [votes[i] for i in order],
                            "other": other, "total": total}],
                "pct": r.get("percent_reporting"), "pct_of": "expected vote (civicAPI estimate)",
                "polls_close": first, "all_closed": last_close, "status": "counting" if total else "no votes yet",
                "source": {"name": "civicAPI", "url": "https://civicapi.org/", "official": False, "kind": "civicapi",
                           "fetched": iso(F.cached(LR.HOUSE_SEARCH)[1]), "as_of": None},
                "test": test and args.allow_test, "notes": [LR.HOUSE_NOTES[st]] if st in LR.HOUSE_NOTES else []}
        fips = S.ABBR_TO_FIPS[st]
        if plans.get("2026", {}).get(fips) != 2026:  # same map as 2024: same district, comparable
            prev = history.get("2024", {}).get(did)
            if prev and prev.get("rounds"):
                rd = prev["rounds"][-1]
                race["prev"] = {"year": 2024, "seat": "regular", "total": rd["total"],
                                "cands": [{"name": c["name"], "party": c["party"], "caucus": c["caucus"], "votes": rd["votes"][i]}
                                          for i, c in enumerate(prev["cands"])]}
        out[did] = race
    official = official_house(out) if not args.replay else 0
    counted = sum(1 for x in out.values() if x["rounds"][0]["total"])
    print(f"{time.strftime('%H:%M:%S')} House   {len(out)} races, {counted} with votes; "
          f"{official} from official state results, the rest civicAPI", flush=True)
    return out


def official_house(races):
    """Replace civicAPI's numbers with the state's own, district by district, where the state's
    file has the district (pipeline/live_house.py). A district keeps civicAPI if the state's
    file has no votes for it yet while civicAPI has some. Returns how many districts are official."""
    n = 0
    for st, spec in LH.HOUSE.items():
        try:
            readings = spec["read"](spec)
        except (F.Refused, ValueError, KeyError, OSError) as e:
            print(f"{time.strftime('%H:%M:%S')} House   {st}: {e}", flush=True)
            continue
        except Exception as e:  # a reader bug must not stop the night
            print(f"{time.strftime('%H:%M:%S')} House   {st}: {type(e).__name__}: {e}", flush=True)
            continue
        for d, rd in readings.items():
            race = races.get(f"{S.ABBR_TO_FIPS[st]}-{d}")
            if not race or (rd.total == 0 and race["rounds"][0]["total"] > 0):
                continue
            cands = race["cands"]
            votes = [0] * len(cands)
            for raw, v in zip(rd.names, rd.votes):
                scores = [C.matches(raw, c["last"], c["name"].split(" ", 1)[0]) for c in cands]
                best = max(scores, default=0)
                if best and scores.count(best) == 1:
                    votes[scores.index(best)] += v
            order = sorted(range(len(cands)), key=lambda i: -votes[i])
            race["cands"] = [cands[i] for i in order]
            race["rounds"] = [{"kind": "general", "label": "Votes counted so far", "votes": [votes[i] for i in order],
                               "other": rd.total - sum(votes), "total": rd.total}]
            race["pct"] = round(rd.pct, 1) if rd.pct is not None else None
            race["pct_of"] = rd.pct_of
            race["status"] = "counting" if rd.total else "no votes yet"
            race["test"] = False
            race["source"] = {"name": spec["name"], "url": None, "official": True, "kind": "official",
                              "fetched": iso(rd.fetched), "as_of": rd.as_of}
            n += 1
    return n


SNAPSHOTS = ROOT / "data" / "live" / "snapshots"
_last_snapshot = {"key": None}


def _no_times(x):
    """The data without fetch times, to tell a round that changed numbers from one that did not."""
    if isinstance(x, dict):
        return {k: _no_times(v) for k, v in x.items() if k not in ("updated", "fetched", "as_of")}
    if isinstance(x, list):
        return [_no_times(v) for v in x]
    return x


def snapshot(data, text):
    """Keep a gzipped copy of live.json when anything besides fetch times changed:
    data/live/snapshots/<UTC time>.json.gz, a record of how the night went (not committed).
    Never raises: the record is a bonus, the live page comes first."""
    try:
        key = json.dumps(_no_times(data), sort_keys=True)
        if key == _last_snapshot["key"]:
            return
        SNAPSHOTS.mkdir(parents=True, exist_ok=True)
        (SNAPSHOTS / (time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + ".json.gz")).write_bytes(
            gzip.compress(text.encode(), 6))
        _last_snapshot["key"] = key
    except OSError as e:
        print(f"snapshot: could not keep a copy of live.json: {e}")


def write(races, house_races, senate_not_up, keep=False):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"updated": iso(time.time()), "year": 2026, "races": races, "house": house_races,
            "senate_not_up": senate_not_up}
    text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(text)
    os.replace(tmp, OUT)  # the page never sees a half-written file
    if keep:
        snapshot(data, text)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--once", action="store_true", help="one round, then stop")
    ap.add_argument("--replay", type=float, metavar="MINUTES", help="test with 2024 results counted over MINUTES")
    ap.add_argument("--allow-test", action="store_true", help="show sources' own test data (for a dry run)")
    ap.add_argument("--every", type=int, default=60, help="seconds between rounds (sites are asked at most every 3 min)")
    args = ap.parse_args()
    senate = json.loads((ROOT / "web/data/senate.json").read_text())
    history = json.loads((ROOT / "web/data/house.json").read_text())["races"]
    plans = json.loads((ROOT / "web/data/house/plans.json").read_text())
    held = not_up(senate)
    started = time.time()
    if not args.replay:  # keep earlier versions of the sources too (pipeline/live_fetch.py)
        F.ARCHIVE = ROOT / "data" / "raw" / "live" / "archive"
    while True:
        manual, calls = load(MANUAL), load(CALLS)
        races = []
        for race in LR.RACES:
            reading, src, errors = read_race(race, args, started)
            r = build(race, reading, src, errors, manual, calls, senate)
            races.append(r)
            lead = ", ".join(f"{c['last']} {r['rounds'][0]['votes'][i]:,}" for i, c in enumerate(r["cands"][:2])) if r.get("rounds") else "-"
            pct = f"{r['pct']:.0f}%" if r.get("pct") is not None else "?"
            print(f"{time.strftime('%H:%M:%S')} {race['id']:7} {(r.get('source') or {}).get('kind') or 'none':9} {pct:>4}  {lead}"
                  + (f"   [{'; '.join(errors)}]" if errors else ""), flush=True)
        write(races, {} if args.replay else house(args, started, history, plans), held, keep=not args.replay)
        if args.once:
            return 0
        time.sleep(args.every)


if __name__ == "__main__":
    sys.exit(main())
