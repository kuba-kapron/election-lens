"""The races followed live on 3 November 2026, and where their numbers come from.

Each race lists its sources in order of preference: the state's official results first,
civicAPI (unofficial, civicapi.org) as the fallback. Louisiana's robots.txt does not allow
scripts on its results data, Ohio's and Michigan's sites block scripts, Georgia's 2026
results were not published yet, and Mississippi and Maine have no statewide live results,
so those races start on civicAPI. Manual entries (pipeline/live_manual.py) override both.
The other 25 Senate races (added later on 3 November) use civicAPI only.

Poll closing times: CBS News, "Here's when polls open and close for 2026 midterm elections"
(https://www.cbsnews.com/news/when-polls-open-close-2026-midterm-elections/), which gives the
time a state's last polls close (all_closed). polls_close is an hour earlier only where CBS
says most of the state closes earlier (Texas, Alaska, Florida, eastern Kentucky).

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
     "sources": [{"kind": "clarity", "base": "https://www.enr-scvotes.org/SC/127300", "contest": "U.S.  Senate",
                  "name": "South Carolina Election Commission", "page": "https://www.enr-scvotes.org/SC/127300/"},
                 {"kind": "civicapi", "race": 87409}]},
    {"id": "GA-sen", "st": "GA", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T00:00Z",
     "prev": (2020, "regular"),
     "cands": [("Jon Ossoff", "D"), ("Mike Collins", "R")],
     "sources": [{"kind": "ev", "site": "https://results.sos.ga.gov", "jurisdiction": "Georgia",
                  "election": "11032026GeneralAndSpecialElection", "name": "Georgia Secretary of State",
                  "page": "https://results.sos.ga.gov/results/public/Georgia/elections/11032026GeneralAndSpecialElection"},
                 {"kind": "civicapi", "race": 87087}]},
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
    {"id": "MI-sen", "st": "MI", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"),
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
    # the other 25 Senate races: civicAPI only
    {"id": "AK-sen", "st": "AK", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T05:00Z", "all_closed": "2026-11-04T06:00Z",
     "prev": (2020, "regular"), "cands": [('Mary Peltola', 'D'), ('Gerald Heikes', 'R'), ('Dan Sullivan', 'R'), ('Daniel J. Sullivan Jr.', 'O')],
     "sources": [{"kind": "civicapi", "race": 86916}]},
    {"id": "AL-sen", "st": "AL", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [('Everett Wess', 'D'), ('Barry Moore', 'R')],
     "sources": [{"kind": "civicapi", "race": 86907}]},
    {"id": "AR-sen", "st": "AR", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:30Z",
     "prev": (2020, "regular"), "cands": [('Hallie Shoffner', 'D'), ('Tom Cotton', 'R'), ('Jeff Wadlin', 'L')],
     "sources": [{"kind": "civicapi", "race": 86949}]},
    {"id": "CO-sen", "st": "CO", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"), "cands": [('John Hickenlooper', 'D'), ('Mark Baisley', 'R'), ('Bob Chew', 'O'), ('Christopher Baum', 'O'), ('Blake Huber', 'L'), ('Adam Withrow', 'O'), ('Donald Willoughby', 'O'), ('Will Powers', 'O'), ('Ryan Apelbaum', 'O')],
     "sources": [{"kind": "civicapi", "race": 87022}]},
    {"id": "DE-sen", "st": "DE", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [('Chris Coons', 'D'), ('Mike Katz', 'R')],
     "sources": [{"kind": "de", "base": "https://elections.delaware.gov/results/enr", "election": "GE2026",
                  "contest": "U.S. Senator", "name": "Delaware Department of Elections",
                  "page": "https://elections.delaware.gov/results/enr/GE2026.html"},
                 {"kind": "civicapi", "race": 87036}]},
    {"id": "IA-sen", "st": "IA", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T03:00Z",
     "prev": (2020, "regular"), "cands": [('Josh Turek', 'D'), ('Ashley Hinson', 'R'), ('Thomas Laehn', 'L')],
     "sources": [{"kind": "clarity", "base": "https://electionresults.iowa.gov/IA/127077", "contest": "United States Senator",
                  "name": "Iowa Secretary of State", "page": "https://electionresults.iowa.gov/IA/127077/"},
                 {"kind": "civicapi", "race": 87151}]},
    {"id": "ID-sen", "st": "ID", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T04:00Z",
     "prev": (2020, "regular"), "cands": [('Jim Risch', 'R'), ('Matt Loesby', 'L'), ('Natalie Fleming', 'I'), ('Todd Achilles', 'I')],
     "sources": [{"kind": "civicapi", "race": 87103}]},
    {"id": "IL-sen", "st": "IL", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [('Juliana Stratton', 'D'), ('Don Tracy', 'R'), ('Whitfield Harrington Jr.', 'O')],
     "sources": [{"kind": "civicapi", "race": 87129}]},
    {"id": "KS-sen", "st": "KS", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"), "cands": [('Adam Hamilton', 'D'), ('Roger Marshall', 'R'), ('David Graham', 'L')],
     "sources": [{"kind": "civicapi", "race": 87162}]},
    {"id": "KY-sen", "st": "KY", "office": "senate", "seat": "regular", "polls_close": "2026-11-03T23:00Z", "all_closed": "2026-11-04T00:00Z",
     "prev": (2020, "regular"), "cands": [('Charles Booker', 'D'), ('Andy Barr', 'R'), ('Christopher Campbell', 'O')],
     "sources": [{"kind": "civicapi", "race": 87174}]},
    {"id": "MA-sen", "st": "MA", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [('Ed Markey', 'D'), ('John Deaton', 'R'), ('Joe Tache', 'O'), ('Shiva Ayyadurai', 'I')],
     "sources": [{"kind": "civicapi", "race": 87275}]},
    {"id": "MN-sen", "st": "MN", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"), "cands": [('Peggy Flanagan', 'D'), ('Michele Tafoya', 'R'), ('Marisa Simonetti', 'I'), ('Rebecca Whiting', 'L')],
     "sources": [{"kind": "civicapi", "race": 87229}]},
    {"id": "MT-sen", "st": "MT", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T03:00Z",
     "prev": (2020, "regular"), "cands": [('Alani Bankhead', 'D'), ('Kurt Alme', 'R'), ('Kyle Austin', 'L'), ('Seth Bodnar', 'I')],
     "sources": [{"kind": "civicapi", "race": 87247}]},
    {"id": "NE-sen", "st": "NE", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T03:00Z",
     "prev": (2020, "regular"), "cands": [('Pete Ricketts', 'R'), ('Mike Marvin', 'O'), ('Robin Richards', 'O'), ('Chuck Conboy', 'O'), ('Dan Osborn', 'I')],
     "sources": [{"kind": "civicapi", "race": 87254}]},
    {"id": "NH-sen", "st": "NH", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [('Chris Pappas', 'D'), ('John Sununu', 'R'), ('Edmond Laplante', 'O')],
     "sources": [{"kind": "civicapi", "race": 87283}]},
    {"id": "NJ-sen", "st": "NJ", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [('Cory Booker', 'D'), ('Justin Murphy', 'R'), ('Joanne Kuniansky', 'O'), ('Veronica Fernandez', 'I')],
     "sources": [{"kind": "civicapi", "race": 87302}]},
    {"id": "NM-sen", "st": "NM", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"), "cands": [('Ben Ray Luján', 'D'), ('Larry Marker', 'R')],
     "sources": [{"kind": "civicapi", "race": 87288}]},
    {"id": "OK-sen", "st": "OK", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [("N'Kiyla Jasmine Thomas", 'D'), ('Kevin Hern', 'R'), ('Sevier White', 'L'), ('Ron Meinhardt', 'I'), ('Curtis Stinnett', 'I')],
     "sources": [{"kind": "civicapi", "race": 87526}]},
    {"id": "OR-sen", "st": "OR", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T04:00Z",
     "prev": (2020, "regular"), "cands": [('Jeff Merkley', 'D'), ('David Brock Smith', 'R'), ('Gary Lyndon Dye', 'L'), ('Chris Henry', 'O')],
     "sources": [{"kind": "sw_html", "url": "https://results.oregonvotes.gov/resultsSW.aspx?type=FED&map=CTY",
                  "contest": "US Senator", "name": "Oregon Secretary of State", "page": "https://results.oregonvotes.gov/"},
                 {"kind": "civicapi", "race": 87374}]},
    {"id": "RI-sen", "st": "RI", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T01:00Z",
     "prev": (2020, "regular"), "cands": [('Jack Reed', 'D'), ('Raymond McKay', 'R'), ('Michael Bahry', 'I')],
     "sources": [{"kind": "ev", "site": "https://electionresults.ri.gov", "jurisdiction": "rhodeisland",
                  "election": "2026StatewideGeneralElection", "name": "Rhode Island Board of Elections",
                  "page": "https://electionresults.ri.gov/results/public/rhodeisland/elections/2026StatewideGeneralElection"},
                 {"kind": "civicapi", "race": 87396}]},
    {"id": "SD-sen", "st": "SD", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"), "cands": [('Mike Rounds', 'R'), ('Brian Bengs', 'I')],
     "sources": [{"kind": "sw_csv", "csv": "https://electionresults.sd.gov/resultsCSV.aspx?text=All&type=SWR&map=CTY",
                  "contest": "United States Senator", "name": "South Dakota Secretary of State",
                  "page": "https://electionresults.sd.gov/"},
                 {"kind": "civicapi", "race": 87446}]},
    {"id": "TN-sen", "st": "TN", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"), "cands": [('Marquita Bradshaw', 'D'), ('Bill Hagerty', 'R'), ('Tharon Chandler', 'I'), ('Andrew Gerena', 'I'), ('Jeremy Dean Hearn', 'I'), ('Robert Jones', 'I'), ('James William Macon III', 'I'), ('Yoshi Matthews', 'I'), ('David Sutman, Jr.', 'I'), ('Catherine Barcel Whitson', 'I')],
     "sources": [{"kind": "civicapi", "race": 87475}]},
    {"id": "VA-sen", "st": "VA", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T00:00Z",
     "prev": (2020, "regular"), "cands": [('Mark Warner', 'D'), ('Bert Mizusawa', 'R')],
     "sources": [{"kind": "ev", "site": "https://enr.elections.virginia.gov", "jurisdiction": "Virginia",
                  "election": "2026-November-General", "name": "Virginia Department of Elections",
                  "page": "https://enr.elections.virginia.gov/results/public/virginia/elections/2026-November-General"},
                 {"kind": "civicapi", "race": 87472}]},
    {"id": "WV-sen", "st": "WV", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T00:30Z",
     "prev": (2020, "regular"), "cands": [('Rachel Fetty Anderson', 'D'), ('Shelley Moore Capito', 'R'), ('S. Marshall Wilson', 'O')],
     "sources": [{"kind": "civicapi", "race": 87477}]},
    {"id": "WY-sen", "st": "WY", "office": "senate", "seat": "regular", "polls_close": "2026-11-04T02:00Z",
     "prev": (2020, "regular"), "cands": [('James Byrd', 'D'), ('Harriet Hageman', 'R')],
     "sources": [{"kind": "civicapi", "race": 87496}]},
]

# Poll closing times for every state (House races), from the same CBS News list: (first close,
# all closed) in UTC; one value means both. First close only where CBS says most of the state
# closes an hour earlier (AK, FL, KY, TX) or the eastern part closes earlier (IN, KY: 6 p.m. ET).
STATE_CLOSE = {
    "AL": "01:00", "AK": ("05:00", "06:00"), "AZ": "02:00", "AR": "01:30", "CA": "04:00", "CO": "02:00",
    "CT": "01:00", "DE": "01:00", "FL": ("00:00", "01:00"), "GA": "00:00", "HI": "05:00", "ID": "04:00",
    "IL": "01:00", "IN": ("23:00", "00:00"), "IA": "03:00", "KS": "02:00", "KY": ("23:00", "00:00"),
    "LA": "02:00", "ME": "01:00", "MD": "01:00", "MA": "01:00", "MI": "02:00", "MN": "02:00", "MS": "01:00",
    "MO": "01:00", "MT": "03:00", "NE": "03:00", "NV": "03:00", "NH": "01:00", "NJ": "01:00", "NM": "02:00",
    "NY": "02:00", "NC": "00:30", "ND": "03:00", "OH": "00:30", "OK": "01:00", "OR": "04:00", "PA": "01:00",
    "RI": "01:00", "SC": "00:00", "SD": "02:00", "TN": "02:00", "TX": ("01:00", "02:00"), "UT": "03:00",
    "VT": "00:00", "VA": "00:00", "WA": "04:00", "WV": "00:30", "WI": "02:00", "WY": "02:00",
}


def close_times(st):
    """(polls_close, all_closed) as ISO times; 23:00 means the evening of 3 November."""
    t = STATE_CLOSE[st]
    first, last = t if isinstance(t, tuple) else (t, t)
    iso = lambda hm: ("2026-11-03T" if hm >= "12:00" else "2026-11-04T") + hm + "Z"
    return iso(first), iso(last)


# House: all 435 races come from one civicAPI request (its race search); civicAPI's own race
# calls are not used. Louisiana's House vote on 3 November is a primary with every candidate
# on one ballot; its House general election is on 12 December (moved after the 2026 map;
# Wikipedia, "2025–2026 United States redistricting").
HOUSE_SEARCH = "https://civicapi.org/api/v2/race/search?type=House%20of%20Representatives&election_date=2026-11-03&limit=1000"
HOUSE_NOTES = {"LA": "Louisiana's House vote on 3 November is a primary with every candidate on one ballot; "
                     "the House general election is on 12 December."}

SUFFIXES = {"JR", "JR.", "SR", "SR.", "II", "III", "IV"}


def last_name(name):
    """Last name, skipping suffixes: "Daniel J. Sullivan Jr." -> "Sullivan"."""
    words = name.split()
    while len(words) > 1 and words[-1].upper() in SUFFIXES:
        words.pop()
    return words[-1]

SOURCE_NAMES = {
    "nc": ("North Carolina State Board of Elections", "https://er.ncsbe.gov/", True),
    "fl": ("Florida Division of Elections", "https://results.elections.myflorida.com/", True),
    "tx": ("Texas Secretary of State", "https://electionresults.sos.state.tx.us/results.html", True),
    "civicapi": ("civicAPI", "https://civicapi.org/", False),
    "manual": ("Entered by hand", None, False),
    "replay": ("Test replay of 2024 presidential results", None, False),
}
