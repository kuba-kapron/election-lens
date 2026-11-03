"""Polite HTTP for the live importer. Every request to a results site goes through fetch().

Rules (agreed with the owner, 3 November 2026):
- at most one request per address every MIN_INTERVAL seconds; a call that comes sooner gets
  the stored copy instead of a new request;
- at least SPACING seconds between any two requests to the same site, so many addresses on
  one site (civicAPI's 35 Senate races) are asked one after another, not all at once;
- identify honestly as ElectionLens, with no browser disguise and no personal details;
- follow robots.txt, read once per site;
- ask "changed since?" (ETag / Last-Modified) so unchanged files are not downloaded again;
- on 403, 429 or a server error, back off: wait longer each time, and after BLOCK_AFTER
  refusals in a row stop asking that site for the rest of the night (the race goes to the
  next source or manual entry). Never try to get around a block.

Copies of each response are kept in data/raw/live/ (not committed) so the importer can be
re-run without asking the sites again.
"""

import gzip
import hashlib
import json
import time
import urllib.error
import urllib.request
import urllib.robotparser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "live"
USER_AGENT = "ElectionLens/0.1 (election results map, hobby project)"
MIN_INTERVAL = 180  # seconds between requests to the same address
SPACING = 1.5  # seconds between requests to the same site
BLOCK_AFTER = 3  # refusals in a row before a site is left alone
TIMEOUT = 45

_robots = {}
_state = {}  # per host: {"fails": n, "wait_until": t, "last": t}


class Refused(Exception):
    """The site said no (blocked, robots.txt, or too many errors): use another source."""


def _host(url):
    return urlsplit(url).netloc


def _allowed(url):
    parts = urlsplit(url)
    base = f"{parts.scheme}://{parts.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                rp.parse(r.read().decode("utf-8", "replace").splitlines())
        except urllib.error.HTTPError as e:
            # no robots.txt (404) means no rules; a refusal (403) is handled by the request itself
            rp.parse([] if e.code in (404, 410) else ["User-agent: *", "Allow: /"])
        except (urllib.error.URLError, TimeoutError):
            rp.parse([])
        _robots[base] = rp
    return _robots[base].can_fetch(USER_AGENT, url)


def _plain(data, url):
    """Unpack gzip-compressed responses (some sites send them compressed regardless)."""
    if data[:2] == b"\x1f\x8b" and not url.endswith(".gz"):
        return gzip.decompress(data)
    return data


def _paths(url):
    key = hashlib.sha1(url.encode()).hexdigest()[:16]
    return CACHE / f"{key}.body", CACHE / f"{key}.meta.json"


def cached(url):
    """The stored copy of url (bytes) and when it was fetched, or (None, None)."""
    body, meta = _paths(url)
    if not body.exists():
        return None, None
    return _plain(body.read_bytes(), url), json.loads(meta.read_text()).get("fetched")


def fetch(url, min_interval=MIN_INTERVAL):
    """Body of url (bytes), from the site at most once per min_interval, else the stored copy.

    Raises Refused when the site blocks us or we have given up on it for tonight.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    body_path, meta_path = _paths(url)
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    now = time.time()
    if body_path.exists() and now - meta.get("fetched", 0) < min_interval:
        return _plain(body_path.read_bytes(), url)
    host = _host(url)
    hs = _state.setdefault(host, {"fails": 0, "wait_until": 0})
    if hs["fails"] >= BLOCK_AFTER:
        raise Refused(f"{host}: refused {hs['fails']} times, left alone for tonight")
    if now < hs["wait_until"]:
        if body_path.exists():
            return _plain(body_path.read_bytes(), url)
        raise Refused(f"{host}: backing off for {int(hs['wait_until'] - now)} s")
    if not _allowed(url):
        hs["fails"] = BLOCK_AFTER
        raise Refused(f"{host}: robots.txt does not allow {url}")
    gap = time.time() - hs.get("last", 0)
    if gap < SPACING:
        time.sleep(SPACING - gap)
    hs["last"] = time.time()
    headers = {"User-Agent": USER_AGENT}
    if body_path.exists():
        if meta.get("etag"):
            headers["If-None-Match"] = meta["etag"]
        if meta.get("last_modified"):
            headers["If-Modified-Since"] = meta["last_modified"]
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=TIMEOUT) as r:
            data = _plain(r.read(), url)
            if b"captcha" in data[:20000].lower() and b"<html" in data[:2000].lower():
                # a bot-check page, not results: treat it as a refusal, never try to get past it
                hs["fails"] = BLOCK_AFTER
                raise Refused(f"{host}: answered with a bot check (captcha); left alone")
            meta = {"url": url, "fetched": now, "etag": r.headers.get("ETag"),
                    "last_modified": r.headers.get("Last-Modified")}
            body_path.write_bytes(data)
            meta_path.write_text(json.dumps(meta))
            hs["fails"] = 0
            return data
    except urllib.error.HTTPError as e:
        if e.code == 304:  # not changed since last time
            meta["fetched"] = now
            meta_path.write_text(json.dumps(meta))
            hs["fails"] = 0
            return _plain(body_path.read_bytes(), url)
        if e.code in (403, 429) or e.code >= 500:
            hs["fails"] += 1
            hs["wait_until"] = now + min_interval * 2 ** hs["fails"]
            raise Refused(f"{host}: HTTP {e.code} (refusal {hs['fails']} of {BLOCK_AFTER})") from e
        raise
    except (urllib.error.URLError, TimeoutError) as e:
        hs["fails"] += 1
        hs["wait_until"] = now + min_interval * 2 ** hs["fails"]
        raise Refused(f"{host}: {e} (failure {hs['fails']} of {BLOCK_AFTER})") from e
