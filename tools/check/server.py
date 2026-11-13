"""Test server for check.sh: serves a copy of web/ (and check.html as /_check.html) on port 8765
and appends what the test page posts to an output file.

    uv run python tools/check/server.py <out file> <web dir>
"""
import functools
import http.server
import sys
from pathlib import Path

OUT, ROOT = sys.argv[1], sys.argv[2]
CHECK = Path(__file__).with_name("check.html").read_bytes()
open(OUT, "w").close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # the test page comes from tools/check/, so nothing is ever copied into web/
        if self.path.split("?")[0] == "/_check.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(CHECK)))
            self.end_headers()
            self.wfile.write(CHECK)
            return
        super().do_GET()

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        with open(OUT, "a") as f:
            f.write(body + ("\n" if self.path == "/view" else ""))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # the page asks for many files at once; a short queue drops some


Server(("127.0.0.1", 8765), functools.partial(Handler, directory=ROOT)).serve_forever()
