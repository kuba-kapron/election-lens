"""Shared helpers for the Senate and House builds: official sources and name matching.

Official sources (certified results):
  FEC, "Federal Elections 2020" and "Federal Elections 2022" (spreadsheets)
      https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/
  Clerk of the House, "Statistics of the Presidential and Congressional Election" 2020, 2022, 2024
      https://clerk.house.gov/Members/ElectionInformation
  FEC, 2024 general election candidate list (ballot names, parties, incumbents)

The Clerk publishes PDFs. Their text is extracted once (pypdf) and cached next to the PDF.
Footnote markers can stick to numbers in the extracted text, so the Clerk figures are used
to check the other sources, and every disagreement is reported, never silently used.
"""

import difflib
import json
import re
import unicodedata
from pathlib import Path

from build_results import STATES  # noqa: F401  (re-exported for the builders)
import xlsx

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "congress"
ABBR = {abbr: fips for fips, (_, abbr) in STATES.items()}
STATE_BY_NAME = {name.upper(): fips for fips, (name, _) in STATES.items()}

FEC_FILES = {2020: "fec2020.xlsx", 2022: "fec2022.xlsx"}
FEC_SHEETS = {
    (2020, "S"): "12. US Senate Results by State", (2020, "H"): "13. US House Results by State",
    (2022, "S"): "7. US Senate Results by State", (2022, "H"): "8. US House Results by State",
}

# Ballot lines that are not votes for anyone: left out of every total
# (matched against plain() text: upper case, no punctuation)
NOT_VOTES = re.compile(r"^(UNDER ?VOTES?|OVER ?VOTES?|BLANK( VOTES| BALLOTS)?|BLANKS|BLANK VOID|VOID|SPOILED|TOTAL VOTES?( CAST)?|TOTAL BALLOTS( CAST)?|CONTINUING BALLOTS?|EXHAUSTED BALLOTS?|CONTEST TOTALS?|NOT QUALIFIED|UNDERVOTES? VOIDS?)$")
# Lines that are votes, but not for a named candidate
OTHER_VOTES = re.compile(r"^((OTHER )?WRITE ?INS?.*|SCATTER(ED|ING)?|OTHERS?|NONE OF THESE( CANDIDATES)?|MISCELLANEOUS|ALL OTHERS)$")


def num(value):
    """Vote count from text; None for empty or non-numeric cells ('*', 'n/a', 'Unopposed')."""
    value = str(value or "").replace(",", "").strip()
    try:
        return int(round(float(value)))
    except ValueError:
        return None


def plain(s):
    """Upper-case letters and spaces only: 'Mazie K. Hirono' -> 'MAZIE K HIRONO'."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z ]+", " ", s.replace("-", " ").replace("'", ""))
    return " ".join(s.upper().split())


SUFFIXES = {"JR", "SR", "II", "III", "IV"}


def name_tokens(s):
    return [t for t in plain(s).split() if t not in SUFFIXES]


def matches(raw, last, first=""):
    """0 = no match, 1 = last name found in raw, 2 = last and first name found."""
    toks, want = name_tokens(raw), name_tokens(last)
    if not want:
        return 0
    found = any(toks[i:i + len(want)] == want for i in range(len(toks) - len(want) + 1))
    if not found and len(want) > 1:  # "MILLERMEEKS" for "Miller-Meeks"
        found = "".join(want) in toks
    if not found:
        return 0
    f = name_tokens(first)
    return 2 if f and f[0] in toks else 1


def best_match(raw, cands):
    """Index of the candidate whose name matches raw, or None if none or ambiguous.

    Falls back to a near-identical last name (one letter off: "Billiot" / "Billiott")
    when exactly one candidate has one.
    """
    scores = [matches(raw, c["last"], c["first"]) for c in cands]
    top = max(scores, default=0)
    if top and scores.count(top) == 1:
        return scores.index(top)
    if top:
        return None
    toks = name_tokens(raw)
    close = [i for i, c in enumerate(cands)
             if name_tokens(c["last"]) and any(difflib.SequenceMatcher(None, t, name_tokens(c["last"])[-1]).ratio() >= 0.85
                                              for t in toks if len(t) > 3)]
    return close[0] if len(close) == 1 else None


# ---------- FEC "Federal Elections" spreadsheets ----------

def fec_rows(year, office):
    """Candidate rows of the FEC results sheet, office 'S' (Senate) or 'H' (House).

    Returns a list of dicts. Rows for the same candidate on several party lines (New York,
    Connecticut fusion voting) share an FEC ID and are kept separate here.
    """
    data = xlsx.rows(RAW / FEC_FILES[year], FEC_SHEETS[(year, office)])
    head = [h.strip().upper() for h in data[0]]

    def col(prefix):
        return next(i for i, h in enumerate(head) if h.startswith(prefix))

    c = {
        "st": col("STATE ABBREVIATION"), "district": col("DISTRICT"), "id": col("FEC ID"),
        "inc": col("(I)"), "first": col("CANDIDATE NAME (FIRST)"), "last": col("CANDIDATE NAME (LAST)"),
        "name": head.index("CANDIDATE NAME"), "label": col("TOTAL VOTES"), "party": col("PARTY"),
        "gen": col("GENERAL VOTES"), "runoff": col("GE RUNOFF ELECTION VOTES"),
        "won": col("GE WINNER"), "note": col("FOOTNOTES"),
    }
    rcv = [i for i, h in enumerate(head) if re.match(r"\d\w\w ROUND RCV VOTES", h)]
    out = []
    for r in data[1:]:
        r = r + [""] * (len(head) - len(r))
        if not r[c["st"]].strip() or r[c["st"]].strip() not in ABBR:
            continue
        first, last, full = r[c["first"]].strip(), r[c["last"]].strip(), r[c["name"]].strip()
        if not last and "," in full:  # some rows fill in only "Last, First"
            last, first = (x.strip() for x in full.split(",", 1))
        r[c["first"]], r[c["last"]] = first, last
        out.append({
            "st": r[c["st"]].strip(), "district": r[c["district"]].strip().upper(),
            "id": r[c["id"]].strip(), "inc": r[c["inc"]].strip() == "(I)",
            "first": r[c["first"]].strip(), "last": r[c["last"]].strip(), "name": r[c["name"]].strip(),
            "label": r[c["label"]].strip(), "party": r[c["party"]].strip(),
            "gen": num(r[c["gen"]]), "runoff": num(r[c["runoff"]]),
            "rcv": [num(r[i]) for i in rcv], "won": r[c["won"]].strip() == "W",
            "note": r[c["note"]].strip(),
        })
    return out


def fec_ballot_2024():
    """FEC 2024 general election candidate list: {(st, district, seat): [candidates]}.

    district is 'S' for Senate or a two-digit House district; seat is 'regular' or 'special'.
    """
    path = RAW / "fec2024-congress-cands.xlsx"
    out = {}
    for sheet in xlsx.sheet_names(path):
        seat = "special" if "SEN SPEC" in sheet.upper() else "regular"
        for r in xlsx.rows(path, sheet)[1:]:
            r = r + [""] * 9
            label = " ".join(x.strip().upper() for x in r[:3] if x.strip())
            if "UNEXPIRED" in label or "SPECIAL" in label:
                seat = "special"
            elif "FULL TERM" in label:
                seat = "regular"
            st, district = r[0].strip(), r[2].strip().upper()
            if st not in ABBR or not r[6].strip():
                continue
            if district.startswith("S-"):  # "S-Unexpired Term", "S-Full Term"
                seat = "special" if "UNEXPIRED" in district else "regular"
                district = "S"
            out.setdefault((st, district, seat), []).append({
                "id": r[3].strip(), "inc": r[4].strip() == "(I)", "first": r[5].strip(),
                "last": r[6].strip(), "party": r[8].strip(),
            })
    return out


# ---------- Clerk of the House statistics (PDF) ----------

def clerk_text(year):
    cache = RAW / f"clerk{year}.txt"
    if not cache.exists():
        from pypdf import PdfReader  # only needed the first time
        reader = PdfReader(RAW / f"clerk{year}.pdf")
        cache.write_text("\n".join(p.extract_text() for p in reader.pages))
    return cache.read_text().splitlines()


def split_name_party(label):
    """'Preston Love, Jr., Democrat' -> ('Preston Love, Jr.', 'Democrat');
    'Mark Coester, Republican, Libertarian' -> ('Mark Coester', 'Republican/Libertarian')."""
    parts = [p.strip() for p in label.split(",")]
    name = [parts[0]]
    rest = parts[1:]
    while rest and rest[0].rstrip(".") in ("Jr", "Sr", "II", "III", "IV"):
        name.append(rest.pop(0))
    return ", ".join(name), "/".join(rest)


LINE = re.compile(r"^(.*?)\s*\.{3,}\s*([\d,]+)?\s*$")


def clerk_senate(year):
    """Senate votes from the Clerk's statistics: {(st, seat): {"cands": [...], "other": n}}.

    Each candidate is {"name", "party", "votes"}; extra party lines (fusion) are added to
    the candidate above them. Blank, void, over- and undervotes are left out.
    """
    out, st, seat, in_senate, last = {}, None, "regular", False, None
    for line in clerk_text(year):
        line = line.strip()
        head = line.replace("—Continued", "").strip()
        if head in STATE_BY_NAME:
            st = STATES[STATE_BY_NAME[head]][1]
            if "Continued" not in line:
                seat, in_senate = "regular", False
            continue
        if line.startswith("FOR UNITED STATES SENATOR"):
            in_senate = True
            continue
        if line.startswith("FOR "):
            in_senate = False
            continue
        if not in_senate or st is None:
            continue
        if line.startswith("(For unexpired term") or line.startswith("(For term ending"):
            seat = "special"
            continue
        if line.startswith("(For full term"):
            seat = "regular"
            continue
        m = LINE.match(line)
        if not m or not m.group(2):
            continue
        label, votes = m.group(1).strip(), num(m.group(2))
        race = out.setdefault((st, seat), {"cands": [], "other": 0, "dropped": 0})
        key = plain(label)
        if NOT_VOTES.match(key):
            race["dropped"] += votes
        elif "," in label:
            name, party = split_name_party(label)
            last = {"name": name, "party": party, "votes": votes}
            race["cands"].append(last)
        elif OTHER_VOTES.match(key) or key.startswith("WRITE IN"):
            race["other"] += votes
        elif last is not None and race["cands"] and race["cands"][-1] is last:
            last["votes"] += votes  # another party line for the same candidate
        else:
            race["other"] += votes
    return out


ENTRY = re.compile(r"^(?:(\d{1,2})\.\s+)?(.+?)\s*\.{3,}\s*(?:([\d,]+)|(\(\d\)))?\s*$")
RECAP_ROW = re.compile(r"\.{3,}.*\d.*\s\.{3,}|\.{3,}\s*[\d,]+\s+[\d,]+")
NUMBER = re.compile(r"^\d+(,\d{3})*$")


def clerk_number(text):
    """'146,142' -> 146142. A footnote marker glued in front ('1146,142') is removed when the
    first group has more than three digits, which a correctly written number never has."""
    head, _, rest = text.partition(",")
    if rest and len(head) > 3:
        head = head[len(head) - 3:]
    return num(head + ("," + rest if rest else ""))


def clerk_house(year):
    """House votes from the Clerk's statistics: {(st, "DD"): {"cands": [...], "other": n, "dropped": n}}.

    In the PDF text, each district lists its candidates first and their votes after, one
    number per line. Page numbers also stand alone on a line; they come just before a
    "STATE—Continued" heading, which is how they are recognized and dropped.
    """
    out, st, district, in_house, unexpired = {}, None, None, False, False
    pending, last_assigned, prev_was_number = [], None, False
    lines = clerk_text(year)

    def assign(entry, votes):
        race = out.setdefault((st, entry["district"]), {"cands": [], "other": 0, "dropped": 0})
        kind = entry["kind"]
        if kind == "cand":
            entry["votes"] = votes
            race["cands"].append(entry)
        elif kind == "fusion":
            target = entry["target"]
            target["votes"] = (target.get("votes") or 0) + votes
        else:
            race[kind] += votes

    for line in lines:
        line = line.strip()
        after_number, prev_was_number = prev_was_number, False
        head = line.replace("—Continued", "").strip()
        if head in STATE_BY_NAME:
            if "Continued" in line and in_house and after_number and last_assigned is not None:
                # the number just before this heading was the page number: undo it
                entry, votes = last_assigned
                race = out[(st, entry["district"])]
                if entry["kind"] == "cand":
                    race["cands"].remove(entry)
                elif entry["kind"] == "fusion":
                    entry["target"]["votes"] -= votes
                else:
                    race[entry["kind"]] -= votes
                pending.insert(0, entry)
            elif "Continued" not in line:
                in_house, pending = False, []
            st = STATES[STATE_BY_NAME[head]][1]
            last_assigned = None
            continue
        if line.startswith("FOR UNITED STATES REPRESENTATIVE"):
            in_house = True
            continue
        if line.startswith("FOR ") or line.upper().startswith("RECAPITULATION"):
            in_house = False
            continue
        if not in_house or st is None:
            continue
        if line.upper() == "AT LARGE":
            district = "00"
            continue
        if NUMBER.match(line):
            if pending:
                entry = pending.pop(0)
                votes = clerk_number(line)
                if not unexpired or entry["district"] is None:
                    assign(entry, votes)
                last_assigned, prev_was_number = (entry, votes), True
            else:
                prev_was_number, last_assigned = True, None  # a page number
            continue
        if line.startswith("(For unexpired term"):
            unexpired = True
            continue
        if line.startswith("(For full term"):
            unexpired = False
            continue
        if RECAP_ROW.search(line):
            in_house = False  # a row of the summary table at the end of the state
            continue
        m = ENTRY.match(line)
        if not m:
            continue
        if m.group(1):
            district, unexpired = m.group(1).zfill(2), False
        label = m.group(2).strip()
        key = plain(label)
        if NOT_VOTES.match(key):
            entry = {"kind": "dropped", "district": district}
        elif "," in label:
            name, party = split_name_party(label)
            entry = {"kind": "cand", "district": district, "name": name, "party": party}
        elif OTHER_VOTES.match(key) or key.startswith("WRITE IN"):
            entry = {"kind": "other", "district": district}
        else:
            cands = [e for e in pending if e["kind"] == "cand" and e["district"] == district]
            prior = cands[-1] if cands else (out.get((st, district), {}).get("cands") or [None])[-1]
            entry = {"kind": "fusion", "district": district, "target": prior} if prior else {"kind": "other", "district": district}
        if unexpired:
            entry["district"] = None  # same-day special election for an unexpired term: skipped
        if m.group(4):
            # a footnote instead of a number: unopposed, no votes counted
            if entry["district"] is not None:
                assign(entry, None)
        elif m.group(3):
            if entry["district"] is not None:
                assign(entry, num(m.group(3)))
        else:
            pending.append(entry)
    return out


# ---------- members of Congress (for official portraits) ----------
# unitedstates/congress-legislators lists everyone who has served, with their Congress
# ("bioguide") ID, their FEC candidate IDs and their terms. Official portraits are keyed by
# the bioguide ID. Only people who have served are in it: other candidates get no ID.
_LEGISLATORS = None


def _legislators():
    global _LEGISLATORS
    if _LEGISLATORS is None:
        by_fec, by_state = {}, {}
        for f in ("legislators-current.json", "legislators-historical.json"):
            path = RAW / f
            if not path.exists():
                raise SystemExit(f"{path.relative_to(ROOT)} is missing: run pipeline/fetch_congress.sh")
            for p in json.loads(path.read_text()):
                if max(t["end"] for t in p["terms"]) < "1995":
                    continue  # nobody who left Congress before 1995 ran in 2020-2024
                n = p["name"]
                person = {"bio": p["id"]["bioguide"], "last": n["last"], "terms": p["terms"],
                          "nickname": n.get("nickname"),
                          "firsts": {t for x in (n.get("first"), n.get("nickname"), n.get("middle"))
                                     if x for t in name_tokens(x)[:1]}}
                for fec in p["id"].get("fec", []):
                    by_fec[fec] = person
                for st in {t["state"] for t in p["terms"]}:
                    by_state.setdefault(st, []).append(person)
        _LEGISLATORS = by_fec, by_state
    return _LEGISLATORS


def member(st, first, last, chamber, year, fec_id=None, served=False):
    """The member of Congress a candidate is, as {"bio": Congress ID, "last": surname, ...}, or None.

    In order, the first that gives exactly one person:
    1. FEC candidate ID, with the same last and first name (or nickname);
    2. same state, last and first name;
    3. only for winners and incumbents (served=True): same state, chamber ("sen"/"rep") and
       last name, serving at the election or right after it; their first names often differ
       between sources ("Nick" / "Nicholas");
    4. the FEC candidate ID with the same last name. The ID alone is not enough: the FEC has
       reused IDs (Carolyn Maloney's for Sean Maloney in 2022).
    Candidates who neither won nor were incumbents only match members who served in the 12
    years before the election.
    """
    by_fec, by_state = _legislators()
    want = name_tokens(first)[:1]
    named = lambda p: matches(p["last"], last) or matches(last, p["last"])
    same = lambda p: named(p) and want and want[0] in p["firsts"]
    # Other candidates only match members who served in the 12 years before: a former member
    # running again. The legislator list itself has errors: it gives former Rep. James V.
    # Hansen the FEC ID of James Arthur Hansen, Utah's Libertarian Senate candidate in 2022.
    recent = lambda q: served or max(t["end"] for t in q["terms"]) >= f"{year - 12}"
    p = by_fec.get(fec_id or "")
    if p and same(p) and recent(p):
        return p
    people = [q for q in by_state.get(st, []) if named(q) and recent(q)]
    for test in (same, (lambda q: False) if not served else lambda q: any(
            t["type"] == chamber and t["state"] == st and t["start"] <= f"{year + 1}-01-31"
            and t["end"] >= f"{year}-11-01" for t in q["terms"])):
        found = [q for q in people if test(q)]
        if len(found) == 1:
            return found[0]
    return p if p and named(p) and recent(p) else None


def known_as(name, m):
    """Use the member's nickname from the legislator list ("Nick LaLota", not "Nicholas"),
    so each person has one name across years and sources."""
    nick = m.get("nickname")
    if not nick or " " in nick or "." in nick or name.startswith(nick + " "):
        return name
    return nick + " " + name.split(" ", 1)[1]


def one_name_per_person(races_by_year, names_set_by_hand):
    """Call each member by one first name in every year: where sources differ ("Nicholas" /
    "Nick" LaLota), the shorter one, which is the name they go by. Surnames stay as each
    year's ballot had them ("Kamlager" in 2022, "Kamlager-Dove" in 2024)."""
    def everyone():
        for races in races_by_year.values():
            for r in races.values() if isinstance(races, dict) else races:
                yield from (c for c in r["cands"] if "bio" in c)
    given = {}
    for c in everyone():
        g = c["name"][: len(c["name"]) - len(c["last"])].strip()
        if c["name"] in names_set_by_hand:
            given[c["bio"]] = (-1, g)  # a name set by hand wins
        else:
            given[c["bio"]] = min(given.get(c["bio"], (len(g), g)), (len(g), g))
    for c in everyone():
        if c["name"] not in names_set_by_hand:
            c["name"] = f"{given[c['bio']][1]} {c['last']}"


ELECTION_DATE = {2020: "2020-11-03", 2022: "2022-11-08", 2024: "2024-11-05", 2026: "2026-11-03"}


def sitting(m, chamber, year):
    """Whether the member held a seat in that chamber ("sen"/"rep") on election day: the
    incumbent. Taken from the term dates, because the FEC's incumbent mark misses members
    who won special elections (Peltola, Mfume) and is wrong for whole states in 2024
    (Arizona, Nebraska) and for open seats (Delaware 2024)."""
    day = ELECTION_DATE[year]
    return bool(m) and any(t["type"] == chamber and t["start"] < day <= t["end"] for t in m["terms"])


def full_surname(last, m):
    """The member's surname when the source cut a two-word one short ("Lee" for "Jackson Lee")."""
    short, full = name_tokens(last), name_tokens(m["last"])
    return m["last"] if short and len(full) > len(short) and full[-len(short):] == short else None
