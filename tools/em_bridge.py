#!/usr/bin/env python3
"""Local dev bridge: em.json (from the EMStudio frontend) → GraphML (yEd).

The frontend cannot run s3Dgraphy (ADR-001 invariant 2: batch interop stays
in Python), so the "Export GraphML" button POSTs the current .em.json to this
tiny localhost server, which runs the s3Dgraphy exporter in-process and
returns the yEd GraphML for download. Dev-only, single-user, no auth.

Endpoints (CORS open for http://localhost:*):
    GET  /health           → {"ok": true, ...}
    POST /graphml          ← em.json body   → GraphML (text/xml), downloadable
    POST /import-graphml   ← GraphML (XML)  → em.json dict (application/json)

Run it via ``dev.sh``, or standalone:
    python3 tools/em_bridge.py --port 8765 --s3dgraphy ~/GitHub/s3Dgraphy/src
Needs s3Dgraphy importable (pandas + lxml) — use its checkout's venv python.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _load_s3dgraphy(s3dgraphy_src: "pathlib.Path | None"):
    if s3dgraphy_src:
        sys.path.insert(0, str(s3dgraphy_src))
    else:
        sibling = pathlib.Path(__file__).resolve().parents[2] / "s3Dgraphy" / "src"
        if sibling.is_dir():
            sys.path.insert(0, str(sibling))
    from s3dgraphy.exporter.graphml.graphml_exporter import GraphMLExporter
    from s3dgraphy.importer.emjson_importer import parse_emjson
    from s3dgraphy.importer.import_graphml import GraphMLImporter
    from s3dgraphy.exporter.emjson_exporter import build_emjson
    from s3dgraphy.graph import Graph
    return parse_emjson, GraphMLExporter, GraphMLImporter, build_emjson, Graph


def make_handler(parse_emjson, GraphMLExporter, GraphMLImporter, build_emjson, Graph):
    class Handler(BaseHTTPRequestHandler):
        # Quieter, dev-friendly logging.
        def log_message(self, fmt, *args):
            sys.stderr.write("  [bridge] " + (fmt % args) + "\n")

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            if self.path.rstrip("/") == "/health":
                body = json.dumps({"ok": True, "service": "em_bridge"}).encode()
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_error(404, "unknown endpoint")

        def do_POST(self):
            route = self.path.rstrip("/")
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b""
            if route == "/graphml":
                self._export_graphml(raw)
            elif route == "/import-graphml":
                self._import_graphml(raw)
            else:
                self.send_error(404, "unknown endpoint")

        # em.json (JSON body) → GraphML (yEd), downloadable
        def _export_graphml(self, raw):
            try:
                doc = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                self._fail(400, f"invalid JSON body: {exc}")
                return
            try:
                graph, warnings = parse_emjson(doc)
                for w in warnings:
                    sys.stderr.write(f"  [bridge] warning: {w}\n")
                # GraphMLExporter writes to a path; round-trip via a temp file.
                with tempfile.NamedTemporaryFile(
                    suffix=".graphml", delete=False
                ) as tmp:
                    tmp_path = pathlib.Path(tmp.name)
                GraphMLExporter(graph).export(str(tmp_path))
                graphml = tmp_path.read_bytes()
                tmp_path.unlink(missing_ok=True)
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"export failed: {exc}")
                return

            gid = (doc.get("graph") or {}).get("graph_id") or "graph"
            filename = f"{gid}.graphml".replace("/", "_")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/xml")
            self.send_header(
                "Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(graphml)))
            self.end_headers()
            self.wfile.write(graphml)

        # GraphML (yEd XML body) → em.json dict, returned as JSON for loadDocument
        def _import_graphml(self, raw):
            try:
                # GraphMLImporter reads a filepath (and may write UUIDs back),
                # so stage the uploaded XML in a temp file.
                with tempfile.NamedTemporaryFile(
                    suffix=".graphml", delete=False
                ) as tmp:
                    tmp.write(raw)
                    tmp_path = pathlib.Path(tmp.name)
                graph = GraphMLImporter(
                    str(tmp_path), Graph(graph_id="imported_graph")
                ).parse()
                tmp_path.unlink(missing_ok=True)
                doc = build_emjson(graph)  # layout=None → EMStudio re-lays-out
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"import failed: {exc}")
                return
            body = json.dumps(doc).encode("utf-8")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _fail(self, code, msg):
            body = json.dumps({"ok": False, "error": msg}).encode()
            self.send_response(code)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--s3dgraphy", type=pathlib.Path, default=None,
                    help="path to a s3Dgraphy 'src' dir (default: sibling checkout)")
    args = ap.parse_args()

    try:
        (parse_emjson, GraphMLExporter, GraphMLImporter, build_emjson,
         Graph) = _load_s3dgraphy(args.s3dgraphy)
    except ImportError as exc:
        print(
            f"error: cannot import s3dgraphy ({exc}).\n"
            "Run this bridge with a Python that has s3Dgraphy + its deps "
            "(pandas, lxml) — e.g. the checkout's .venv — or pass "
            "--s3dgraphy pointing at its src/.",
            file=sys.stderr,
        )
        return 1

    handler = make_handler(
        parse_emjson, GraphMLExporter, GraphMLImporter, build_emjson, Graph)
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"em_bridge listening on http://{args.host}:{args.port} "
          f"(POST /graphml, POST /import-graphml, GET /health) — Ctrl-C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nem_bridge stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
