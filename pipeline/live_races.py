"""The races followed live on 3 November 2026, and where their numbers come from.

Each race lists its sources in order of preference: the state's official results first,
civicAPI (unofficial, civicapi.org) as the fallback. Louisiana's robots.txt does not allow
scripts on its results data, Ohio's and Michigan's sites block scripts, Georgia's 2026
results were not published yet, and Mississippi and Maine have no statewide live results,
so those races start on civicAPI. Manual entries (pipeline/live_manual.py) override both.

Candidates are listed as the official ballot names them (civicAPI where the state has no
list); anyone else's votes go to "other". Times are UTC (Warsaw = UTC+1).
"""

RACES = [
    {"id": "NC-sen", "st": "NC", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T00:30Z",
     "prev": (2020, "regular"),
     "cands": [("Roy Cooper", "D"), ("Michael Whatley", "R"), ("Shannon Bray", "L"), ("Michael Dublin", "G")],
     "sources": [{"kind": "nc", "contest": "US SENATE"}, {"kind": "civicapi", "race": 87346}]},
    {"id": "SC-sen", "st": "SC", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T00:00Z",
     "prev": (2020, "regular"),
     "cands": [("Annie Andrews", "D"), ("Darline Graham", "R"), ("Kasie Whitener", "L"), ("Mark Hackett", "O")],
     "sources": [{"kind": "sc", "election": 127300, "contest": "U.S.  Senate"}, {"kind": "civicapi", "race": 87409}]},
    {"id": "GA-sen", "st": "GA", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T00:00Z",
     "prev": (2020, "regular"),
     "cands": [("Jon Ossoff", "D"), ("Mike Collins", "R")],
     "sources": [{"kind": "civicapi", "race": 87087}]},
    {"id": "FL-sen", "st": "FL", "office": "senate", "seat": "special", "polls_close": "2026-11-04T00:00Z",
     "all_closed": "2026-11-04T01:00Z", "prev": (2022, "regular"),
     "cands": [("Angie Nixon", "D"), ("Ashley Moody", "R"), ("Neil J. Gillespie", "I")],
     "sources": [{"kind": "fl", "office": "United States Senator"}, {"kind": "civicapi", "race": 87068}]},
    {"id": "OH-sen", "st": "OH", "office": "senate", "seat": "special", "polls_close": "2026-11-04T00:30Z",
     "prev": (2022, "regular"),
     "cands": [("Sherrod Brown", "D"), ("Jon Husted", "R"), ("William B. Redpath", "L")],
     "sources": [{"kind": "civicapi", "race": 87527}]},
    {"id": "OH-gov", "st": "OH", "office": "governor", "seat": "governor", "polls_close": "2026-11-04T00:30Z",
     "prev": None,
     "cands": [("Amy Acton", "D"), ("Vivek Ramaswamy", "R"), ("Don Kissick", "L")],
     "sources": [{"kind": "civicapi", "race": 87365}]},
    {"id": "MI-sen", "st": "MI", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "all_closed": "2026-11-04T02:00Z", "prev": (2020, "regular"),
     "cands": [("Abdul El-Sayed", "D"), ("Mike Rogers", "R"), ("Douglas P. Marsh", "G"), ("Lydia Christensen", "L")],
     "sources": [{"kind": "civicapi", "race": 87214}]},
    {"id": "ME-sen", "st": "ME", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"),
     "cands": [("Troy Jackson", "D"), ("Susan Collins", "R")],
     "sources": [{"kind": "civicapi", "race": 87188}]},
    {"id": "MS-sen", "st": "MS", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"),
     "cands": [("Scott Colom", "D"), ("Cindy Hyde-Smith", "R"), ("Ty Pinkins", "I")],
     "sources": [{"kind": "civicapi", "race": 81004}]},
    {"id": "TX-sen", "st": "TX", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "all_closed": "2026-11-04T02:00Z", "prev": (2020, "regular"),
     "cands": [("James Talarico", "D"), ("Ken Paxton", "R"), ("Ted Brown", "L")],
     "sources": [{"kind": "tx", "contest": "U. S. SENATOR"}, {"kind": "civicapi", "race": 87438}]},
    {"id": "TX-gov", "st": "TX", "office": "governor", "seat": "governor", "polls_close": "2026-11-04T01:00Z",
     "all_closed": "2026-11-04T02:00Z", "prev": None,
     "cands": [("Gina Hinojosa", "D"), ("Greg Abbott", "R"), ("Pat Dixon", "L")],
     "sources": [{"kind": "tx", "contest": "GOVERNOR"}, {"kind": "civicapi", "race": 55857}]},
    {"id": "LA-sen", "st": "LA", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"),
     "cands": [("Jamie Davis", "D"), ("Julia Letlow", "R")],
     "sources": [{"kind": "civicapi", "race": 87183}]},
]

SOURCE_NAMES = {
    "nc": ("North Carolina State Board of Elections", "https://er.ncsbe.gov/", True),
    "sc": ("South Carolina Election Commission", "https://www.enr-scvotes.org/SC/127300/", True),
    "fl": ("Florida Division of Elections", "https://results.elections.myflorida.com/", True),
    "tx": ("Texas Secretary of State", "https://electionresults.sos.state.tx.us/results.html", True),
    "civicapi": ("civicAPI (unofficial count)", "https://civicapi.org/", False),
    "manual": ("Entered by hand", None, False),
    "replay": ("Test replay of 2024 presidential results", None, False),
}
