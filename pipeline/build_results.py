"""Build web/data/results.json: US presidential results by county, 2000-2024.

Sources:
  2000-2016  MIT Election Data and Science Lab, official county returns
             https://github.com/MEDSL/county-returns
  2020-2024  Tony McGovern, county results (MIT license)
             https://github.com/tonmcg/US_County_Level_Election_Results_08-24
             (unofficial counts; within ~0.1% of the certified national totals)
Run pipeline/fetch_data.sh first. Uses only the Python standard library.

Output shape (votes are [democratic, republican, total]):
{
  "years": [2008, ...],
  "candidates": {"2024": {"dem": "Harris", "gop": "Trump"}, ...},
  "nation": {"2024": [d, r, t], ...},
  "states": {"48": {"name": "Texas", "abbr": "TX", "r": {"2024": [d, r, t]}}},
  "counties": {"48201": {"name": "Harris County", "r": {"2024": [d, r, t]}}}
}

Known gaps, kept visible on the map rather than filled in:
  - Alaska reports by state house district, so it is shown as one statewide shape.
    Alaska 2004 is left out: MEDSL notes its district returns overstate the votes cast.
    Alaska 2020 is left out: several district totals in the source are inflated.
  - Connecticut reports 2024 results by planning region (new county equivalents);
    earlier years use the old eight counties.
  - Florida 2000: the MEDSL county figures predate certification (they put Gore ahead by
    202 votes). The statewide total uses the certified result (Bush by 537); county
    figures are kept as published.
  - A few MEDSL rows have no state or county (statewide write-ins, overseas ballots)
    and are skipped, so totals can sit slightly below the official national count.
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "tonmcg"
MEDSL = ROOT / "data" / "raw" / "medsl" / "countypres_2000-2016.csv"
OUT = ROOT / "web" / "data" / "results.json"

YEARS = [2000, 2004, 2008, 2012, 2016, 2020, 2024]
# "won" = the party that won the Electoral College (not always the popular vote)
CANDIDATES = {
    2000: {"dem": "Gore", "gop": "Bush", "won": "gop"},
    2004: {"dem": "Kerry", "gop": "Bush", "won": "gop"},
    2008: {"dem": "Obama", "gop": "McCain", "won": "dem"},
    2012: {"dem": "Obama", "gop": "Romney", "won": "dem"},
    2016: {"dem": "Clinton", "gop": "Trump", "won": "gop"},
    2020: {"dem": "Biden", "gop": "Trump", "won": "dem"},
    2024: {"dem": "Harris", "gop": "Trump", "won": "gop"},
}

STATES = {
    "01": ("Alabama", "AL"), "02": ("Alaska", "AK"), "04": ("Arizona", "AZ"),
    "05": ("Arkansas", "AR"), "06": ("California", "CA"), "08": ("Colorado", "CO"),
    "09": ("Connecticut", "CT"), "10": ("Delaware", "DE"), "11": ("District of Columbia", "DC"),
    "12": ("Florida", "FL"), "13": ("Georgia", "GA"), "15": ("Hawaii", "HI"),
    "16": ("Idaho", "ID"), "17": ("Illinois", "IL"), "18": ("Indiana", "IN"),
    "19": ("Iowa", "IA"), "20": ("Kansas", "KS"), "21": ("Kentucky", "KY"),
    "22": ("Louisiana", "LA"), "23": ("Maine", "ME"), "24": ("Maryland", "MD"),
    "25": ("Massachusetts", "MA"), "26": ("Michigan", "MI"), "27": ("Minnesota", "MN"),
    "28": ("Mississippi", "MS"), "29": ("Missouri", "MO"), "30": ("Montana", "MT"),
    "31": ("Nebraska", "NE"), "32": ("Nevada", "NV"), "33": ("New Hampshire", "NH"),
    "34": ("New Jersey", "NJ"), "35": ("New Mexico", "NM"), "36": ("New York", "NY"),
    "37": ("North Carolina", "NC"), "38": ("North Dakota", "ND"), "39": ("Ohio", "OH"),
    "40": ("Oklahoma", "OK"), "41": ("Oregon", "OR"), "42": ("Pennsylvania", "PA"),
    "44": ("Rhode Island", "RI"), "45": ("South Carolina", "SC"), "46": ("South Dakota", "SD"),
    "47": ("Tennessee", "TN"), "48": ("Texas", "TX"), "49": ("Utah", "UT"),
    "50": ("Vermont", "VT"), "51": ("Virginia", "VA"), "53": ("Washington", "WA"),
    "54": ("West Virginia", "WV"), "55": ("Wisconsin", "WI"), "56": ("Wyoming", "WY"),
}

# Full names for the side panel, in the short form each candidate is commonly known by
# (George W. Bush, Barack Obama, Donald Trump; no middle names).
# The key (last name, lowercase) also names the optional photo web/img/candidates/<key>.jpg
PEOPLE = {
    "Gore": "Al Gore", "Bush": "George W. Bush", "Kerry": "John Kerry", "Obama": "Barack Obama",
    "McCain": "John McCain", "Romney": "Mitt Romney", "Clinton": "Hillary Clinton",
    "Trump": "Donald Trump", "Biden": "Joe Biden", "Harris": "Kamala Harris",
}

# Certified statewide totals that replace the sum of county figures, as [dem, gop, total]
STATE_OVERRIDES = {
    # Florida Secretary of State, certified 26 Nov 2000
    (2000, "12"): [2912253, 2912790, 5963110],
}

# Electoral votes: House seats per state after each census (US Census Bureau), + 2 senators.
# DC has 3. Elections use the apportionment of the census before them.
HOUSE_SEATS = {  # state: (1990, 2000, 2010, 2020 census)
    "AL": (7, 7, 7, 7), "AK": (1, 1, 1, 1), "AZ": (6, 8, 9, 9), "AR": (4, 4, 4, 4),
    "CA": (52, 53, 53, 52), "CO": (6, 7, 7, 8), "CT": (6, 5, 5, 5), "DE": (1, 1, 1, 1),
    "FL": (23, 25, 27, 28), "GA": (11, 13, 14, 14), "HI": (2, 2, 2, 2), "ID": (2, 2, 2, 2),
    "IL": (20, 19, 18, 17), "IN": (10, 9, 9, 9), "IA": (5, 5, 4, 4), "KS": (4, 4, 4, 4),
    "KY": (6, 6, 6, 6), "LA": (7, 7, 6, 6), "ME": (2, 2, 2, 2), "MD": (8, 8, 8, 8),
    "MA": (10, 10, 9, 9), "MI": (16, 15, 14, 13), "MN": (8, 8, 8, 8), "MS": (5, 4, 4, 4),
    "MO": (9, 9, 8, 8), "MT": (1, 1, 1, 2), "NE": (3, 3, 3, 3), "NV": (2, 3, 4, 4),
    "NH": (2, 2, 2, 2), "NJ": (13, 13, 12, 12), "NM": (3, 3, 3, 3), "NY": (31, 29, 27, 26),
    "NC": (12, 13, 13, 14), "ND": (1, 1, 1, 1), "OH": (19, 18, 16, 15), "OK": (6, 5, 5, 5),
    "OR": (5, 5, 5, 6), "PA": (21, 19, 18, 17), "RI": (2, 2, 2, 2), "SC": (6, 6, 7, 7),
    "SD": (1, 1, 1, 1), "TN": (9, 9, 9, 9), "TX": (30, 32, 36, 38), "UT": (3, 3, 4, 4),
    "VT": (1, 1, 1, 1), "VA": (11, 11, 11, 11), "WA": (9, 9, 10, 10), "WV": (3, 3, 3, 2),
    "WI": (9, 8, 8, 8), "WY": (1, 1, 1, 1),
}
CENSUS_FOR_YEAR = {2000: 0, 2004: 1, 2008: 1, 2012: 2, 2016: 2, 2020: 2, 2024: 3}
# Maine and Nebraska award electors by congressional district: [dem, gop] where they split
EV_SPLITS = {
    2008: {"31": [1, 4]},
    2016: {"23": [3, 1]},
    2020: {"23": [3, 1], "31": [1, 4]},
    2024: {"23": [3, 1], "31": [1, 4]},
}
# Winner of each congressional district in the two split states, district 1 first.
# Each district gives 1 elector; the statewide winner gets the other 2 (checked below).
DISTRICT_WINNERS = {
    "23": {  # Maine: 2 districts
        2000: ["dem", "dem"], 2004: ["dem", "dem"], 2008: ["dem", "dem"], 2012: ["dem", "dem"],
        2016: ["dem", "gop"], 2020: ["dem", "gop"], 2024: ["dem", "gop"],
    },
    "31": {  # Nebraska: 3 districts
        2000: ["gop", "gop", "gop"], 2004: ["gop", "gop", "gop"], 2008: ["gop", "dem", "gop"],
        2012: ["gop", "gop", "gop"], 2016: ["gop", "gop", "gop"], 2020: ["gop", "dem", "gop"],
        2024: ["gop", "dem", "gop"],
    },
}

# Statewide winner where the county data has no usable total (Alaska 2004 and 2020)
EV_WINNER_OVERRIDES = {2004: {"02": "gop"}, 2020: {"02": "gop"}}
# Electoral votes won from state results ("as called on election night"), used as a check
EV_WON = {2000: [267, 271], 2004: [252, 286], 2008: [365, 173], 2012: [332, 206],
          2016: [232, 306], 2020: [306, 232], 2024: [226, 312]}
# Where electors voted differently when the Electoral College met
EV_CAST = {
    2000: {"dem": 266, "gop": 271, "note": "One elector from the District of Columbia abstained."},
    2004: {"dem": 251, "gop": 286, "note": "One elector from Minnesota voted for John Edwards."},
    2016: {"dem": 227, "gop": 304, "note": "Seven electors voted for other people: five from Washington and Hawaii pledged to Clinton, two from Texas pledged to Trump."},
}


def electoral(states):
    """Electoral votes won per state and in total, from the statewide results."""
    out = {}
    abbr_to_fips = {abbr: fips for fips, (_, abbr) in STATES.items()}
    for year, idx in CENSUS_FOR_YEAR.items():
        ev = {abbr_to_fips[a]: seats[idx] + 2 for a, seats in HOUSE_SEATS.items()}
        ev["11"] = 3
        assert sum(ev.values()) == 538, year
        by_state, won = {}, [0, 0]
        for st, n in ev.items():
            if st in EV_SPLITS.get(year, {}):
                d, r = EV_SPLITS[year][st]
            else:
                w = EV_WINNER_OVERRIDES.get(year, {}).get(st)
                if not w:
                    v = states[st]["r"][str(year)]
                    w = "dem" if v[0] > v[1] else "gop"
                d, r = (n, 0) if w == "dem" else (0, n)
            by_state[st] = [d, r]
            won[0] += d
            won[1] += r
        assert won == EV_WON[year], f"{year}: computed {won}, expected {EV_WON[year]}"
        districts = {}
        for st, by_year in DISTRICT_WINNERS.items():
            winners = by_year[year]
            v = states[st]["r"][str(year)]
            statewide = "dem" if v[0] > v[1] else "gop"
            d = 2 * (statewide == "dem") + winners.count("dem")
            r = 2 * (statewide == "gop") + winners.count("gop")
            assert [d, r] == by_state[st], f"{year} {st}: districts give {[d, r]}, state has {by_state[st]}"
            districts[st] = winners
        out[str(year)] = {"states": by_state, "won": won, "cast": EV_CAST.get(year), "districts": districts}
    return out


# County codes that changed before the 2019 boundary files used for the map.
FIPS_FIXES = {
    "46113": "46102",  # Shannon County SD renamed Oglala Lakota County (2015)
    "51515": "51019",  # Bedford city VA merged into Bedford County (2013)
}


def num(value):
    """Parse a vote count like '1234', '1234.0' or '1,234'; empty -> None."""
    value = (value or "").replace(",", "").strip()
    return int(float(value)) if value else None


def norm_fips(raw):
    fips = str(raw).strip().split(".")[0].zfill(5)
    if fips.startswith("02"):
        return "02000"  # Alaska: one statewide unit
    if fips.startswith("11"):
        return "11001"  # DC: wards summed into the district
    return FIPS_FIXES.get(fips, fips)


def main():
    votes = defaultdict(dict)  # fips -> year -> [dem, gop, total]
    names = {}

    def add(year, fips, name, dem, gop, total):
        if None in (dem, gop, total) or fips[:2] not in STATES:
            return
        cur = votes[fips].setdefault(year, [0, 0, 0])
        for i, v in enumerate((dem, gop, total)):
            cur[i] += v
        if name and (fips not in names or year >= 2020):
            names[fips] = name

    # 2000-2016: one row per candidate per county; county total in "totalvotes"
    medsl = defaultdict(lambda: {"dem": 0, "gop": 0, "name": None})
    with open(MEDSL, newline="") as f:
        for row in csv.DictReader(f):
            if row["FIPS"] in ("", "NA") or row["candidatevotes"] in ("", "NA"):
                continue  # statewide write-ins, overseas ballots: no county
            year = int(row["year"])
            raw = row["FIPS"].split(".")[0].zfill(5)
            if row["state_po"] == "MO" and row["county"] == "Kansas City":
                # Kansas City reports apart from its counties (MEDSL codes it 36000);
                # fold it into Jackson County, which holds most of the city
                raw = "29095"
            if raw.startswith("02") and year == 2004:
                continue  # overstated district returns, see note above
            rec = medsl[(year, raw)]
            if row["party"] == "democrat":
                rec["dem"] += num(row["candidatevotes"])
            elif row["party"] == "republican":
                rec["gop"] += num(row["candidatevotes"])
            rec.setdefault("totals", {})[row["county"]] = num(row["totalvotes"])
            rec["name"] = rec["name"] or row["county"]
    for (year, raw), rec in sorted(medsl.items()):
        # MEDSL names lack "County"/"Parish"; the 2020-2024 names below replace them
        total = sum(rec.get("totals", {}).values())  # one total per reporting unit
        add(year, norm_fips(raw), rec["name"], rec["dem"], rec["gop"], total)

    for year in (2020, 2024):
        with open(SRC / f"{year}_US_County_Level_Presidential_Results.csv", newline="") as f:
            for row in csv.DictReader(f):
                fips = norm_fips(row["county_fips"])
                name = row["county_name"]
                if fips == "02000" and year == 2020:
                    continue  # inflated district totals, see note above
                if fips == "02000":
                    name = "Alaska"
                elif fips == "11001":
                    name = "District of Columbia"
                add(year, fips, name, num(row["votes_dem"]), num(row["votes_gop"]), num(row["total_votes"]))

    names["02000"] = "Alaska"
    names["11001"] = "District of Columbia"

    states = {}
    nation = {}
    for fips, by_year in votes.items():
        st = fips[:2]
        s = states.setdefault(st, {"name": STATES[st][0], "abbr": STATES[st][1], "r": {}})
        for year, v in by_year.items():
            for target in (s["r"].setdefault(str(year), [0, 0, 0]), nation.setdefault(str(year), [0, 0, 0])):
                for i in range(3):
                    target[i] += v[i]

    for (year, st), v in STATE_OVERRIDES.items():
        states[st]["r"][str(year)] = list(v)
    nation = {}
    for s in states.values():
        for year, v in s["r"].items():
            t = nation.setdefault(year, [0, 0, 0])
            for i in range(3):
                t[i] += v[i]

    out = {
        "years": YEARS,
        "candidates": {str(y): c for y, c in CANDIDATES.items()},
        "people": {
            last.lower(): {"name": full, "initials": full.split()[0][0] + last[0]}
            for last, full in PEOPLE.items()
        },
        "sources": {
            "2000-2016": "MIT Election Data and Science Lab, County Presidential Returns 2000-2016",
            "2020-2024": "Tony McGovern, US County Level Election Results 2008-2024",
        },
        "nation": nation,
        "electoral": electoral(states),
        # short notes shown on a place's panel, keyed "<fips>-<year>"
        "notes": {
            "12-2000": "Statewide figures are the certified result. County figures come from an earlier count and add up to a 202-vote Gore lead.",
        },
        "states": dict(sorted(states.items())),
        "counties": {
            fips: {"name": names.get(fips, fips), "r": {str(y): v for y, v in sorted(by_year.items())}}
            for fips, by_year in sorted(votes.items())
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {OUT} with {len(out['counties'])} places")
    for y in YEARS:
        d, r, t = nation[str(y)]
        print(f"  {y}: dem {d:,}  gop {r:,}  total {t:,}  counties {sum(1 for v in votes.values() if y in v)}")


if __name__ == "__main__":
    main()
