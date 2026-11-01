"""Build web/data/senate.json: US Senate results 2020-2024, statewide and by county.

Sources (see pipeline/congress.py for links):
  Statewide 2020, 2022  FEC "Federal Elections" (certified), checked against the Clerk of the
                        House statistics and MEDSL's statewide file
  Statewide 2024        MEDSL "U.S. Senate statewide 1976-2024", checked against the Clerk
                        of the House statistics; names and incumbents from the FEC ballot list
  Counties              MEDSL Senate precinct returns, summed to counties
  Senate control        computed from the winners of the last three elections (2016 and 2018
                        winners from MEDSL) and checked against the Senate's party division

Run pipeline/fetch_congress.sh first. Every disagreement between sources is printed; one
above 0.1% for a leading candidate stops the build unless it is explained in KNOWN_DIFFS.

Output shape:
{
  "years": [2020, 2022, 2024],
  "races": {"2024": [{
      "st": "04", "seat": "regular" | "special", "cls": 1,
      "cands": [{"name": "Ruben Gallego", "last": "Gallego", "party": "D", "caucus": "D", "inc": false}],
      "rounds": [{"kind": "general" | "runoff" | "rcv", "label": "...", "votes": [..], "other": n, "total": n}],
      "won": 0,                       # index into cands; decided by the last round
      "county_round": 0,              # which round the county figures are from
      "counties": {"04013": [v0, v1, ..., other, total]},
      "notes": ["..."]
  }]},
  "control": {"2024": {"D": 47, "R": 53, "note": "..."}}
}
"""

import csv
import json
import re
from collections import defaultdict

import congress as C
from build_results import norm_fips

OUT = C.ROOT / "web" / "data" / "senate.json"
YEARS = [2020, 2022, 2024]
REGULAR_CLASS = {2014: 2, 2016: 3, 2018: 1, 2020: 2, 2022: 3, 2024: 1}
# Special elections: which seat (class) they filled
SPECIAL_CLASS = {
    (2014, "HI"): 3, (2014, "OK"): 3, (2014, "SC"): 3,
    (2017, "AL"): 2, (2018, "MN"): 2, (2018, "MS"): 2,
    (2020, "AZ"): 3, (2020, "GA"): 3,
    (2022, "CA"): 3, (2022, "OK"): 2,
    (2024, "CA"): 1, (2024, "NE"): 2,
}
ELECTION_DAY = {2020: "November 3, 2020", 2022: "November 8, 2022", 2024: "November 5, 2024"}
RUNOFF_DAY = {(2020, "GA"): "January 5, 2021", (2022, "GA"): "December 6, 2022"}

# Independents who caucus with the Democrats: colored and counted with them (owner's choice)
CAUCUS_WITH_DEMOCRATS = {("ME", "King"), ("VT", "Sanders")}

# Senate seats held by the Democrats (with the independents who caucus with them) and the
# Republicans when the new Congress met. Source: US Senate, "Party Division"
# (senate.gov/history/partydiv.htm); also Ballotpedia's pages on each Congress.
CONTROL = {
    2020: {"D": 50, "R": 50, "note": "50–50, with Vice President Kamala Harris breaking ties for the Democrats."},
    2022: {"D": 51, "R": 49, "note": "Counts Kyrsten Sinema with the Democrats: she was elected as one in 2018 and left the party in December 2022, but kept her committee seats through the Democrats."},
    2024: {"D": 47, "R": 53, "note": None},
}

# Seats that changed party (by caucus), as listed by Ballotpedia and Wikipedia for each election.
# Ballotpedia also counts Arizona 2024 (independent Kyrsten Sinema's seat won by a Democrat);
# counted by caucus, as here, that seat stayed with the Democrats.
FLIPS = {
    2020: {("AL", "regular"): "R", ("AZ", "special"): "D", ("CO", "regular"): "D",
           ("GA", "regular"): "D", ("GA", "special"): "D"},
    2022: {("PA", "regular"): "D"},
    2024: {("MT", "regular"): "R", ("OH", "regular"): "R", ("PA", "regular"): "R", ("WV", "regular"): "R"},
}
LATER_NOTES = {
    (2024, "AZ", "regular"): "The seat was held by Kyrsten Sinema, elected as a Democrat in 2018, who became an independent in December 2022.",
    (2024, "CA", "regular"): "California held two Senate races on the same ballot, both between Adam Schiff and Steve Garvey: this one for the full six-year term, and a special election for the last weeks of Dianne Feinstein's term, to 3 January 2025.",
    (2024, "CA", "special"): "California held two Senate races on the same ballot, both between Adam Schiff and Steve Garvey: this one for the last weeks of Dianne Feinstein's term, to 3 January 2025 (Laphonza Butler held the seat by appointment after Feinstein died), and the regular election for the full six-year term.",
}

# Display names: the short form each candidate is commonly known by, without middle names.
# Keyed by state and the name as the official source writes it (first + last).
NAMES = {
    "Edward Markey": "Ed Markey", "Charles Schumer": "Chuck Schumer", "Richard Durbin": "Dick Durbin",
    "James Risch": "Jim Risch", "James Inhofe": "Jim Inhofe", "Christopher Coons": "Chris Coons",
    "Christopher Murphy": "Chris Murphy", "Bernard Sanders": "Bernie Sanders", "Timothy Kaine": "Tim Kaine",
    "Robert Casey": "Bob Casey", "John Reed": "Jack Reed", "Charles Grassley": "Chuck Grassley",
    "Richard Scott": "Rick Scott", "Marion Rounds": "Mike Rounds", "Rafael Cruz": "Ted Cruz",
    "Ben Lujan": "Ben Ray Luján", "Ben Luján": "Ben Ray Luján", "Shelley Capito": "Shelley Moore Capito",
    "Cindy Smith": "Cindy Hyde-Smith", "Lisa Rochester": "Lisa Blunt Rochester",
    "Trudy Valentine": "Trudy Busch Valentine", "Val Demings": "Val Demings",
    "Thomas Tillis": "Thom Tillis", "Mitch Mcconnell": "Mitch McConnell", "Merav David": "Merav Ben-David",
    "Paula Swearengin": "Paula Jean Swearengin", "Joe Perkins": "Jo Rae Perkins", "Bernard Moreno": "Bernie Moreno",
    "Blumenthal": "Richard Blumenthal", "Donald Bolduc": "Don Bolduc", "Ricky Harrington": "Ricky Dale Harrington",
    # House
    "Bonnie Coleman": "Bonnie Watson Coleman", "Debbie Schultz": "Debbie Wasserman Schultz",
    "Johnny O Olszewski": "Johnny Olszewski",
}
# Counties missing from the precinct source, shown without data
COUNTY_GAPS = {
    (2022, "IN"): "Only 36 of Indiana's 92 counties published precinct results in 2022, so the other counties have no county figures.",
}
# Corrections to the FEC figures: (year, state, seat, last name, round) -> votes.
# Each one is backed by two other sources.
VOTE_FIXES = {
    # FEC has 73,766, exactly 1,000 more. The Clerk statistics, MEDSL and the Wyoming
    # Secretary of State's official results (as cited by Ballotpedia and Wikipedia) give 72,766.
    (2020, "WY", "regular", "David", "general"): 72766,
}
# Misspelled last names in the FEC files
LAST_FIXES = {"Tilllis": "Tillis"}
# 2024: the FEC ballot list marks anyone already in Congress as an incumbent (House members
# running for the Senate too). A Senate incumbent is whoever won the seat in 2018, or was
# appointed to it since:
APPOINTED_2024 = {("NE", "Ricketts")}  # appointed January 2023 to Ben Sasse's seat
# Differences between sources that were looked up and explained.
# (year, state, seat, last name): "explanation"
KNOWN_DIFFS = {
    # Alaska publishes a first-choice summary (113,495 / 111,480, used by the Clerk) and a
    # ranked-choice tabulation whose round 1 differs slightly. The rounds shown here are the
    # FEC's (114,118 -> 115,759 -> 136,330 for Murkowski); MEDSL has the same round 1 and
    # Wikipedia the same final round. The Division of Elections' preliminary tabulation of
    # 23 November 2022 (final round 135,972) was before certification.
    (2022, "AK", "regular", "Murkowski"): "Clerk uses Alaska's first-choice summary, not RCV round 1",
    (2022, "AK", "regular", "Tshibaka"): "Clerk uses Alaska's first-choice summary, not RCV round 1",
    # FEC and the Clerk agree (1,146,966 / 872,694); MEDSL's figures predate certification.
    (2022, "MO", "regular", "Schmitt"): "MEDSL figure predates certification",
    (2022, "MO", "regular", "Valentine"): "MEDSL figure predates certification",
    # FEC and MEDSL agree with the certified result (332,490 / 275,631, also Leip's Atlas);
    # the Clerk's 332,193 / 275,928 match the election-night count.
    (2022, "NH", "regular", "Hassan"): "Clerk figure matches the election-night count",
    (2022, "NH", "regular", "Bolduc"): "Clerk figure matches the election-night count",
}


def caucus_of(st, last, party):
    if (st, last) in CAUCUS_WITH_DEMOCRATS:
        return "D"
    return {"D": "D", "R": "R"}.get(party, "I")


def party_code(raw):
    """FEC/MEDSL party labels -> D, R, L (Libertarian), G (Green), I (independent), O (other)."""
    p = raw.upper().replace("*", "").strip()
    if p == "GOP" or "PREFERS REPUBLICAN" in p:
        return "R"
    if "PREFERS DEMOCRATIC" in p:
        return "D"
    lines = re.split(r"[/,]", p)
    if any(x in ("D", "DEM", "DEMOCRAT", "DEMOCRATIC", "DFL", "DNL", "N(D)") or x.startswith("DEMOCRATIC") for x in lines):
        return "D"
    if any(x in ("R", "REP", "REPUBLICAN") for x in lines):
        return "R"
    if p in ("LIB", "LIBERTARIAN") or p.startswith("LIBERTARIAN"):
        return "L"
    if p in ("GRE", "GRN", "GREEN", "PG", "GRM") or "GREEN" in p:
        return "G"
    if p in ("IND", "INDEPENDENT", "NPA", "NPY", "UN", "UNAFFILIATED", "BP", "BY PETITION", "NO PARTY",
             "NONPARTISAN", "NO PARTY AFFILIATION", "NO AFFILIATION", "INDEPENDENT NOMINATION"):
        return "I"
    return "O"


def display_name(first, last):
    first, last = re.sub(r"^(Dr\.?|Rev\.?)\s+", "", first.strip()), LAST_FIXES.get(last.strip(), last.strip())
    nick = re.search(r"[\"“(](.+?)[\"”)]", first)
    suffix = ""
    m = re.search(r",?\s*(Jr\.?|Sr\.?|II|III|IV)$", first)
    if m:
        suffix, first = m.group(1), first[:m.start()]
    if nick:
        given = nick.group(1)
    else:
        words = [w for w in first.replace(",", " ").split() if not re.fullmatch(r"[A-Z]\.?", w)]
        given = words[0] if words else first
    last = last.title() if last.isupper() else last
    full = f"{given} {last}".strip()
    return NAMES.get(full, full)  # suffixes (Jr.) are left out, as most coverage does


# ---------- statewide results ----------

def races_from_fec(year):
    races = {}
    for r in C.fec_rows(year, "S"):
        seat = "special" if "UNEXPIRED" in r["district"] else "regular"
        race = races.setdefault((r["st"], seat), {"cands": {}, "other": [0, 0], "total": None, "rcv_total": None})
        if "TOTAL" in r["label"].upper():
            race["total"] = (r["gen"], r["runoff"])
            race["rcv_total"] = r["rcv"]
            continue
        if r["label"]:
            continue  # "Party Votes:" subtotals from the primaries
        if r["id"] in ("", "n/a"):  # scattered write-ins
            race["other"][0] += r["gen"] or 0
            race["other"][1] += r["runoff"] or 0
            continue
        if r["gen"] is None and r["runoff"] is None and not any(r["rcv"]):
            continue  # lost in the primary
        c = race["cands"].setdefault((r["id"], C.plain(r["first"] + " " + r["last"])), {"id": r["id"], "first": r["first"], "last": r["last"], "parties": [],
                                               "gen": 0, "runoff": None, "rcv": None, "won": False, "inc": r["inc"]})
        c["parties"].append(r["party"])
        c["gen"] += r["gen"] or 0
        if r["runoff"] is not None:
            c["runoff"] = (c["runoff"] or 0) + r["runoff"]
        if any(r["rcv"]):
            c["rcv"] = r["rcv"]
        c["won"] |= r["won"]
    out = {}
    for (st, seat), race in races.items():
        cands = list(race["cands"].values())
        fec_total = sum(c["gen"] for c in cands) + race["other"][0]
        assert fec_total == race["total"][0], f"{year} {st} {seat}: FEC total {race['total'][0]} is not the sum {fec_total}"
        for c in cands:
            fix = VOTE_FIXES.get((year, st, seat, c["last"].strip(), "general"))
            if fix is not None:
                race["total"] = (race["total"][0] - c["gen"] + fix, race["total"][1])
                c["gen"] = fix
        for c in cands:
            codes = [party_code(p) for p in c["parties"]]
            c["party"] = "D" if "D" in codes else "R" if "R" in codes else codes[0]
        rounds = []
        if any(c["rcv"] for c in cands):
            n = len(cands[0]["rcv"] or [])
            for i in range(n):
                votes = [(c["rcv"] or [0] * n)[i] or 0 for c in cands]
                if not any(votes):
                    continue
                total = race["rcv_total"][i]
                rounds.append({"kind": "rcv", "round": i + 1, "votes": votes, "other": total - sum(votes), "total": total})
        else:
            gen_total = race["total"][0]
            rounds.append({"kind": "general", "votes": [c["gen"] for c in cands],
                           "other": gen_total - sum(c["gen"] for c in cands), "total": gen_total})
            if any(c["runoff"] for c in cands):
                rounds.append({"kind": "runoff", "votes": [c["runoff"] or 0 for c in cands], "other": race["other"][1],
                               "total": race["total"][1]})
        out[(st, seat)] = {"cands": cands, "rounds": rounds, "fec_won": [c["won"] for c in cands]}
    # the FEC marks a state's only race as plain "S" even when it was a special election (Arizona 2020)
    for st in {st for st, _ in out}:
        if (year, st) in SPECIAL_CLASS and (st, "special") not in out:
            out[(st, "special")] = out.pop((st, "regular"))
    return out


def medsl_statewide():
    """MEDSL statewide rows: {(year, st, seat): {stage: {plain name: [name, party, votes]}}}."""
    out = defaultdict(lambda: defaultdict(dict))
    with open(C.RAW / "senate-state-1976-2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            year = int(r["year"])
            if year < 2014:
                continue
            seat = "special" if r["special"].upper() == "TRUE" else "regular"
            stage = "runoff" if "RUNOFF" in r["stage"].upper() else "general"
            cycle = year - 1 if year % 2 else year  # Georgia's January 2021 runoffs belong to 2020
            if (year, r["state_po"]) == (2017, "AL"):
                cycle = 2017
            key = C.plain(r["candidate"])
            if C.NOT_VOTES.match(key):
                continue
            if not key or C.OTHER_VOTES.match(key):
                key = "OTHER"
            rec = out[(cycle, r["state_po"], seat)][stage].setdefault(key, [r["candidate"], r["party_detailed"], 0])
            rec[2] += C.num(r["candidatevotes"]) or 0
            if party_code(r["party_detailed"]) in ("D", "R"):
                rec[1] = r["party_detailed"]  # fusion: keep the major-party line (Schumer: Democratic, not Working Families)
    return out


def races_from_medsl_2024(medsl, ballot):
    out = {}
    for (year, st, seat), stages in medsl.items():
        if year != 2024:
            continue
        listed = ballot.get((st, "S", seat), [])
        cands, other = [], 0
        for key, (raw, party, votes) in sorted(stages["general"].items(), key=lambda kv: -kv[1][2]):
            if key == "OTHER":
                other += votes
                continue
            i = C.best_match(raw, listed)
            if i is None:
                if votes < 0.005 * sum(v[2] for v in stages["general"].values()):
                    other += votes
                    continue
                raise SystemExit(f"2024 {st} {seat}: {raw} is not on the FEC ballot list")
            b = listed[i]
            same = next((c for c in cands if (c["first"], c["last"]) == (b["first"], b["last"])), None)
            if same:
                same["gen"] += votes  # second party line (fusion)
                same["parties"].append(party)
                continue
            cands.append({"id": b["id"], "first": b["first"], "last": b["last"], "parties": [b["party"], party],
                          "gen": votes, "inc": b["inc"]})
        for c in cands:
            codes = [party_code(p) for p in c["parties"]]
            c["party"] = "D" if "D" in codes else "R" if "R" in codes else codes[0]
        total = sum(c["gen"] for c in cands) + other
        out[(st, seat)] = {"cands": cands, "rounds": [{"kind": "general", "votes": [c["gen"] for c in cands],
                                                       "other": other, "total": total}], "fec_won": None}
    return out


# ---------- checks between sources ----------

problems = []


def check(year, st, seat, race, label, other_source, tolerance=0.001):
    """Compare each leading candidate's deciding-round votes with another source."""
    final = race["rounds"][-1]
    if final["kind"] == "rcv":
        final = race["rounds"][0]  # other sources give first-choice votes
    order = sorted(range(len(race["cands"])), key=lambda i: -final["votes"][i])[:2]
    for i in order:
        c, mine = race["cands"][i], final["votes"][i]
        j = C.best_match(c["first"] + " " + c["last"], [{"first": n.split()[0] if n.split() else "", "last": n.split()[-1] if n.split() else ""} for n in other_source.get("names", [])])
        theirs = other_source["votes"][j] if j is not None else None
        if theirs is None:
            j = next((k for k, n in enumerate(other_source.get("names", [])) if C.matches(n, c["last"])), None)
            theirs = other_source["votes"][j] if j is not None else None
        if theirs is None:
            problems.append((year, st, seat, c["last"], label, "not found", mine, None))
            continue
        if theirs == mine:
            continue
        # a footnote marker glued in front of a Clerk number: "2,269,923" read as "22,269,923"
        if label == "Clerk" and str(theirs).endswith(str(mine)) and len(str(theirs)) == len(str(mine)) + 1:
            continue
        rel = abs(theirs - mine) / max(mine, 1)
        explained = KNOWN_DIFFS.get((year, st, seat, c["last"]))
        problems.append((year, st, seat, c["last"], label, f"{rel:.3%}" + (" (explained)" if explained else ""), mine, theirs))
        if rel > tolerance and not explained:
            problems[-1] = problems[-1] + ("STOP",)


def clerk_source(clerk_race):
    return {"names": [c["name"] for c in clerk_race["cands"]], "votes": [c["votes"] for c in clerk_race["cands"]]}


def medsl_source(stages, kind):
    rows = stages.get("runoff" if kind == "runoff" else "general", {})
    names = [v[0] for k, v in rows.items() if k != "OTHER"]
    return {"names": names, "votes": [v[2] for k, v in rows.items() if k != "OTHER"]}


# ---------- counties ----------

def county_votes(year, races):
    """Sum MEDSL precinct rows to counties for each race. Returns {(st, seat): {stage: {fips: [..]}}}."""
    path = C.RAW / f"senate-precinct-{year}.csv"
    if not path.exists():
        print(f"  {year}: no precinct file ({path.name}); counties left out")
        return {}
    by_key = defaultdict(lambda: {"total": 0, "modes": 0, "has_total": False})
    suppressed = defaultdict(int)
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            seat = "special" if r["special"].upper() == "TRUE" else "regular"
            stage = "runoff" if "RUNOFF" in r["stage"].upper() else "general"
            if re.search(r"\bTOTALS?$", r["precinct"].strip().upper()):
                continue  # county subtotal rows (Idaho 2022)
            if r["votes"].strip() == "*":
                suppressed[(r["state_po"], seat)] += 1
            v = C.num(r["votes"]) or 0
            # one record per candidate per precinct, whatever the party line or spelling
            k = (r["state_po"], seat, stage, r["county_fips"], r["jurisdiction_fips"], r["precinct"].strip().upper(),
                 C.plain(r["candidate"]), r["party_detailed"])
            rec = by_key[k]
            if r["mode"].strip().upper() == "TOTAL":
                rec["total"] += v
                rec["has_total"] = True
            else:
                rec["modes"] += v
    out = defaultdict(lambda: defaultdict(dict))
    unmatched = defaultdict(int)
    for (st, seat, stage, fips, _, _, cand, _), rec in by_key.items():
        if (st, seat) not in races:
            continue
        votes = rec["total"] if rec["has_total"] else rec["modes"]
        raw = (fips or "").strip().split(".")[0]
        if not raw and st == "AK":
            raw = "02000"  # Alaska reports by house district: one statewide area
        if not raw:
            unmatched[(st, seat, "no county")] += votes
            continue
        if raw.zfill(5) == "36000" and st == "MO":
            raw = "29095"  # Kansas City, counted in Jackson County as in the presidential data
        fips = norm_fips(raw)
        race = races[(st, seat)]
        n = len(race["cands"])
        row = out[(st, seat)][stage].setdefault(fips, [0] * (n + 2))
        key = C.plain(cand)
        if C.NOT_VOTES.match(key) or key in ("UNDERVOTES", "OVERVOTES", "UNDER VOTES", "OVER VOTES"):
            continue
        if not key or C.OTHER_VOTES.match(key):
            row[n] += votes  # write-ins and scattered votes
        else:
            i = C.best_match(cand, race["cands"])
            if i is None:
                # not a candidate on the ballot: ballot counts ("PUBLIC COUNTER"), blanks,
                # unqualified write-ins. Left out of the totals and reported below.
                if votes:
                    unmatched[(st, seat, cand)] += votes
                continue
            row[i] += votes
        row[n + 1] += votes
    return out, suppressed, unmatched


# ---------- Senate control ----------

def control_after(year, winners):
    """Seats by caucus after `year`: the latest winner of every seat elected up to then."""
    seats = {}
    for (y, st, cls), caucus in sorted(winners.items()):
        if y <= year:
            seats[(st, cls)] = caucus
    assert len(seats) == 100, (year, len(seats))
    return {"D": sum(c == "D" for c in seats.values()), "R": sum(c == "R" for c in seats.values())}


def main():
    medsl = medsl_statewide()
    ballot = C.fec_ballot_2024()
    clerk = {y: C.clerk_senate(y) for y in YEARS}
    data = {"years": YEARS, "races": {}, "control": {}}
    winners = {}  # (year, st, class) -> caucus
    flips_seen = defaultdict(dict)
    prev_last = {}  # (year, st, class) -> winner's last name, upper case

    # Seat winners missing from MEDSL, which has no odd-year elections: Doug Jones (D) won
    # Alabama's special election on December 12, 2017 (Ballotpedia; Wikipedia)
    winners[(2017, "AL", 2)] = "D"
    # earlier winners (2014-2018) from MEDSL, only to know who held each seat
    for (year, st, seat), stages in medsl.items():
        if year >= 2020:
            continue
        rows = stages.get("runoff") or stages["general"]
        raw, party, _ = max((v for k, v in rows.items() if k != "OTHER"), key=lambda v: v[2])
        last = C.name_tokens(raw)[-1].title()
        cls = SPECIAL_CLASS[(year, st)] if seat == "special" else REGULAR_CLASS[year]
        prev_last[(year, st, cls)] = C.name_tokens(raw)[-1]
        winners[(year, st, cls)] = caucus_of(st, last, party_code(party))

    for year in YEARS:
        races = races_from_fec(year) if year in (2020, 2022) else races_from_medsl_2024(medsl, ballot)
        missing = set(clerk[year]) - set(races)
        assert not missing, f"{year}: races in the Clerk statistics but not in the source: {missing}"
        for (st, seat), race in races.items():
            check(year, st, seat, race, "Clerk", clerk_source(clerk[year][(st, seat)]))
            if year < 2024 and (year, st, seat) in medsl:
                kind = race["rounds"][-1]["kind"] if race["rounds"][-1]["kind"] != "rcv" else "general"
                check(year, st, seat, race, "MEDSL", medsl_source(medsl[(year, st, seat)], kind))

        counties, suppressed, unmatched = county_votes(year, races) or ({}, {}, {})
        out = []
        for (st, seat), race in sorted(races.items()):
            cands = race["cands"]
            final = race["rounds"][-1]
            order = sorted(range(len(cands)), key=lambda i: -final["votes"][i])
            if race["rounds"][-1]["kind"] == "rcv" or len(race["rounds"]) > 1:
                first = race["rounds"][0]
                order = sorted(order, key=lambda i: (-final["votes"][i], -first["votes"][i]))
            won = order[0]
            if race["fec_won"] is not None:
                assert race["fec_won"][won], f"{year} {st} {seat}: FEC marks someone else as the winner"
            cls = SPECIAL_CLASS[(year, st)] if seat == "special" else REGULAR_CLASS[year]
            fips_state = C.ABBR[st]
            people = []
            for i in order:
                c = cands[i]
                last = LAST_FIXES.get(c["last"].strip(), c["last"].strip())
                last = last.title() if last.isupper() else last
                inc = c["inc"]
                if year == 2024:
                    inc = inc and (prev_last.get((2018, st, cls)) == C.plain(last) or (st, last) in APPOINTED_2024)
                person = {"name": display_name(c["first"], c["last"]), "last": last,
                          "party": c["party"], "caucus": caucus_of(st, last, c["party"]), "inc": inc}
                m = C.member(st, c["first"], last, "sen", int(year), c.get("id"),
                             served=i == order[0] or person["inc"])
                person["inc"] = C.sitting(m, "sen", int(year))
                if m:
                    person["bio"] = m["bio"]  # Congress ID: names the official portrait
                    full = C.full_surname(last, m)
                    if full:  # "Sheila Lee" -> "Sheila Jackson Lee"
                        person["last"], person["name"] = full, display_name(c["first"], full)
                    if person["name"] not in NAMES.values():  # names set by hand stay
                        person["name"] = C.known_as(person["name"], m)
                people.append(person)
            before = [y for (y, s2, c2) in winners if s2 == st and c2 == cls and y < year]
            held = winners[(max(before), st, cls)] if before else None
            winners[(year, st, cls)] = people[0]["caucus"]
            rounds = []
            for rd in race["rounds"]:
                label = {"general": f"General election, {ELECTION_DAY[year]}",
                         "runoff": f"Runoff, {RUNOFF_DAY.get((year, st), '')}",
                         "rcv": f"Ranked-choice round {rd.get('round')}"}[rd["kind"]]
                rounds.append({"kind": rd["kind"], "label": label, "votes": [rd["votes"][i] for i in order],
                               "other": rd["other"], "total": rd["total"]})
            notes = []
            c_round = None
            county = {}
            if (st, seat) in counties:
                stages = counties[(st, seat)]
                use = "runoff" if race["rounds"][-1]["kind"] == "runoff" and "runoff" in stages else "general"
                c_round = next(i for i, rd in enumerate(race["rounds"]) if rd["kind"] == ("runoff" if use == "runoff" else race["rounds"][0]["kind"]))
                n = len(cands)
                for fips, row in stages[use].items():
                    if not row[n + 1]:
                        continue
                    county[fips] = [row[i] for i in order] + [row[n], row[n + 1]]
                # how close the county sums come to the official statewide figures:
                # within 0.5% shown as is, up to 2% shown with a note, beyond that left out
                worst = 0
                for k, i in enumerate(order[:2]):
                    official = race["rounds"][c_round]["votes"][i]
                    summed = sum(v[k] for v in county.values())
                    rel = (summed - official) / max(official, 1)
                    if abs(rel) > 0.005:
                        print(f"  counties {year} {st} {seat} {cands[i]['last']}: county sum {summed:,} vs official {official:,} ({rel:+.2%})")
                    if abs(rel) > abs(worst):
                        worst = rel
                if abs(worst) > 0.02 and (year, st) not in COUNTY_GAPS:
                    county, c_round = {}, None
                    notes.append("County figures are not shown: the county-level source does not add up to the official statewide result.")
                    print(f"  -> {year} {st} {seat}: counties left out")
                elif abs(worst) > 0.005:
                    notes.append(f"County figures add up to {abs(worst):.1%} {'more' if worst > 0 else 'fewer'} votes than the official statewide result.")
                if (year, st) in COUNTY_GAPS:
                    notes = [COUNTY_GAPS[(year, st)]]
                if suppressed.get((st, seat)) and county:
                    notes.append("The county source withholds the counts of some very small precincts, so county figures fall slightly short of the statewide total.")
            elif st != "AK" and counties:
                notes.append("County figures are not available: the county-level source has no results for this race.")
            elif st != "AK":
                notes.append(f"County figures for {year} are not available yet.")
            if st == "AK":
                # one statewide area: it takes the official statewide result of the deciding round
                c_round, notes = len(rounds) - 1, []
                county = {"02000": rounds[-1]["votes"] + [rounds[-1]["other"], rounds[-1]["total"]]}
            notes = ([LATER_NOTES[(year, st, seat)]] if (year, st, seat) in LATER_NOTES else []) + notes
            flips_seen[year][(st, seat)] = people[0]["caucus"] if held and held != people[0]["caucus"] else None
            out.append({"st": fips_state, "seat": seat, "cls": cls, "held": held, "cands": people, "rounds": rounds, "won": 0,
                        "county_round": c_round, "counties": county, "notes": notes})
        data["races"][str(year)] = out
        for (st, seat, cand), v in sorted(unmatched.items()):
            if v > 1000:
                print(f"  unmatched precinct votes {year} {st} {seat}: {cand} {v:,}")

    for year in YEARS:
        got = {k: v for k, v in flips_seen[year].items() if v}
        assert got == FLIPS[year], f"{year} flips: computed {got}, expected {FLIPS[year]}"
        got = control_after(year, winners)
        want = CONTROL[year]
        assert got == {"D": want["D"], "R": want["R"]}, f"Senate after {year}: computed {got}, expected {want}"
        data["control"][str(year)] = want

    C.one_name_per_person(data["races"], set(NAMES.values()))
    print("Differences between sources (votes for the two leading candidates):")
    stop = False
    for p in problems:
        print("  ", *p)
        stop |= p[-1] == "STOP"
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
    if stop:
        raise SystemExit("Unexplained differences above 0.1% (marked STOP): look them up and add to KNOWN_DIFFS")


if __name__ == "__main__":
    main()
