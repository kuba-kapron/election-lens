"""Build web/data/us/house.json: US House results 2020-2024 by congressional district.

Sources (see pipeline/us/congress/sources.py for links):
  2020, 2022  FEC "Federal Elections" (certified), checked against the Clerk of the House
              statistics
  2024        Clerk of the House statistics (certified), checked against MEDSL's House
              precinct returns summed by district; names and incumbents from the FEC
              2024 ballot list
District shapes come from pipeline/us/congress/build_house_geo.sh (web/data/us/house/<year>.json).

Every disagreement between sources is printed. One above 0.1% for a leading candidate
(between official sources), or a different winner (against MEDSL), stops the build unless
it is explained in KNOWN_DIFFS.

Output shape:
{
  "years": [2020, 2022, 2024],
  "races": {"2024": {"06-12": {
      "cands": [{"name": "...", "last": "...", "party": "D", "caucus": "D", "inc": true}],
      "rounds": [{"kind": "general" | "runoff" | "rcv", "label": "...", "votes": [..], "other": n, "total": n}],
      "won": 0, "unopposed": false, "notes": ["..."]
  }}},
  "seats": {"2024": {"D": 215, "R": 220}},
  "popular": {"2024": [dem, gop, total]}
}
"""

import csv
import json
import re
from collections import defaultdict

from pipeline.us.congress import sources as C
from pipeline.us.congress.build_senate import ELECTION_DAY, NAMES, caucus_of, display_name, party_code

OUT = C.ROOT / "web" / "data" / "us" / "house.json"
YEARS = [2020, 2022, 2024]
RUNOFF_DAY = {2020: "December 5, 2020", 2022: "December 10, 2022"}  # Louisiana

# Seats won by each party in the general election (before any later vacancies).
# Sources: Clerk of the House, "Party Divisions of the House of Representatives"
# (history.house.gov/Institution/Party-Divisions); also The Green Papers.
SEATS = {2020: {"D": 222, "R": 213}, 2022: {"D": 213, "R": 222}, 2024: {"D": 215, "R": 220}}

# Ranked-choice rounds missing from the official 2024 source (the Clerk's footnotes do not
# survive text extraction) and not confirmed by two other sources: a note instead of numbers.
RCV_NOTES = {
    (2024, "AK", "00"): "Alaska counted ranked choices because no one won a majority of first choices; "
                        "Nick Begich won the final round. These are the first-choice votes: the final-round "
                        "figures could not be confirmed from two sources yet.",
    (2024, "ME", "02"): "Maine counted ranked choices because no one won a majority of first choices. "
                        "These are the final-round votes; the first round is not shown because only "
                        "preliminary figures could be found.",
}
# Events after the election that the panel should mention (source: the FEC's footnotes)
LATER = {
    (2020, "LA", "05"): "Luke Letlow won the runoff but died on December 29, 2020, before taking office. "
                        "Julia Letlow (R) won the special election on March 20, 2021.",
}
# Races where the FEC marks no winner, and why the build accepts the vote leader anyway
NO_FEC_WINNER = {
    (2020, "LA", "05"): "winner died before taking office (see LATER)",
    (2022, "IN", "02"): "the FEC marks Yakym's win only on the same-day special election for the rest "
                        "of the term; he also led the full-term race, 125,537 to 62,955",
}
# Corrections to FEC figures, each backed by two other sources: (year, st, district, last) -> votes
VOTE_FIXES = {
    # FEC 233,864; the Clerk statistics, Ballotpedia and Wikipedia give 238,864
    (2020, "OH", "14", "Joyce"): 238864,
}
# Differences between the FEC and the Clerk that were looked up. (year, st, district, last)
_NY2020 = "Clerk's New York figures predate the final absentee count (checked for NY-1: FEC matches the certified result per Ballotpedia and Wikipedia)"
_AK = "Clerk uses Alaska's first-choice summary, not ranked-choice round 1"
KNOWN_DIFFS = {
    (2020, "NY", "01", "Zeldin"): _NY2020, (2020, "NY", "01", "Goroff"): _NY2020,
    (2020, "NY", "18", "Maloney"): _NY2020, (2020, "NY", "24", "Katko"): _NY2020, (2020, "NY", "24", "Balter"): _NY2020,
    (2020, "VA", "02", "Taylor"): "Clerk lists an unnamed Independent line under Taylor; Virginia has no fusion voting, so it is another candidate",
    (2022, "GA", "07", "Gonsalves"): "Clerk typo: FEC's 91,262 matches Ballotpedia and Wikipedia",
    (2022, "AK", "00", "Peltola"): _AK, (2022, "AK", "00", "Palin"): _AK,
    # Not settled: under 0.2%, winner not affected; FEC figure kept
    (2020, "ND", "00", "Raknerud"): "unresolved: FEC 98,089, Clerk 97,970 (also NBC's count)",
    (2022, "IN", "02", "Yakym"): "unresolved: FEC 125,537, Clerk 125,313, Wikipedia 125,222",
    (2022, "IN", "02", "Steury"): "unresolved: FEC 62,955, Clerk 62,891, Wikipedia 62,726",
}


def clerk_split(name):
    """'Nancy S. Goroff' -> first 'Nancy S.', last 'Goroff'; 'Donald M. Payne, Jr.' -> last 'Payne'."""
    name = re.sub(r",?\s+(Jr\.?|Sr\.?|II|III|IV)$", "", name.strip())
    parts = name.split()
    for k in range(len(parts) - 1, 0, -1):  # keep two-word surnames joined by a particle
        if parts[k - 1].lower() in ("de", "del", "la", "van", "von", "st.", "mc"):
            return {"first": " ".join(parts[:k - 1]), "last": " ".join(parts[k - 1:])}
    return {"first": " ".join(parts[:-1]), "last": parts[-1] if parts else ""}


def split_with_surname(name, surname):
    """Split the Clerk's name using the FEC surname when the Clerk's name contains it exactly
    ('Debbie Wasserman Schultz' + 'Wasserman Schultz'); otherwise guess (clerk_split)."""
    toks, want = name.split(), surname.split()
    plain = [C.plain(t) for t in toks]
    wp = [C.plain(t) for t in want]
    for i in range(len(toks) - len(want), 0, -1):
        if plain[i:i + len(want)] == wp:
            return {"first": " ".join(toks[:i]), "last": " ".join(toks[i:i + len(want)]).rstrip(",")}
    return clerk_split(name)


def district_key(st, district):
    return f"{C.ABBR[st]}-{district}"


# ---------- official results ----------

def races_from_fec(year):
    races = {}
    for r in C.fec_rows(year, "H"):
        d = r["district"]
        if r["st"] == "DC":
            continue  # non-voting delegate
        if not d or d == "H" or "UNEXPIRED" in d:
            continue  # state totals; same-day special elections for an unexpired term
        d = d.split("-")[0].zfill(2)
        race = races.setdefault((r["st"], d), {"cands": {}, "other": [0, 0], "rcv_total": None})
        if "TOTAL" in r["label"].upper() or "DISTRICT VOTES" in r["label"].upper():
            race["rcv_total"] = r["rcv"]
            continue
        if r["label"]:
            continue  # primary subtotals
        if r["id"] in ("", "n/a"):
            race["other"][0] += r["gen"] or 0
            race["other"][1] += r["runoff"] or 0
            continue
        if r["gen"] is None and r["runoff"] is None and not r["won"] and not any(r["rcv"]):
            continue  # lost in the primary
        c = race["cands"].setdefault((r["id"], C.plain(r["first"] + " " + r["last"])), {"id": r["id"], "first": r["first"], "last": r["last"], "parties": [],
                                               "gen": None, "runoff": None, "rcv": None, "won": False, "inc": r["inc"]})
        c["parties"].append(r["party"])
        if r["gen"] is not None:
            c["gen"] = (c["gen"] or 0) + r["gen"]
        if r["runoff"] is not None:
            c["runoff"] = (c["runoff"] or 0) + r["runoff"]
        if any(r["rcv"]):
            c["rcv"] = r["rcv"]
        c["won"] |= r["won"]
    out = {}
    for (st, d), race in races.items():
        cands = [c for c in race["cands"].values() if c["gen"] is not None or c["won"] or c["runoff"]]
        for c in cands:
            fix = VOTE_FIXES.get((year, st, d, c["last"].strip()))
            if fix is not None:
                c["gen"] = fix
        for c in cands:
            codes = [party_code(p) for p in c["parties"]]
            c["party"] = "D" if "D" in codes else "R" if "R" in codes else codes[0]
        unopposed = all(c["gen"] is None for c in cands)
        rounds = []
        if not unopposed:
            gen = [c["gen"] or 0 for c in cands]
            rounds.append({"kind": "general", "votes": gen, "other": race["other"][0],
                           "total": sum(gen) + race["other"][0]})
        if any(c["rcv"] for c in cands):
            n = max(len(c["rcv"] or []) for c in cands)
            for i in range(n):
                votes = [((c["rcv"] or [None] * n)[i]) for c in cands]
                if all(v is None for v in votes) or not any(votes):
                    continue
                votes = [v or 0 for v in votes]
                total = race["rcv_total"][i] if race["rcv_total"] and race["rcv_total"][i] else sum(votes)
                if i == 0 or not rounds or rounds[-1]["kind"] != "general" or i > 0:
                    rounds.append({"kind": "rcv", "round": i + 1, "votes": votes, "other": total - sum(votes), "total": total})
            # round 1 equals the general election count: keep one of them
            if len(rounds) > 1 and rounds[0]["kind"] == "general" and rounds[1].get("round") == 1:
                rounds.pop(0)
        if any(c["runoff"] for c in cands):
            votes = [c["runoff"] or 0 for c in cands]
            rounds.append({"kind": "runoff", "votes": votes, "other": race["other"][1],
                           "total": sum(votes) + race["other"][1]})
        out[(st, d)] = {"cands": cands, "rounds": rounds, "fec_won": [c["won"] for c in cands], "unopposed": unopposed}
    return out


def races_from_clerk_2024(clerk, ballot):
    out = {}
    for (st, d), race in clerk.items():
        listed = ballot.get((st, "00" if d == "00" else d, "regular"), []) or ballot.get((st, "AL", "regular"), [])
        cands = []
        for c in race["cands"]:
            # names as the Clerk prints them; the FEC ballot list only says who is an incumbent
            i = C.best_match(c["name"], listed) if listed else None
            inc = listed[i]["inc"] if i is not None else False
            split = split_with_surname(c["name"], listed[i]["last"]) if i is not None else clerk_split(c["name"])
            first, last = split["first"], split["last"]
            cands.append({"id": listed[i]["id"] if i is not None else None, "first": first, "last": last,
                          "party": party_code(c["party"]), "gen": c["votes"], "inc": inc})
        unopposed = all(c["gen"] is None for c in cands)
        rounds = []
        if not unopposed:
            gen = [c["gen"] or 0 for c in cands]
            kind = "rcv" if (2024, st, d) in RCV_NOTES else "general"
            rounds.append({"kind": kind, "votes": gen, "other": race["other"], "total": sum(gen) + race["other"]})
            if kind == "rcv":
                rounds[-1]["round"] = 1 if st == "AK" else None
        out[(st, d)] = {"cands": cands, "rounds": rounds, "fec_won": None, "unopposed": unopposed}
    return out


# ---------- checks ----------

problems = []


def compare(year, st, d, race, label, names, votes, tolerance):
    rd = race["rounds"][-1] if race["rounds"] else None
    if rd is None:
        return
    order = sorted(range(len(race["cands"])), key=lambda i: -rd["votes"][i])[:2]
    their = [{"first": "", "last": n} for n in names]
    for i in order:
        c, mine = race["cands"][i], rd["votes"][i]
        j = C.best_match(c["first"] + " " + c["last"], [clerk_split(n) for n in names])
        theirs = votes[j] if j is not None else None
        if theirs is None:
            problems.append((year, st, d, c["last"], label, "not found", mine, None))
            continue
        if theirs == mine:
            continue
        if label == "Clerk" and str(theirs).endswith(str(mine)) and len(str(theirs)) <= len(str(mine)) + 2:
            continue  # a footnote marker glued in front of the Clerk's number
        rel = abs(theirs - mine) / max(mine, 1)
        explained = KNOWN_DIFFS.get((year, st, d, c["last"]))
        row = (year, st, d, c["last"], label, f"{rel:.3%}" + (" (explained)" if explained else ""), mine, theirs)
        if rel > tolerance and not explained:
            row += ("STOP",)
        problems.append(row)
    del their


def medsl_2024_by_district():
    """MEDSL 2024 House precinct rows summed by district and candidate."""
    path = C.RAW / "house-precinct-2024.csv"
    if not path.exists():
        return None
    by_key = defaultdict(lambda: {"total": 0, "modes": 0, "has_total": False})
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            if r["stage"].upper() != "GEN" or r["special"].upper() == "TRUE":
                continue
            d = r["district"].strip()
            d = "00" if d.upper() in ("AT LARGE", "AT-LARGE", "0", "000") else d.lstrip("0").zfill(2)[-2:]
            k = (r["state_po"], d, r["county_fips"], r["jurisdiction_fips"], r["precinct"].strip().upper(),
                 C.plain(r["candidate"]))
            v = C.num(r["votes"]) or 0
            if r["mode"].strip().upper() == "TOTAL":
                by_key[k]["total"] += v
                by_key[k]["has_total"] = True
            else:
                by_key[k]["modes"] += v
    out = defaultdict(lambda: defaultdict(int))
    for (st, d, _, _, _, cand), rec in by_key.items():
        out[(st, d)][cand] += rec["total"] if rec["has_total"] else rec["modes"]
    return out


# ---------- build ----------

def main():
    ballot = C.fec_ballot_2024()
    data = {"years": YEARS, "races": {}, "seats": {}, "popular": {}}
    for year in YEARS:
        clerk = C.clerk_house(year)
        races = races_from_fec(year) if year < 2024 else races_from_clerk_2024(clerk, ballot)
        assert len(races) == 435, f"{year}: {len(races)} districts"
        medsl = medsl_2024_by_district() if year == 2024 else None
        out, seats, popular = {}, defaultdict(int), [0, 0, 0]
        for (st, d), race in sorted(races.items()):
            if year < 2024 and race["rounds"]:
                cr = clerk.get((st, d))
                if cr:
                    compare(year, st, d, race, "Clerk", [c["name"] for c in cr["cands"]],
                            [c["votes"] for c in cr["cands"]], 0.001)
            if medsl is not None and race["rounds"] and medsl.get((st, d)):
                # MEDSL's 2024 precinct file is incomplete or double counted in several states,
                # so it is only used to confirm the winner
                m = medsl[(st, d)]
                named = {k: v for k, v in m.items() if not C.NOT_VOTES.match(k) and not C.OTHER_VOTES.match(k) and k}
                rd = race["rounds"][-1]
                lead = race["cands"][max(range(len(race["cands"])), key=lambda i: rd["votes"][i])]
                top = max(named, key=named.get) if named else None
                if top and C.best_match(top, [lead, {"first": "", "last": "zzzz"}]) != 0:
                    problems.append((year, st, d, lead["last"], "MEDSL", "different winner", None, max(named, key=named.get), "STOP"))

            cands = race["cands"]
            final = race["rounds"][-1] if race["rounds"] else None
            if final:
                first = race["rounds"][0]
                order = sorted(range(len(cands)), key=lambda i: (-final["votes"][i], -first["votes"][i]))
            else:
                order = sorted(range(len(cands)), key=lambda i: not (race["fec_won"] or [False] * len(cands))[i])
            if race["fec_won"] is not None and any(race["fec_won"]):
                assert race["fec_won"][order[0]], f"{year} {st}-{d}: FEC marks someone else as the winner"
            elif race["fec_won"] is not None:
                assert (year, st, d) in NO_FEC_WINNER, f"{year} {st}-{d}: the FEC marks no winner"
            people = []
            official = [c["name"] for c in clerk.get((st, d), {}).get("cands", [])]
            for i in order:
                c = cands[i]
                first, last = c["first"], c["last"].strip()
                # names as the Clerk prints them: the FEC files have typos ("Longdrigan", "Norcoss")
                j = C.best_match(first + " " + last, [clerk_split(n) for n in official]) if official else None
                if j is not None:
                    split = split_with_surname(official[j], last)
                    first, last = split["first"], split["last"]
                last = last.title() if last.isupper() else last
                person = {"name": display_name(first, last), "last": last, "party": c["party"],
                          "caucus": caucus_of(st, last, c["party"]), "inc": c["inc"]}
                m = C.member(st, first, last, "rep", int(year), c.get("id"),
                             served=i == order[0] or person["inc"])
                person["inc"] = C.sitting(m, "rep", int(year))
                if m:
                    person["bio"] = m["bio"]  # Congress ID: names the official portrait
                    full = C.full_surname(last, m)
                    if full:  # "Sheila Lee" -> "Sheila Jackson Lee"
                        person["last"], person["name"] = full, display_name(first, full)
                    if person["name"] not in NAMES.values():  # names set by hand stay
                        person["name"] = C.known_as(person["name"], m)
                people.append(person)
            rounds = []
            for rd in race["rounds"]:
                label = {"general": f"General election, {ELECTION_DAY[year]}",
                         "runoff": f"Runoff, {RUNOFF_DAY.get(year, '')}",
                         "rcv": f"Ranked-choice round {rd.get('round')}" if rd.get("round") else "Ranked-choice final round"}[rd["kind"]]
                rounds.append({"kind": rd["kind"], "label": label, "votes": [rd["votes"][i] for i in order],
                               "other": rd["other"], "total": rd["total"]})
            notes = []
            if race["unopposed"]:
                notes.append("Unopposed: the race was not on the ballot, so no votes were counted.")
            if (year, st, d) in LATER:
                notes.append(LATER[(year, st, d)])
            if (year, st, d) in RCV_NOTES:
                notes.append(RCV_NOTES[(year, st, d)])
            if rounds and len({p["caucus"] for p in people[:2]}) == 1 and len(people) > 1:
                notes.append("Both leading candidates were from the same party (top-two or all-party ballot).")
            out[district_key(st, d)] = {"cands": people, "rounds": rounds, "won": 0,
                                        "unopposed": race["unopposed"], "notes": notes}
            seats[people[0]["caucus"]] += 1
            if rounds:
                g = rounds[0]
                for k, p in enumerate(people):
                    if p["party"] == "D":
                        popular[0] += g["votes"][k]
                    elif p["party"] == "R":
                        popular[1] += g["votes"][k]
                popular[2] += g["total"]
        got = {"D": seats["D"], "R": seats["R"]}
        assert got == SEATS[year] and not seats.get("I"), f"House {year}: computed {dict(seats)}, expected {SEATS[year]}"
        data["races"][str(year)] = out
        data["seats"][str(year)] = SEATS[year]
        data["popular"][str(year)] = popular
        print(f"{year}: {len(out)} districts, seats {got}, unopposed {sum(r['unopposed'] for r in out.values())}, "
              f"popular D {popular[0]:,} R {popular[1]:,}")

    C.one_name_per_person(data["races"], set(NAMES.values()))
    print("Differences between sources (votes for the two leading candidates):")
    stop = 0
    for p in problems:
        if p[-1] == "STOP" or p[5] == "not found":
            print("  ", *p)
        stop += p[-1] == "STOP"
    print(f"  ({len(problems)} differences in all, {stop} above the limit)")
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
    if stop:
        raise SystemExit("Unexplained differences (marked STOP): look them up and add to KNOWN_DIFFS")


if __name__ == "__main__":
    main()
