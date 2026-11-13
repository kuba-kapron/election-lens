"""Build web/data/pl/president.json: Poland's 2025 presidential election, both rounds, by gmina
(Warsaw by district), powiat, voivodeship and the whole country.

    ./pipeline/pl/president/fetch_data.sh            # PKW's files -> data/raw/pl/president/2025/
    uv run -m pipeline.pl.president.build_results

Source: the National Electoral Commission (PKW), every polling station's count
(protokoly_po_obwodach*), summed here to each level. The national totals are PKW's official
ones (kandydaci*: each candidate's votes). Polling stations abroad and on ships count in the
national total only; they have no place on the map. Three stations abroad (Polish military
bases in Irbil and Baghdad, Iraq, and At Tiri, Lebanon) have no figures in the station files;
their votes are in PKW's national totals, so those are a little higher than the sum of the
stations (checked below).

Output (stdlib only):
  {"elections": {"2025": {"rounds": [{"date", "cands": [i, ...], "national": row,
                                      "voivodeships": {id: row}, "powiats": {...}, "gminas": {...},
                                      "abroad": row, "ships": row}, ...],
                          "candidates": [{"name", "full", "ballot", "committee", "party"}]}},
   "names": {"voivodeships": {id: name}, "powiats": {...}, "gminas": {...}}}
  row = [eligible voters, valid ballots, valid votes, votes for each of the round's candidates]
  ids are TERYT codes as in web/data/pl/geo-2025.json: voivodeship 2 digits, powiat 4, gmina 6.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw" / "pl" / "president" / "2025"
OUT = ROOT / "web" / "data" / "pl" / "president.json"

ROUNDS = [("", "2025-05-18"), ("_w_drugiej_turze", "2025-06-01")]
# columns of the station files, by how they start (the full headers are long sentences)
ELIGIBLE = "Liczba wyborców uprawnionych do głosowania"
BALLOTS = "Liczba kart ważnych"
VALID = "Liczba głosów ważnych oddanych łącznie"
# the three stations whose figures are missing; their votes stay in the national totals
MISSING = {"Irbil", "At Tiri", "Bagdad"}
# at most this share of a candidate's votes may be outside the stations' sum (those stations)
MISSING_MAX = 0.0001


def read(name):
    with open(RAW / f"{name}_utf8.csv", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f, delimiter=";"))


def col(row, start):
    """The one column whose header starts with `start`."""
    keys = [k for k in row if k.startswith(start)]
    assert len(keys) == 1, (start, keys)
    return keys[0]


def person(full):
    """'Rafał Kazimierz TRZASKOWSKI' -> 'Rafał Trzaskowski' (first name and surname, as the
    site shows people), plus the surname as PKW writes it in the station files' headers."""
    parts = full.split()
    surname = [p for p in parts if p.isupper() and len(p) > 1]
    first = [p for p in parts if p not in surname]
    return f"{first[0]} {' '.join(s.title() for s in surname)}", " ".join(surname)


def main():
    candidates, rounds, names = [], [], {"voivodeships": {}, "powiats": {}, "gminas": {}}
    index = {}  # surname as in the headers -> position in candidates
    for suffix, date in ROUNDS:
        official = read(f"kandydaci{suffix}")
        cands = []
        for k in official:
            name, surname = person(k["Nazwisko i imiona"])
            if surname not in index:
                index[surname] = len(candidates)
                candidates.append({"name": name, "full": k["Nazwisko i imiona"], "ballot": int(k["Numer na karcie do głosowania"]),
                                   "committee": k["Nazwa komitetu"], "party": k["Przynależność do partii"]})
            cands.append(index[surname])
        stations = read(f"protokoly_po_obwodach{suffix}")
        first = stations[0]
        surname_of = {candidates[i]["full"]: s for s, i in index.items()}
        vote_cols = [next(c for c in first if c.startswith(surname_of[candidates[i]["full"]] + " ")) for i in cands]
        cols = [col(first, ELIGIBLE), col(first, BALLOTS), col(first, VALID)] + vote_cols

        levels = {"voivodeships": {}, "powiats": {}, "gminas": {}}
        abroad, ships = [0] * len(cols), [0] * len(cols)
        empty = []

        def add(row, values):
            for i, v in enumerate(values):
                row[i] += v

        for s in stations:
            if not s[cols[-1]]:
                empty.append(s["Siedziba"])
                continue
            values = [int(s[c]) for c in cols]
            kind = s["Typ obszaru"]
            if kind == "zagranica":
                add(abroad, values)
            elif kind == "statek":
                add(ships, values)
            else:
                g = s["Teryt Gminy"].zfill(6)
                for level, key in (("voivodeships", g[:2]), ("powiats", g[:4]), ("gminas", g)):
                    add(levels[level].setdefault(key, [0] * len(cols)), values)
                names["gminas"].setdefault(g, s["Gmina"])
                names["powiats"].setdefault(g[:4], s["Powiat"])
                names["voivodeships"].setdefault(g[:2], s["Województwo"])

        # the only stations without figures are the three military ones abroad
        assert len(empty) == len(MISSING) and all(any(m in e for m in MISSING) for e in empty), empty
        summed = [sum(r[i] for r in levels["voivodeships"].values()) + abroad[i] + ships[i] for i in range(len(cols))]
        # national: PKW's official votes; valid votes are their sum (every valid vote is for a
        # candidate). Eligible voters and ballots are the stations' sums, without the three
        # military stations (a few hundred people in about 30 million)
        votes = [int(k["Liczba głosów"]) for k in official]
        national = summed[:2] + [sum(votes)] + votes
        for i, k in zip(cands, official):
            got, want = summed[3 + cands.index(i)], int(k["Liczba głosów"])
            assert 0 <= want - got <= MISSING_MAX * want, (k["Nazwisko i imiona"], got, want)
        # every gmina's sum matches PKW's own gmina table (where PKW gives one)
        for g in read(f"wyniki_gl_na_kandydatow_po_gminach{suffix}"):
            t = g["TERYT Gminy"].strip()
            if not t:
                continue  # abroad and ships, by country
            row = levels["gminas"][t.zfill(6)]
            pkw = [int(g[next(c for c in g if c.startswith(surname_of[candidates[i]["full"]] + " "))]) for i in cands]
            assert row[3:] == pkw, (t, row[3:], pkw)
        print(f"Round {len(rounds) + 1} ({date}): {len(stations):,} stations, {len(levels['gminas'])} gminas, "
              f"turnout {national[1] / national[0]:.2%}")
        for i, v in sorted(zip(cands, national[3:]), key=lambda x: -x[1]):
            print(f"  {candidates[i]['name']:25} {v:>11,}  {v / national[2]:6.2%}")
        rounds.append({"date": date, "cands": cands, "national": national, **levels, "abroad": abroad, "ships": ships})

    out = {"elections": {"2025": {"rounds": rounds, "candidates": candidates}},
           "names": {k: dict(sorted(v.items())) for k, v in names.items()}}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
