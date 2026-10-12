# Keplar render machine agent: takes the scene upload and serves finished renders, nothing else.
# Runs inside a Vercel Sandbox (one per Blender Cloud job), on the port the sandbox exposes. Every request needs the job's
# token (a random secret only Keplar's server and the person's desktop app know). Standard library only.
import hashlib
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from secrets import compare_digest

ROOT = os.environ.get("KEPLAR_JOB_DIR", "/vercel/sandbox/job")
OUT = os.path.join(ROOT, "out")
PART = os.path.join(ROOT, "scene.part")
SCENE = os.path.join(ROOT, "scene.blend")
MAX_SCENE = int(os.environ.get("KEPLAR_MAX_SCENE", str(2 * 1024 ** 3)))
MAX_CHUNK = 64 * 1024 * 1024
NAME = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")


def token():
    try:
        with open(os.path.join(ROOT, "token"), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


class Handler(BaseHTTPRequestHandler):
    server_version = "KeplarRender/1"
    sys_version = ""

    def log_message(self, *a):  # quiet: no request logs in the job folder
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        want = token()
        got = self.headers.get("authorization", "")
        if not want or not compare_digest(got.encode(), ("Bearer " + want).encode()):
            self._json(401, {"error": "Not allowed."})
            return False
        return True

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        if not self._authed():
            return
        if self.path == "/scene":
            size = os.path.getsize(PART) if os.path.exists(PART) else 0
            return self._json(200, {"received": size, "complete": os.path.exists(SCENE)})
        if self.path == "/files":
            items = []
            if os.path.isdir(OUT):
                for n in sorted(os.listdir(OUT)):
                    p = os.path.join(OUT, n)
                    if NAME.match(n) and os.path.isfile(p):
                        items.append({"name": n, "bytes": os.path.getsize(p)})
            return self._json(200, {"files": items})
        m = re.match(r"^/files/([A-Za-z0-9_.-]{1,80})$", self.path)
        if m:
            p = os.path.join(OUT, m.group(1))
            if not os.path.isfile(p):
                return self._json(404, {"error": "No such file."})
            size = os.path.getsize(p)
            self.send_response(200)
            self.send_header("content-type", "application/octet-stream")
            self.send_header("content-length", str(size))
            self.send_header("cache-control", "no-store")
            self.end_headers()
            with open(p, "rb") as f:
                while True:
                    b = f.read(1024 * 1024)
                    if not b:
                        break
                    self.wfile.write(b)
            return
        self._json(404, {"error": "Not found."})

    def do_PUT(self):
        # PUT /scene?offset=N with one chunk: appended at N (must equal what is already there, so a resend is harmless).
        if not self._authed():
            return
        m = re.match(r"^/scene\?offset=(\d{1,12})$", self.path)
        if not m:
            return self._json(404, {"error": "Not found."})
        if os.path.exists(SCENE):
            return self._json(409, {"error": "The scene is already uploaded."})
        offset = int(m.group(1))
        length = int(self.headers.get("content-length", "0") or 0)
        if length <= 0 or length > MAX_CHUNK:
            return self._json(400, {"error": "Chunk size out of range."})
        have = os.path.getsize(PART) if os.path.exists(PART) else 0
        if offset != have:
            return self._json(409, {"error": "Wrong offset.", "received": have})
        if offset + length > MAX_SCENE:
            return self._json(413, {"error": "The scene is too large."})
        os.makedirs(ROOT, exist_ok=True)
        left = length
        with open(PART, "ab") as f:
            while left:
                b = self.rfile.read(min(left, 1024 * 1024))
                if not b:
                    break
                f.write(b)
                left -= len(b)
        if left:
            with open(PART, "r+b") as f:
                f.truncate(offset)
            return self._json(400, {"error": "The chunk was cut short."})
        self._json(200, {"received": offset + length})

    def do_POST(self):
        # POST /scene/finish {"bytes": n, "sha256": hex}: checks the whole file, then it becomes the scene.
        if not self._authed():
            return
        if self.path != "/scene/finish":
            return self._json(404, {"error": "Not found."})
        try:
            body = json.loads(self.rfile.read(min(int(self.headers.get("content-length", "0") or 0), 4096)) or b"{}")
        except ValueError:
            return self._json(400, {"error": "Bad request."})
        if os.path.exists(SCENE):
            return self._json(200, {"complete": True})
        size = os.path.getsize(PART) if os.path.exists(PART) else 0
        if size != body.get("bytes"):
            return self._json(409, {"error": "The upload is incomplete.", "received": size})
        h = hashlib.sha256()
        with open(PART, "rb") as f:
            for b in iter(lambda: f.read(4 * 1024 * 1024), b""):
                h.update(b)
        if not compare_digest(h.hexdigest(), str(body.get("sha256", "")).lower()):
            os.remove(PART)
            return self._json(409, {"error": "The upload was damaged. Start it again."})
        os.replace(PART, SCENE)
        self._json(200, {"complete": True})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.makedirs(OUT, exist_ok=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
