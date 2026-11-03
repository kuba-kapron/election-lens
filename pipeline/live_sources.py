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
    return re.sub(r"[^A-Z]", "", name.upper().replace("SAINT", "ST"))


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


# ---------- South Carolina: Clarity (summary JSON + county XML) ----------
def read_sc(race, src):
    base = f"https://www.enr-scvotes.org/SC/{src['election']}"
    ver = F.fetch(f"{base}/current_ver.txt").decode().strip()
    summary = json.loads(F.fetch(f"{base}/{ver}/json/en/summary.json"))
    c = next((x for x in summary if x.get("C") == src["contest"]), None)
    if c is None:
        raise ValueError(f"SC: no contest {src['contest']!r}")
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
                    fips = county_fips("SC", cty.get("name"))
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
    text = F.fetch(FL_URL).decode("utf-8", "replace")
    if not text.startswith("ElectionDate"):
        raise ValueError("FL: results file not available yet (it opens when polls close)")
    names, parties, votes, counties, prec = [], [], {}, {}, {}
    for r in csv.DictReader(io.StringIO(text), delimiter="\t"):
        if r["OfficeDesc"] != src["office"]:
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


READERS = {"nc": read_nc, "sc": read_sc, "fl": read_fl, "tx": read_tx, "civicapi": read_civicapi}


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
