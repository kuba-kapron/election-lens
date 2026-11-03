"""Official House results for the states whose results we already read for the Senate or
governor races: every US House district from the same files, so no extra requests.

Each state has a pattern that matches its US House contests only (not its state house) and
gives the district number; at-large states have one contest. A district with official votes
replaces civicAPI's numbers for that district (pipeline/live.py); otherwise civicAPI stays.

    district readings = HOUSE[state]["read"](spec)  ->  {"01": Reading, ...}

Kept apart from live_sources.py so the tested Senate and governor readers are not touched.
"""

import csv
import io
import json
import re
import tempfile
import urllib.parse
import zipfile

import live_fetch as F
import xlsx
from live_sources import Reading, _fetched


def _dist(pattern, name):
    """District number ("01") from a contest name, "00" for at large, None if not a US House race."""
    m = re.fullmatch(pattern, " ".join(name.split()))
    if not m:
        return None
    return m.group(1).zfill(2) if m.groups() and m.group(1) else "00"


def _reading(names, votes, pct, pct_of, fetched, as_of=None):
    return Reading(names, [], votes, sum(votes), pct=pct, pct_of=pct_of, fetched=fetched, as_of=as_of)


def read_nc(spec):
    url = spec["url"]
    z = zipfile.ZipFile(io.BytesIO(F.fetch(url)))
    acc, prec, rep = {}, {}, {}
    for r in csv.DictReader(io.StringIO(z.read(z.namelist()[0]).decode("utf-8", "replace")), delimiter="\t"):
        d = _dist(spec["pattern"], r["Contest Name"])
        if d is None:
            continue
        n = int(r["Total Votes"] or 0)
        acc.setdefault(d, {})
        acc[d][r["Choice"]] = acc[d].get(r["Choice"], 0) + n
        if r["Real Precinct"] == "Y":
            key = (r["County"], r["Precinct"])
            prec.setdefault(d, set()).add(key)
            if n:
                rep.setdefault(d, set()).add(key)
    return {d: _reading(list(v), list(v.values()), 100 * len(rep.get(d, ())) / max(1, len(prec.get(d, ()))),
                        "precincts with votes", _fetched(url)) for d, v in acc.items()}


def read_clarity(spec):
    base = spec["base"]
    ver = F.fetch(f"{base}/current_ver.txt").decode().strip()
    url = f"{base}/{ver}/json/en/summary.json"
    out = {}
    for c in json.loads(F.fetch(url)):
        d = _dist(spec["pattern"], c.get("C", ""))
        if d is None:
            continue
        names = [re.sub(r"^[A-Z]{3}\s+", "", n) for n in c["CH"]]
        out[d] = _reading(names, list(c["V"]), 100 * c["PR"] / c["TP"] if c.get("TP") else None,
                          "precincts reporting", _fetched(url))
    return out


def read_fl(spec):
    url = spec["url"]
    raw = F.fetch(url)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:  # Florida writes its file in the Windows character set
        text = raw.decode("cp1252")
    acc, prec = {}, {}
    for r in csv.DictReader(io.StringIO(text), delimiter="\t"):
        if r["OfficeDesc"] != "United States Representative":
            continue
        d = str(int(r["Juris1num"])).zfill(2) if (r["Juris1num"] or "").strip().isdigit() else "00"  # "001" -> "01"
        name = " ".join(x for x in (r["CanNameFirst"], r["CanNameLast"]) if x)
        acc.setdefault(d, {})
        acc[d][name] = acc[d].get(name, 0) + int(r["CanVotes"] or 0)
        prec.setdefault(d, {})[r["CountyName"]] = (int(r["Precincts"] or 0), int(r["PrecinctsReporting"] or 0))
    out = {}
    for d, v in acc.items():
        p = sum(x[0] for x in prec[d].values())
        out[d] = _reading(list(v), list(v.values()), 100 * sum(x[1] for x in prec[d].values()) / p if p else None,
                          "precincts reporting", _fetched(url))
    return out


def read_tx(spec):
    url = spec["url"]
    html = F.fetch(url).decode("utf-8", "replace")
    out = {}
    for title, block in re.findall(r'<div class="election">\s*(.*?)\s*</div>(.*?)</table>', html, re.S):
        d = _dist(spec["pattern"], title)
        if d is None:
            continue
        pm = re.search(r"Reporting:\s*([\d.]+)%", block)
        rows = re.findall(r'<td class="candidate">(.*?)</td><td class="ballot"\s*(?:/>|>(.*?)</td>)', block, re.S)
        names = [re.sub(r"\s+\(I\)$", "", " ".join(n.split())) for n, _ in rows]
        votes = [int(re.sub(r"[^\d]", "", b or "") or 0) for _, b in rows]
        out[d] = _reading(names, votes, float(pm.group(1)) if pm else None, "polling locations reporting", _fetched(url))
    return out


def read_ev(spec):
    """Enhanced Voting (GA, VA, AZ, RI): Virginia's CSV report or Georgia's Excel workbook."""
    site, jur, eid = spec["site"], spec["jurisdiction"], spec["election"]
    d = json.loads(F.fetch(f"{site}/results/public/api/elections/{jur}/{eid}"))
    reports = {r.get("reportName"): r["blobName"] for cat in d.get("publicReportCategories") or []
               for r in cat.get("reports") or []}
    acc, prec, rep = {}, {}, {}
    if "Election Results" in reports:
        url = f"{site}/cdn/results/{d['jurisdictionId']}/{urllib.parse.quote(reports['Election Results'])}"
        for r in csv.DictReader(io.StringIO(F.fetch(url).decode("utf-8-sig", "replace"))):
            dist = _dist(spec["pattern"], r["OfficeTitle"] or "")
            if dist is None:
                continue
            n = int(float(r["TOTAL_VOTES"] or 0))
            acc.setdefault(dist, {})
            acc[dist][r["CandidateName"].strip()] = acc[dist].get(r["CandidateName"].strip(), 0) + n
            key = (r["LocalityName"], r["PrecinctName"])
            prec.setdefault(dist, set()).add(key)
            if n:
                rep.setdefault(dist, set()).add(key)
    elif "Total Votes Excel" in reports or "All Results Excel" in reports:  # Georgia; Utah
        blob = reports.get("Total Votes Excel") or reports["All Results Excel"]
        url = f"{site}/cdn/results/{d['jurisdictionId']}/{urllib.parse.quote(blob)}"
        with tempfile.NamedTemporaryFile(suffix=".xlsx") as tmp:
            tmp.write(F.fetch(url))
            tmp.flush()
            sheets = xlsx.sheet_names(tmp.name)
            rows = list(xlsx.rows(tmp.name, "Total Votes" if "Total Votes" in sheets else "Summary Results"))
        for r in rows[1:]:
            dist = _dist(spec["pattern"], r[0] or "")
            if dist is None or re.fullmatch(r"(total votes|ballots cast|over ?votes|under ?votes)", (r[2] or "").strip(), re.I):
                continue  # not candidates: totals, and over/under votes (Utah)
            name = re.sub(r"(\s*\([A-Za-z]+\))+$", "", r[2]).strip()
            acc.setdefault(dist, {})
            acc[dist][name] = acc[dist].get(name, 0) + int(float(r[5] or 0))
    else:
        raise ValueError(f"{jur}: no results report yet")
    return {k: _reading(list(v), list(v.values()),
                        100 * len(rep.get(k, ())) / len(prec[k]) if prec.get(k) else None,
                        "precincts with votes" if prec.get(k) else "", _fetched(url), d.get("asOf"))
            for k, v in acc.items()}


def read_sw_html(spec):
    url = spec["url"]
    page = F.fetch(url).decode("utf-8", "replace")
    out = {}
    for m in re.finditer(r'<div class="display-results-box-a">\s*<h1>(.*?)</h1>', page):
        d = _dist(spec["pattern"], m.group(1))
        if d is None:
            continue
        j = page.find("display-results-box-a", m.end())
        block = page[m.start():j if j > 0 else None]
        rows = re.findall(r'display-results-box-d">\s*<h1>(.*?)</h1>\s*<h2[^>]*>.*?</h2>.*?display-results-box-f">\s*<div>([\d,]*)</div>', block, re.S)
        pm = re.search(r"([\d,]+) out of ([\d,]+) Precincts Reported", block)
        done, total = (int(x.replace(",", "")) for x in pm.groups()) if pm else (0, 0)
        out[d] = _reading([" ".join(n.split()) for n, _ in rows], [int(v.replace(",", "") or 0) for _, v in rows],
                          100 * done / total if total else None, "precincts reporting", _fetched(url))
    return out


def read_ny(spec):
    url = spec["url"]
    page = F.fetch(url).decode("utf-8", "replace")
    out = {}
    parts = re.split(r'(<table class="datatable"[^>]*summary="Results for All Counties [^"]*")', page)
    for head, body in zip(parts[1::2], parts[2::2]):
        title = re.search(r'summary="Results for All Counties ([^"]*)"', head).group(1)
        d = _dist(spec["pattern"], title)
        if d is None:
            continue
        rep = re.search(r"Election Districts Reporting:\s*([\d,]+) of ([\d,]+)", body)
        names, votes = [], []
        for row in re.findall(r"<tr>(.*?)</tr>", body, re.S):
            cells = re.findall(r'<td class="([^"]*)"[^>]*>(.*?)</td>', row, re.S)
            if not cells or cells[0][0] != "resultsColumnData":
                continue
            name = " ".join(re.sub(r"<[^>]+>", "", cells[0][1]).split())
            if not name or name.lower().startswith(("blank", "void", "scattering")):
                continue
            names.append(name)
            votes.append(int(re.sub(r"[^\d]", "", re.sub(r"<[^>]+>", "", cells[-1][1])) or 0))
        done, total = (int(x.replace(",", "")) for x in rep.groups()) if rep else (0, 0)
        out[d] = _reading(names, votes, 100 * done / total if total else None, "election districts reporting", _fetched(url))
    return out


def read_md(spec):
    """Maryland: one page for all districts, each under <h3>District N</h3> with its own table
    (name, party, vote types, total, percentage; "NR" = not reported, a closing "Totals" row)."""
    url = spec["url"]
    page = F.fetch(url).decode("utf-8", "replace")
    parts = re.split(r"<h3>District (\d+)</h3>", page)
    out = {}
    for num, body in zip(parts[1::2], parts[2::2]):
        names, votes = [], []
        for name, party, cells in re.findall(r"<tr>\s*<td><div>(.*?)</div></td>\s*<td>(.*?)</td>(.*?)</tr>", body, re.S):
            name = " ".join(re.sub(r"<[^>]+>", "", name).split())
            nums = [re.sub(r"[^\d]", "", x) for x in re.findall(r'<td class="alignRight">(.*?)</td>', cells, re.S)]
            if len(nums) < 2 or name.lower().startswith("total"):
                continue  # the "Totals" row would count every vote twice
            names.append(name)
            votes.append(int(nums[-2] or 0))
        m = re.search(r"\((\d[\d,]*) of (\d[\d,]*) election day precincts reported\)", body)
        done, total = (int(x.replace(",", "")) for x in m.groups()) if m else (0, 0)
        out[num.zfill(2)] = _reading(names, votes, 100 * done / total if total else None,
                                     "election day precincts reporting", _fetched(url))
    return out


def read_in(spec):
    """Indiana: the results app's own JSON files. settings.json names the current version
    ("A" or "B"); OffCatC_1005_<version>.json holds every US House race with statewide
    totals per district. No precinct counts, so no share counted."""
    base = spec["base"]
    root = lambda b: (lambda j: j.get("Root", j))(json.loads(b.decode("utf-8-sig")))
    ver = root(F.fetch(f"{base}/settings.json"))["VersionType"]
    url = f"{base}/OffCatC_1005_{ver}.json"
    d = root(F.fetch(url))
    races = d["StatewideSummary"]["Race"]
    out = {}
    for r in races if isinstance(races, list) else [races]:
        dist = _dist(spec["pattern"], r["SubSortOrder"])
        if dist is None:
            continue
        cands = r["Candidates"]["Candidate"]
        cands = cands if isinstance(cands, list) else [cands]
        names = [re.sub(r"\s*\(W/I\)$", "", c["NAME_ON_BALLOT"]).strip() for c in cands]
        out[dist] = _reading(names, [int(c["TOTAL"] or 0) for c in cands], None, "", _fetched(url), d.get("WriteTime"))
    return out


def read_nd(spec):
    """North Dakota: the statewide results page (same vendor as Oregon, different markup).
    Before election night the page still shows the last general (2024), so it is read only
    when its hidden election date is this election's."""
    url = spec["url"]
    page = F.fetch(url).decode("utf-8", "replace")
    m = re.search(r'id="hidElectionDate" value="([^"]*)"', page)
    if not m or m.group(1) != spec["date"]:
        raise ValueError(f"ND page shows the election of {m.group(1) if m else '?'}, not {spec['date']}")
    out = {}
    for m in re.finditer(r'<div class="display-results-box-a">\s*<h1>(.*?)</h1>', page):
        d = _dist(spec["pattern"], m.group(1))
        if d is None:
            continue
        j = page.find('<div class="display-results-box-a">', m.end())
        block = page[m.start():j if j > 0 else None]
        rows = re.findall(r'display-results-box-d"[^>]*>\s*<h2>(.*?)</h2>.*?display-results-box-g"\s*>([\d,]*)</h2>', block, re.S)
        pm = re.search(r"Precincts Fully:\s*([\d,]+)\s*/\s*([\d,]+)", block)
        done, total = (int(x.replace(",", "")) for x in pm.groups()) if pm else (0, 0)
        out[d] = _reading([" ".join(n.split()) for n, _ in rows], [int(v.replace(",", "") or 0) for _, v in rows],
                          100 * done / total if total else None, "precincts fully reported", _fetched(url))
    return out


def read_single(reader, src):
    """At-large states (DE, SD): the existing single-contest readers."""
    import live_sources as S
    return {"00": S.READERS[reader]({"st": src["st"]}, src)}


EV = "(?:US House of Representatives - District (\\d+)|Member, House of Representatives \\((\\d+)\\w\\w District\\)|U\\.?S\\.? (?:Representative|House)[^\\d]*(\\d+))"

# state -> how to read its US House races (name, url, reader, pattern); 2026 addresses
HOUSE = {
    "NC": {"read": read_nc, "url": "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2026_11_03/results_pct_20261103.zip",
           "pattern": r"US HOUSE OF REPRESENTATIVES DISTRICT (\d+)", "name": "North Carolina State Board of Elections"},
    "SC": {"read": read_clarity, "base": "https://www.enr-scvotes.org/SC/127300",
           "pattern": r"U\.S\. House of Representatives, District (\d+)", "name": "South Carolina Election Commission"},
    "IA": {"read": read_clarity, "base": "https://electionresults.iowa.gov/IA/127077",
           "pattern": r"United States Representative District (\d+)", "name": "Iowa Secretary of State"},
    "FL": {"read": read_fl, "url": "https://results.elections.myflorida.com/ResultsExtract.Asp?ElectionDate=11/3/2026"
                                   "&OfficialResults=N&PartyRaces=N&DataMode=&FormsButton2=Download",
           "name": "Florida Division of Elections"},
    "TX": {"read": read_tx, "url": "https://electionresults.sos.state.tx.us/results.html",
           "pattern": r"U\. S\. REPRESENTATIVE DISTRICT (\d+)", "name": "Texas Secretary of State"},
    "GA": {"read": read_ev, "site": "https://results.sos.ga.gov", "jurisdiction": "Georgia",
           "election": "11032026GeneralAndSpecialElection", "pattern": r"US House of Representatives - District (\d+)",
           "name": "Georgia Secretary of State"},
    "VA": {"read": read_ev, "site": "https://enr.elections.virginia.gov", "jurisdiction": "Virginia",
           "election": "2026-November-General", "pattern": r"Member, House of Representatives \((\d+)\w\w District\)",
           "name": "Virginia Department of Elections"},
    "UT": {"read": read_ev, "site": "https://electionresults.utah.gov", "jurisdiction": "Utah",
           "election": "General11032026", "pattern": r"U\.S\. House District (\d+)", "name": "Utah Lieutenant Governor (Elections)"},
    # Washington moved to Enhanced Voting (results.vote.wa.gov/results/current redirects there);
    # its 2026 report has Utah's layout. No earlier general on the platform to test against.
    "WA": {"read": read_ev, "site": "https://results.votewa.gov", "jurisdiction": "Washington",
           "election": "20261103", "pattern": r"Congressional District (\d+) - U\.S\. Representative",
           "name": "Washington Secretary of State"},
    "IN": {"read": read_in, "base": "https://enr.indianavoters.in.gov/site/data",
           "pattern": r"United States Representative, \((\d+)\) District", "name": "Indiana Election Division"},
    "ND": {"read": read_nd, "url": "https://results.sos.nd.gov/ResultsSW.aspx?text=All&type=SW&map=CTY",
           "date": "11/3/2026", "pattern": r"Representative in Congress", "name": "North Dakota Secretary of State"},
    "MD": {"read": read_md, "url": "https://elections.maryland.gov/elections/2026/general_results/gen_results_2026_4.html",
           "name": "Maryland State Board of Elections"},
    "OR": {"read": read_sw_html, "url": "https://results.oregonvotes.gov/resultsSW.aspx?type=FED&map=CTY",
           "pattern": r"US Representative, (\d+)\w\w District", "name": "Oregon Secretary of State"},
    "NY": {"read": read_ny, "url": "https://nyenr.elections.ny.gov/HomeNoJS.aspx",
           "pattern": r"(\d+)\w\w Congressional District", "name": "New York State Board of Elections"},
    "DE": {"read": lambda spec: read_single("de", {"st": "DE", "base": "https://elections.delaware.gov/results/enr",
                                                    "election": "GE2026", "contest": "Representative In Congress"}),
           "name": "Delaware Department of Elections"},
    "SD": {"read": lambda spec: read_single("sw_csv", {"st": "SD", "contest": "United States Representative",
                                                        "csv": "https://electionresults.sd.gov/resultsCSV.aspx?text=All&type=SWR&map=CTY"}),
           "name": "South Dakota Secretary of State"},
}
