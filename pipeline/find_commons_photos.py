"""Find freely licensed photos on Wikimedia Commons for tonight's candidates who have no
official congressional portrait, and write a review sheet. Nothing is used until the owner
approves it (pipeline/fetch_commons_photos.py does the download for approved photos).

    uv run pipeline/find_commons_photos.py

For each candidate: search Wikipedia for their article (must describe them as a politician
or candidate), take the photo from the article's infobox, and read that file's license and
author on its Commons page. Only public domain, CC0, CC BY and CC BY-SA are accepted; files
that live on Wikipedia only (usually non-free) are rejected.

Wikimedia's robots.txt closes its data APIs (/w/, /api/) to scripts, and its public search
API rate-limits anonymous scripts, so this uses only ordinary pages robots.txt allows:
articles at their plain address and Commons file pages, through the polite fetcher
(pipeline/live_fetch.py), one request a second.

Writes data/raw/people/candidates.json and a review sheet, data/raw/people/review.html.
"""

import html
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

import live_fetch as F

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "people"
STATE_NAMES = {s["abbr"]: s["name"] for s in json.loads((ROOT / "web/data/results.json").read_text())["states"].values()}
FREE = re.compile(r"^(public domain|pd\b|cc0|cc[- ]by(-sa)?[- ][0-9.]+|cc[- ]by(-sa)?$)", re.I)


def get(url):
    time.sleep(1)  # one request a second
    return F.fetch(url, min_interval=24 * 3600).decode("utf-8", "replace")


def article(title):
    """HTML of an English Wikipedia article, or None if there is no such page."""
    try:
        return get("https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")))
    except (F.Refused, OSError):
        return None


def find_article(name, st):
    """The candidate's English Wikipedia article: (title, short description, html), or Nones.

    Tries the plain name, then "(politician)" forms; the page must not be a disambiguation
    page, must describe a politician or candidate, and must mention the state.
    """
    state = STATE_NAMES[st]
    for title in (name, f"{name} (politician)", f"{name} (American politician)"):
        page = article(title)
        if not page or 'id="disambigbox"' in page or "may refer to:" in page:
            continue
        m = re.search(r'<div class="shortdescription[^"]*"[^>]*>(.*?)</div>', page, re.S)
        desc = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""
        if state not in page[:200000]:
            continue
        if re.search(r"politician|candidate|senator|governor|attorney|official|legislator|representative|physician|businessman|lawyer|activist", desc, re.I):
            return title, desc, page
    return None, None, None


def infobox_file(page):
    """(file name, hosted on Commons?) of the infobox photo, or (None, None)."""
    i = page.find('class="infobox')
    if i < 0:
        return None, None
    box = page[i:i + 20000]
    m = re.search(r'href="(?:https://en\.wikipedia\.org)?/wiki/File:([^"]+)"', box)
    if not m:
        return None, None
    img = re.search(r'<img [^>]*src="([^"]+)"', box[m.start():])
    on_commons = bool(img and "/wikipedia/commons/" in img.group(1))
    return urllib.parse.unquote(m.group(1)), on_commons


def commons_info(file):
    """License, author and thumbnail of a Commons file, or None if it is not on Commons."""
    url = "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(file)
    try:
        page = get(url)
    except Exception:
        return None
    page = page.replace("&#95;", "_")  # Commons escapes underscores in its markup
    if "commons.wikimedia.org" not in page or "licensetpl" not in page and "fileinfotpl" not in page:
        return None
    lic = re.findall(r'<span class="licensetpl_short"[^>]*>(.*?)</span>', page, re.S)
    lic = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in lic]
    aut = re.search(r'id="fileinfotpl_aut".*?<td[^>]*>(.*?)</td>', page, re.S)
    author = html.unescape(re.sub(r"<[^>]+>", "", aut.group(1))).strip() if aut else ""
    author = " ".join(author.split())[:120]
    thumb = re.search(r'<meta property="og:image" content="([^"]+)"', page)
    return {"page": url, "licenses": lic, "author": author, "thumb": thumb.group(1) if thumb else None}


def main():
    live = {"races": [r for o in ("senate", "governor")  # tonight's Senate and governor candidates
                      for r in json.loads((ROOT / f"web/data/live/{o}.json").read_text())["races"].values()]}
    congress = set(json.loads((ROOT / "web/img/congress/congress.json").read_text()))
    OUT.mkdir(parents=True, exist_ok=True)
    abbr = {v: k for k, v in {s: f for f, s in []}.items()}
    fips_to_abbr = {f: s["abbr"] for f, s in json.loads((ROOT / "web/data/results.json").read_text())["states"].items()}
    seen, found = set(), []
    for race in live["races"]:
        st = fips_to_abbr[race["st"]]
        for c in race["cands"]:
            key = f"{st.lower()}-{c['last'].lower()}"
            if key in seen or c.get("bio") in congress or c["party"] not in ("D", "R", "I"):
                continue
            seen.add(key)
            rec = {"key": key, "name": c["name"], "state": st, "race": race["id"], "status": "not found"}
            title, desc, page = find_article(c["name"], st)
            if title:
                rec.update(article=title, description=desc)
                file, on_commons = infobox_file(page)
                if file and not on_commons:
                    rec["file"] = file
                    rec["status"] = "photo is on Wikipedia only (usually non-free): skipped"
                elif file:
                    rec["file"] = file
                    info = commons_info(file)
                    if not info:
                        rec["status"] = "photo is not on Commons (usually non-free): skipped"
                    else:
                        rec.update(info)
                        ok = next((x for x in info["licenses"] if FREE.match(x)), None)
                        rec["license"] = ok or ", ".join(info["licenses"]) or "unknown"
                        rec["status"] = "free license: needs your approval" if ok else "license not free: skipped"
                else:
                    rec["status"] = "article has no infobox photo"
            print(f"{key:20} {rec['status']:45} {rec.get('article', '')} | {rec.get('license', '')} | {rec.get('author', '')[:40]}", flush=True)
            found.append(rec)
    (OUT / "candidates.json").write_text(json.dumps(found, indent=2, ensure_ascii=False) + "\n")
    rows = []
    for r in found:
        img = f'<img src="{html.escape(r["thumb"])}" alt="">' if r.get("thumb") and r["status"].startswith("free") else ""
        rows.append(f"""<tr class="{'ok' if r['status'].startswith('free') else 'no'}"><td>{img}</td>
          <td><b>{html.escape(r['name'])}</b> ({r['state']}, {r['race']})<br><small>{html.escape(r.get('description', ''))}</small></td>
          <td>{html.escape(r['status'])}</td><td>{html.escape(r.get('license', ''))}</td><td>{html.escape(r.get('author', ''))}</td>
          <td>{f'<a href="{html.escape(r["page"])}">Commons page</a>' if r.get('page') else ''}</td></tr>""")
    (OUT / "review.html").write_text(f"""<!doctype html><meta charset="utf-8"><title>Photo review</title>
<style>body{{font:14px system-ui;margin:24px}} td{{border-top:1px solid #ccc;padding:8px;vertical-align:top}}
img{{width:110px;height:110px;object-fit:cover;object-position:top;border-radius:50%}} tr.no{{color:#888}}</style>
<h1>Candidate photos from Wikimedia Commons</h1>
<p>Check that each photo shows the right person. Only rows marked "needs your approval" can be used.</p>
<table>{''.join(rows)}</table>""")
    print(f"\nReview sheet: {OUT / 'review.html'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
