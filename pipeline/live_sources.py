"""Readers for each live results source. All requests go through live_fetch (polite fetching).

Every reader returns a Reading, or raises live_fetch.Refused / ValueError when it has
nothing usable:

    names, parties  as the source writes them
    votes           per name, statewide
    total           all votes in the contest, including write-ins
    pct             share counted (0-100) and what it measures (pct_of), or None
    counties        {fips: {"votes": {name: n}, "total": n, "pct": share or None}}
    fetched         when the copy was downloaded (unix time)
    as_of           the source's own timestamp, if it gives one
    test            True when the source says its numbers are test data
"""

import csv
import io
import json
import re
import time
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import live_fetch as F

ROOT = Path(__file__).resolve().parent.parent
ABBR_TO_FIPS = {s["abbr"]: fips for fips, s in json.loads((ROOT / "web/data/results.json").read_text())["states"].items()}


@dataclass
class Reading:
    names: list
    parties: list
    votes: list
    total: int
    pct: float | None = None
    pct_of: str = ""
    counties: dict = field(default_factory=dict)
    fetched: float | None = None
    as_of: str | None = None
    test: bool = False


def _county_key(name):
    name = re.sub(r"\b(county|parish)\b", "", name, flags=re.I)
    return re.sub(r"[^A-Z]", "", name.upper().replace("SAINT", "ST").replace("&", "AND"))


_COUNTIES = None


def county_fips(st, name):
    """FIPS code of a county from its name ('St. Lucie', 'MCDOWELL', 'DeKalb County')."""
    global _COUNTIES
    if _COUNTIES is None:
        _COUNTIES = {}
        for fips, c in json.loads((ROOT / "web/data/results.json").read_text())["counties"].items():
            _COUNTIES[(fips[:2], _county_key(c["name"]))] = fips
    return _COUNTIES.get((ABBR_TO_FIPS[st], _county_key(name)))


def _fetched(url):
    return F.cached(url)[1]


# ---------- North Carolina: precinct file (tab-separated, zipped) ----------
NC_URL = "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2026_11_03/results_pct_20261103.zip"


def read_nc(race, src):
    data = F.fetch(NC_URL)
    z = zipfile.ZipFile(io.BytesIO(data))
    rows = csv.DictReader(io.StringIO(z.read(z.namelist()[0]).decode("utf-8", "replace")), delimiter="\t")
    names, parties, votes, counties = [], [], {}, {}
    precincts, reported = set(), set()
    for r in rows:
        if r["Contest Name"] != src["contest"]:
            continue
        name, n = r["Choice"], int(r["Total Votes"] or 0)
        if name not in votes:
            names.append(name)
            parties.append(r["Choice Party"])
            votes[name] = 0
        votes[name] += n
        fips = county_fips("NC", r["County"])
        c = counties.setdefault(fips, {"votes": {}, "total": 0, "pct": None, "_p": set(), "_r": set()})
        c["votes"][name] = c["votes"].get(name, 0) + n
        c["total"] += n
        if r["Real Precinct"] == "Y":
            key = (r["County"], r["Precinct"])
            precincts.add(key)
            c["_p"].add(key)
            if n:
                reported.add(key)
                c["_r"].add(key)
    if not names:
        raise ValueError(f"NC: no contest {src['contest']!r} in the file")
    for c in counties.values():
        c["pct"] = 100 * len(c.pop("_r")) / max(1, len(c.pop("_p")))
    return Reading(names, parties, [votes[n] for n in names], sum(votes.values()),
                   pct=100 * len(reported) / max(1, len(precincts)), pct_of="precincts with votes",
                   counties=counties, fetched=_fetched(NC_URL))


# ---------- Clarity (South Carolina, Iowa): summary JSON + county XML ----------
def read_clarity(race, src):
    """Any state's Clarity results site: src["base"] is its election address,
    e.g. https://electionresults.iowa.gov/IA/127077."""
    base = src["base"]
    ver = F.fetch(f"{base}/current_ver.txt").decode().strip()
    summary = json.loads(F.fetch(f"{base}/{ver}/json/en/summary.json"))
    c = next((x for x in summary if x.get("C") == src["contest"]), None)
    if c is None:
        raise ValueError(f"Clarity {base}: no contest {src['contest']!r}")
    names = [re.sub(r"^[A-Z]{3}\s+", "", n) for n in c["CH"]]
    reading = Reading(names, c["P"], list(c["V"]), sum(c["V"]),
                      pct=100 * c["PR"] / c["TP"] if c.get("TP") else None, pct_of="precincts reporting",
                      fetched=_fetched(f"{base}/{ver}/json/en/summary.json"))
    # county figures: detail XML, a new file for each published version
    detail_url = f"{base}/{ver}/reports/detailxml.zip"
    z = zipfile.ZipFile(io.BytesIO(F.fetch(detail_url)))
    root = ET.fromstring(z.read("detail.xml"))
    contest = next((x for x in root.iter("Contest") if x.get("text") == src["contest"]), None)
    if contest is not None:
        pct = {x.get("name"): float(x.get("precinctsReportingPercent") or 0)
               for x in contest.iter("County") if x.get("precinctsParticipating")}
        for choice in contest.iter("Choice"):
            name = re.sub(r"^[A-Z]{3}\s+", "", choice.get("text", ""))
            for vt in choice.iter("VoteType"):
                for cty in vt.iter("County"):
                    fips = county_fips(race["st"], cty.get("name"))
                    rec = reading.counties.setdefault(fips, {"votes": {}, "total": 0, "pct": pct.get(cty.get("name"))})
                    n = int(cty.get("votes") or 0)
                    rec["votes"][name] = rec["votes"].get(name, 0) + n
                    rec["total"] += n
    ts = root.findtext("Timestamp")
    reading.as_of = ts.strip() if ts else None
    return reading


# ---------- Florida: county extract (tab-separated) ----------
FL_URL = ("https://results.elections.myflorida.com/ResultsExtract.Asp?ElectionDate=11/3/2026"
          "&OfficialResults=N&PartyRaces=N&DataMode=&FormsButton2=Download")


def read_fl(race, src):
    raw = F.fetch(FL_URL)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:  # Florida writes its file in the Windows character set
        text = raw.decode("cp1252")
    if not text.startswith("ElectionDate"):
        raise ValueError("FL: results file not available yet (it opens when polls close)")
    names, parties, votes, counties, prec = [], [], {}, {}, {}
    for r in csv.DictReader(io.StringIO(text), delimiter="\t"):
        if not re.fullmatch(src["office"], r["OfficeDesc"]):  # an exact name, or a pattern
            continue
        name = " ".join(x for x in (r["CanNameFirst"], r["CanNameLast"]) if x)
        n = int(r["CanVotes"] or 0)
        if name not in votes:
            names.append(name)
            parties.append(r["PartyCode"])
            votes[name] = 0
        votes[name] += n
        fips = county_fips("FL", r["CountyName"])
        c = counties.setdefault(fips, {"votes": {}, "total": 0, "pct": None})
        c["votes"][name] = c["votes"].get(name, 0) + n
        c["total"] += n
        p, rep = int(r["Precincts"] or 0), int(r["PrecinctsReporting"] or 0)
        prec[fips] = (p, rep)
        c["pct"] = 100 * rep / p if p else None
    if not names:
        if text.count("\n") <= 1:
            raise ValueError("FL: results file is still empty (it fills in after polls close)")
        raise ValueError(f"FL: no contest {src['office']!r}")
    p = sum(x[0] for x in prec.values())
    return Reading(names, parties, [votes[n] for n in names], sum(votes.values()),
                   pct=100 * sum(x[1] for x in prec.values()) / p if p else None, pct_of="precincts reporting",
                   counties=counties, fetched=_fetched(FL_URL))


# ---------- Texas: statewide results page (HTML) ----------
TX_URL = "https://electionresults.sos.state.tx.us/results.html"


def read_tx(race, src):
    html = F.fetch(TX_URL).decode("utf-8", "replace")
    m = re.search(r'<div class="election">\s*' + re.escape(src["contest"]) + r'\s*</div>(.*?)</table>', html, re.S)
    if not m:
        raise ValueError(f"TX: no contest {src['contest']!r} on the page")
    block = m.group(1)
    pm = re.search(r"Reporting:\s*([\d.]+)%", block)
    names, parties, votes = [], [], []
    for party, name, ballots in re.findall(
            r'<td class="party">(.*?)</td><td class="candidate">(.*?)</td><td class="ballot"\s*(?:/>|>(.*?)</td>)', block, re.S):
        names.append(re.sub(r"\s+\(I\)$", "", " ".join(name.split())))
        parties.append(party.strip())
        votes.append(int(re.sub(r"[^\d]", "", ballots or "") or 0))
    if not names:
        raise ValueError("TX: no candidates found")
    up = re.search(r"\(Updated ([^)]+)\)", html)
    return Reading(names, parties, votes, sum(votes), pct=float(pm.group(1)) if pm else None,
                   pct_of="polling locations reporting", fetched=_fetched(TX_URL),
                   as_of=up.group(1).strip() if up else None)


# ---------- civicAPI (unofficial) ----------
def read_civicapi(race, src):
    url = f"https://civicapi.org/api/v2/race/{src['race']}"
    d = json.loads(F.fetch(url))
    cands = d.get("candidates") or []
    if not cands:
        raise ValueError(f"civicAPI {src['race']}: no candidates")
    names = [c["name"] for c in cands]
    counties = {}
    for reg in (d.get("region_results") or {}).values():
        if not reg.get("fips"):
            continue
        cv = {c["name"]: int(c.get("votes") or 0) for c in reg.get("candidates", [])}
        counties[reg["fips"]] = {"votes": cv, "total": sum(cv.values()), "pct": reg.get("percent_reporting")}
    votes = [int(c.get("votes") or 0) for c in cands]
    return Reading(names, [c.get("party", "") for c in cands], votes, sum(votes),
                   pct=d.get("percent_reporting"), pct_of="expected vote (civicAPI estimate)",
                   counties=counties, fetched=_fetched(url), as_of=d.get("last_updated"),
                   test=bool(d.get("test_data")))


# ---------- Enhanced Voting (Virginia, Georgia): the "Election Results" CSV report ----------
SENATE = re.compile(r"\b(united states|u\.?\s?s\.?)\s+senat", re.I)  # "U.S. Senate", "US Senate"; not "State Senate"


def read_ev(race, src):
    """A state on the Enhanced Voting platform (results/public/...): Virginia publishes an
    "Election Results" CSV (one row per candidate and precinct), Georgia a "Total Votes Excel"
    workbook (statewide and county sheets). The file name changes with each update, so it is
    looked up in the election data every time."""
    import tempfile
    import urllib.parse
    import xlsx
    site, jur, eid = src["site"], src["jurisdiction"], src["election"]
    office = re.compile(src["office"], re.I) if src.get("office") else SENATE
    d = json.loads(F.fetch(f"{site}/results/public/api/elections/{jur}/{eid}"))
    reports = {r.get("reportName"): r["blobName"] for cat in d.get("publicReportCategories") or []
               for r in cat.get("reports") or []}
    names, parties, votes, counties = [], [], {}, {}

    def add(name, party, county, n):
        if name not in votes:
            names.append(name)
            parties.append(party)
            votes[name] = 0
        votes[name] += n
        if county is not None:
            c = counties.setdefault(county_fips(race["st"], county), {"votes": {}, "total": 0, "pct": None})
            c["votes"][name] = c["votes"].get(name, 0) + n
            c["total"] += n

    pct = None
    if "Election Results" in reports:  # Virginia: CSV by precinct
        url = f"{site}/cdn/results/{d['jurisdictionId']}/{urllib.parse.quote(reports['Election Results'])}"
        precincts, reported = set(), set()
        for r in csv.DictReader(io.StringIO(F.fetch(url).decode("utf-8-sig", "replace"))):
            if not office.search(r["OfficeTitle"] or ""):
                continue
            n = int(float(r["TOTAL_VOTES"] or 0))
            add(r["CandidateName"].strip(), r.get("Party", ""), r["LocalityName"], n)
            key = (r["LocalityName"], r["PrecinctName"])
            precincts.add(key)
            if n:
                reported.add(key)
        pct = 100 * len(reported) / len(precincts) if precincts else None
    elif "Total Votes Excel" in reports:  # Georgia: workbook with a county sheet
        url = f"{site}/cdn/results/{d['jurisdictionId']}/{urllib.parse.quote(reports['Total Votes Excel'])}"
        # statewide from "Total Votes"; counties from "County Results" when the workbook has it
        # (Georgia's 2022 workbook had precinct results instead)
        with tempfile.NamedTemporaryFile(suffix=".xlsx") as tmp:
            tmp.write(F.fetch(url))
            tmp.flush()
            sheets = xlsx.sheet_names(tmp.name)
            state_rows = list(xlsx.rows(tmp.name, "Total Votes"))
            county_rows = list(xlsx.rows(tmp.name, "County Results")) if "County Results" in sheets else []
        clean = lambda b: re.sub(r"(\s*\([A-Za-z]+\))+$", "", b).strip()  # "Brian Kemp (I) (Rep)" -> "Brian Kemp"
        skip = ("Total Votes", "Ballots Cast")
        head = state_rows[0]
        col = {k: head.index(k) for k in ("Office Name", "Ballot Name", "Party", "Total")}
        for r in state_rows[1:]:
            if office.search(r[col["Office Name"]] or "") and r[col["Ballot Name"]] not in skip:
                add(clean(r[col["Ballot Name"]]), r[col["Party"]], None, int(float(r[col["Total"]] or 0)))
        if county_rows:
            head = county_rows[0]
            col = {k: head.index(k) for k in ("County", "Office Name", "Ballot Name", "Total")}
            for r in county_rows[1:]:
                if office.search(r[col["Office Name"]] or "") and r[col["Ballot Name"]] not in skip:
                    name, n = clean(r[col["Ballot Name"]]), int(float(r[col["Total"]] or 0))
                    c = counties.setdefault(county_fips(race["st"], r[col["County"]]), {"votes": {}, "total": 0, "pct": None})
                    c["votes"][name] = c["votes"].get(name, 0) + n
                    c["total"] += n
    else:
        raise ValueError(f"{jur}: no results report yet")
    if not names:
        raise ValueError(f"{jur}: no matching contest in the report yet")
    return Reading(names, parties, [votes[n] for n in names], sum(votes.values()),
                   pct=pct, pct_of="precincts with votes" if pct is not None else "",
                   counties=counties, fetched=_fetched(url), as_of=d.get("asOf"))


# ---------- "resultsSW" results sites (South Dakota CSV, Oregon page), statewide only ----------
def read_sw_csv(race, src):
    """South Dakota: resultsCSV.aspx, one row per candidate statewide, "precincts reporting" as "N/M"."""
    rows = list(csv.DictReader(io.StringIO(F.fetch(src["csv"]).decode("utf-8-sig", "replace"))))
    rows = [r for r in rows if (r.get("RaceName") or "").strip() == src["contest"] and not (r.get("AreaType") or "").strip()]
    if not rows:
        raise ValueError(f"no contest {src['contest']!r} in the CSV")
    names = [" ".join(r["CandidateName"].split()) for r in rows]
    votes = [int(float(r["CandidateVotes"] or 0)) for r in rows]
    m = re.search(r"(\d+)\s*/\s*(\d+)", rows[0].get("PrecinctsReporting") or "")
    return Reading(names, [r["PartyCode"] for r in rows], votes, sum(votes),
                   pct=100 * int(m.group(1)) / int(m.group(2)) if m and int(m.group(2)) else None,
                   pct_of="precincts reporting", fetched=_fetched(src["csv"]),
                   as_of=(rows[0].get("CurrentDateTime") or "").strip() or None)


def read_sw_html(race, src):
    """Oregon: the federal results page; each candidate is an <h1> name, an <h2> party and a vote
    count, and the contest says "N out of M Precincts Reported"."""
    page = F.fetch(src["url"]).decode("utf-8", "replace")
    i = page.find(f"<h1>{src['contest']}</h1>")
    if i < 0:
        raise ValueError(f"no contest {src['contest']!r} on the page")
    j = page.find("display-results-box-a", i + 10)
    block = page[i:j if j > 0 else None]
    names, parties, votes = [], [], []
    for name, party, n in re.findall(r'display-results-box-d">\s*<h1>(.*?)</h1>\s*<h2[^>]*>(.*?)</h2>.*?'
                                     r'display-results-box-f">\s*<div>([\d,]*)</div>', block, re.S):
        names.append(" ".join(name.split()))
        parties.append(party.strip())
        votes.append(int(n.replace(",", "") or 0))
    if not names:
        raise ValueError("no candidates found on the page")
    m = re.search(r"([\d,]+) out of ([\d,]+) Precincts Reported", block)
    done, total = (int(x.replace(",", "")) for x in m.groups()) if m else (0, 0)
    up = re.search(r"Results last updated:\s*([^<]+)", page)
    return Reading(names, parties, votes, sum(votes), pct=100 * done / total if total else None,
                   pct_of="precincts reporting", fetched=_fetched(src["url"]),
                   as_of=up.group(1).strip() if up else None)


# ---------- Delaware: statewide and by-county JSON files ----------
def read_de(race, src):
    base, eid = src["base"], src["election"]
    num = lambda x: int(str(x or 0).replace(",", "") or 0)
    sw = [r for r in json.loads(F.fetch(f"{base}/Election_StatewideResults_ID_{eid}.json")) if r.get("Contest Title") == src["contest"]]
    if not sw:
        raise ValueError(f"DE: no contest {src['contest']!r}")
    names = [" ".join(r["Candidate Name"].split()).title() for r in sw]
    votes = [num(r["Total Votes"]) for r in sw]
    counties = {}
    for r in json.loads(F.fetch(f"{base}/Election_ByCountyWithWilmington_ID_{eid}.json")):
        if r.get("Contest Title") != src["contest"]:
            continue
        name = " ".join(r["Candidate Name"].split()).title()
        for county in ("New Castle", "Kent", "Sussex"):  # Wilmington is part of New Castle
            c = counties.setdefault(county_fips("DE", county), {"votes": {}, "total": 0, "pct": None})
            c["votes"][name] = c["votes"].get(name, 0) + num(r.get(county))
            c["total"] += num(r.get(county))
    total_p, done_p = sw[0].get("Total Precincts") or 0, sw[0].get("Precincts Reported") or 0
    return Reading(names, [r.get("Party Name", "") for r in sw], votes, sum(votes),
                   pct=100 * done_p / total_p if total_p else None, pct_of="precincts reporting",
                   counties=counties, fetched=_fetched(f"{base}/Election_StatewideResults_ID_{eid}.json"),
                   as_of=sw[0].get("ReportTime"))


# ---------- New York: the plain (no JavaScript) results page ----------
def read_ny(race, src):
    """nyenr.elections.ny.gov/HomeNoJS.aspx: one table per contest ("<contest> > All Counties");
    each candidate starts a row with their name, and that row's last cell is their total over
    all party lines (New York has fusion voting)."""
    page = F.fetch(src["url"]).decode("utf-8", "replace")
    m = re.search(r'<table class="datatable"[^>]*summary="Results for All Counties ' + re.escape(src["contest"]) + r'"(.*?)</table>\s*</td>\s*</tr>\s*</table>|'
                  r'<table class="datatable"[^>]*summary="Results for All Counties ' + re.escape(src["contest"]) + r'"(.*?)(?=<table class="datatable"|$)', page, re.S)
    if not m:
        raise ValueError(f"NY: no contest {src['contest']!r}")
    block = m.group(1) or m.group(2)
    rep = re.search(r"Election Districts Reporting:\s*([\d,]+) of ([\d,]+)", block)
    names, votes = [], []
    for row in re.findall(r"<tr>(.*?)</tr>", block, re.S):
        cells = re.findall(r'<td class="([^"]*)"[^>]*>(.*?)</td>', row, re.S)
        if not cells or cells[0][0] != "resultsColumnData":
            continue  # header rows and a candidate's extra party lines
        name = " ".join(re.sub(r"<[^>]+>", "", cells[0][1]).split())
        if not name or name.lower().startswith(("blank", "void", "scattering")):
            continue
        n = re.sub(r"[^\d]", "", re.sub(r"<[^>]+>", "", cells[-1][1]))
        names.append(name.split(" / ")[0])  # "Kathy C. Hochul / Adrienne E. Adams": the governor
        votes.append(int(n or 0))
    if not names:
        raise ValueError("NY: no candidates found")
    done, total = (int(x.replace(",", "")) for x in rep.groups()) if rep else (0, 0)
    return Reading(names, [], votes, sum(votes), pct=100 * done / total if total else None,
                   pct_of="election districts reporting", fetched=_fetched(src["url"]))


# ---------- Maryland: the State Board's results page ----------
def read_md(race, src):
    """elections.maryland.gov results page: one row per ticket (name, party, vote types, total,
    percentage; "NR" = not reported) and "(N of M election day precincts reported)"."""
    page = F.fetch(src["url"]).decode("utf-8", "replace")
    names, parties, votes = [], [], []
    for name, party, cells in re.findall(r"<tr>\s*<td><div>(.*?)</div></td>\s*<td>(.*?)</td>(.*?)</tr>", page, re.S):
        nums = [re.sub(r"[^\d]", "", x) for x in re.findall(r'<td class="alignRight">(.*?)</td>', cells, re.S)]
        name = " ".join(re.sub(r"<[^>]+>", "", name).split())
        if len(nums) < 2 or name.lower().startswith("total"):
            continue  # the closing "Totals" row would count every vote twice
        names.append(name.split(" and ")[0])  # "Wes Moore and Aruna Miller": the governor
        parties.append(party.strip())
        votes.append(int(nums[-2] or 0))  # Total; the last column is the percentage
    if not names:
        raise ValueError("MD: no candidates found")
    m = re.search(r"\((\d[\d,]*) of (\d[\d,]*) election day precincts reported\)", page)
    done, total = (int(x.replace(",", "")) for x in m.groups()) if m else (0, 0)
    return Reading(names, parties, votes, sum(votes), pct=100 * done / total if total else None,
                   pct_of="election day precincts reporting", fetched=_fetched(src["url"]))


READERS = {"md": read_md, "ny": read_ny, "de": read_de, "sw_csv": read_sw_csv, "sw_html": read_sw_html, "nc": read_nc, "clarity": read_clarity, "fl": read_fl, "tx": read_tx, "ev": read_ev, "civicapi": read_civicapi}


# ---------- replay: 2024 presidential county results, revealed bit by bit (for testing) ----------
def read_replay(race, src, started, minutes=20):
    """A fake count for testing the page: the state's 2024 presidential county results,
    counties 'reporting' one after another over `minutes`, credited to the race's D and R."""
    data = json.loads((ROOT / "web/data/results.json").read_text())
    st = ABBR_TO_FIPS[race["st"]]
    rows = sorted((f, c["r"]["2024"]) for f, c in data["counties"].items() if f.startswith(st) and "2024" in c["r"])
    if not rows:  # Alaska etc.: statewide only
        rows = [(st + "000", data["states"][st]["r"]["2024"])]
    frac = min(1.0, (time.time() - started) / (minutes * 60))
    d_name = next(n for n, p in race["cands"] if p == "D")
    r_name = next(n for n, p in race["cands"] if p == "R")
    counties, done_total = {}, 0
    full = sum(v[2] for _, v in rows)
    for k, (fips, (dem, gop, tot)) in enumerate(rows):
        share = max(0.0, min(1.0, frac * 1.6 - (k % 7) / 10))  # counties fill in unevenly
        if share <= 0:
            continue
        d, r, t = int(dem * share), int(gop * share), int(tot * share)
        counties[fips] = {"votes": {d_name: d, r_name: r}, "total": t, "pct": 100 * share}
        done_total += t
    dv = sum(c["votes"][d_name] for c in counties.values())
    rv = sum(c["votes"][r_name] for c in counties.values())
    return Reading([d_name, r_name], ["D", "R"], [dv, rv], done_total, pct=100 * done_total / full if full else 0,
                   pct_of="test replay", counties=counties, fetched=time.time(), test=True)
