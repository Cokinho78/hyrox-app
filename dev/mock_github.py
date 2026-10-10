#!/usr/bin/env python3
"""Serveur de dev : sert l'app + imite les 4 endpoints GitHub utilisés par l'app.

Usage : python3 dev/mock_github.py <dossier hyrox-data (copie de test)> [--port 8787]
Puis ouvrir http://localhost:8787/?api=http://localhost:8787/api
(dans Réglages, mettre n'importe quel token : il n'est pas vérifié).
Les écritures modifient réellement le dossier passé en argument : utiliser une copie.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_DIR = Path(__file__).resolve().parent.parent
API_RE = re.compile(r"^/api/repos/[^/]+/[^/]+/(git/trees/[^/]+|git/blobs/([0-9a-f]+)|contents/(.+))$")


def git_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


class Handler(SimpleHTTPRequestHandler):
    data_dir: Path

    def _json(self, code: int, obj: object) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _files(self) -> dict[str, Path]:
        return {
            str(p.relative_to(self.data_dir)): p
            for p in self.data_dir.rglob("*")
            if p.is_file() and ".git" not in p.parts
        }

    def do_OPTIONS(self) -> None:  # preflight CORS
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        m = API_RE.match(path)
        if not m:
            return super().do_GET()
        files = self._files()
        if m[1].startswith("git/trees"):
            tree = [{"path": k, "type": "blob", "sha": git_sha(p.read_bytes())} for k, p in files.items()]
            return self._json(200, {"tree": tree})
        if m[2]:
            for p in files.values():
                data = p.read_bytes()
                if git_sha(data) == m[2]:
                    return self._json(200, {"content": base64.b64encode(data).decode(), "encoding": "base64"})
            return self._json(404, {"message": "Not Found"})
        rel = unquote(m[3])
        if rel in files:
            data = files[rel].read_bytes()
            return self._json(200, {"sha": git_sha(data), "content": base64.b64encode(data).decode()})
        return self._json(404, {"message": "Not Found"})

    def do_PUT(self) -> None:
        m = API_RE.match(urlparse(self.path).path)
        if not m or not m[3]:
            return self._json(404, {"message": "Not Found"})
        rel = unquote(m[3])
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        target = self.data_dir / rel
        if target.exists() and body.get("sha") != git_sha(target.read_bytes()):
            return self._json(409, {"message": "sha mismatch"})
        data = base64.b64decode(body["content"])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        print(f"  ✍️  écrit {rel} — {body.get('message')}")
        return self._json(201 if not body.get("sha") else 200, {"content": {"sha": git_sha(data)}})

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir", type=Path)
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()
    Handler.data_dir = args.data_dir.resolve()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(APP_DIR)))
    print(f"http://localhost:{args.port}/?api=http://localhost:{args.port}/api  (données : {Handler.data_dir})")
    server.serve_forever()


if __name__ == "__main__":
    main()
