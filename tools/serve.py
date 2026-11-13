"""Serves web/ on your computer the way Cloudflare Pages serves the public site.

    uv run python tools/serve.py          # http://localhost:8000
    uv run python tools/serve.py 8080     # another port

Like Cloudflare (web/_redirects), every address under /en/ and /pl/ that is not a file gets
index.html, which reads the language and country from the address (web/js/site.js). Each
request is printed. Files are sent with "check for a newer copy every time", so a normal reload
shows changes (no Cmd+Option+R needed).
"""
import functools
import http.server
import os
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
PAGES = ("/en/", "/pl/")  # keep in step with web/_redirects


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.path.split("?")[0].split("#")[0]
        if path.startswith(PAGES) and not os.path.isfile(self.translate_path(path)):
            self.path = "/index.html"
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


print(f"Election Lens: http://localhost:{PORT}/en/usa/ (Ctrl+C stops)")
server = http.server.ThreadingHTTPServer(("", PORT), functools.partial(Handler, directory=str(WEB)))
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
