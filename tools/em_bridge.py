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
    POST /export-ttl       ← em.json body   → Turtle (text/turtle), downloadable
                             (RDF/CIDOC projection via s3Dgraphy rdf_exporter;
                             needs rdflib bundled — 501 if unavailable)
    GET  /resolve-authority?term=&facet=     → ranked authority candidates (JSON)
    POST /resolve-authority ← {term, facet}  → ranked authority candidates (JSON)
                             (offline resolver — s3Dgraphy authorities; P1-D)

Run it via ``dev.sh``, or standalone:
    python3 tools/em_bridge.py --port 8765 --s3dgraphy ~/GitHub/s3Dgraphy/src
Needs s3Dgraphy importable (pandas + lxml) — use its checkout's venv python.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _exit_when_orphaned(poll: float = 1.0) -> None:
    """Terminate the process once the parent that spawned it is gone.

    The EMStudio desktop shell spawns this bridge and kills it on exit, but a
    PyInstaller-onefile child re-parents to launchd (PPID 1) and can outlive
    that kill, leaving a stale server holding the port. A daemon thread here
    watches the parent PID and exits the process as soon as it changes (parent
    died → re-parented), so the port is always freed. Enabled with
    --exit-with-parent; harmless when run under a shell (./dev.sh).
    """
    parent = os.getppid()

    def _watch() -> None:
        while True:
            time.sleep(poll)
            if os.getppid() != parent:
                os._exit(0)

    threading.Thread(target=_watch, daemon=True).start()


def _load_s3dgraphy(s3dgraphy_src: "pathlib.Path | None"):
    """Put s3dgraphy on sys.path and return its access-API surface module
    (``s3dgraphy.api``, P1-F). All endpoints drive this surface — the bridge is
    a thin HTTP adapter over the named ops, no ad-hoc s3dgraphy imports."""
    if s3dgraphy_src:
        sys.path.insert(0, str(s3dgraphy_src))
    else:
        sibling = pathlib.Path(__file__).resolve().parents[2] / "s3Dgraphy" / "src"
        if sibling.is_dir():
            sys.path.insert(0, str(sibling))
    from s3dgraphy import api
    return api


def make_handler(api):
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
            parsed = urllib.parse.urlparse(self.path)
            route = parsed.path.rstrip("/")
            if route == "/health":
                body = json.dumps({"ok": True, "service": "em_bridge"}).encode()
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif route == "/resolve-authority":
                q = urllib.parse.parse_qs(parsed.query)
                self._resolve_authority(
                    (q.get("term") or [""])[0], (q.get("facet") or [""])[0])
            else:
                self.send_error(404, "unknown endpoint")

        def do_POST(self):
            route = urllib.parse.urlparse(self.path).path.rstrip("/")
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b""
            if route == "/graphml":
                self._export_graphml(raw)
            elif route == "/import-graphml":
                self._import_graphml(raw)
            elif route == "/export-ttl":
                self._export_ttl(raw)
            elif route == "/resolve-authority":
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._resolve_authority(body.get("term", ""), body.get("facet", ""))
            else:
                self.send_error(404, "unknown endpoint")

        # term + facet → ranked offline authority candidates (P1-D).
        # The resolver is pure Python (no rdflib/network); imported lazily so a
        # slimmed sidecar still serves it. Returns 400 on a bad facet.
        def _resolve_authority(self, term, facet):
            facets = api.authority_facets()
            if not facets:  # resolver/authorities unavailable in this build
                self._fail(501, "authority resolver unavailable")
                return
            if (facet or "").upper() not in facets:
                self._fail(
                    400,
                    f"unknown facet {facet!r}; expected one of {sorted(facets)}")
                return
            candidates = api.resolve_authority(term, facet)
            out = json.dumps(
                {"ok": True, "term": term, "facet": (facet or "").upper(),
                 "candidates": candidates}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        # em.json (JSON body) → GraphML (yEd), downloadable
        def _export_graphml(self, raw):
            try:
                doc = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                self._fail(400, f"invalid JSON body: {exc}")
                return
            try:
                graph, warnings = api.load_emjson(doc)
                for w in warnings:
                    sys.stderr.write(f"  [bridge] warning: {w}\n")
                graphml = api.graph_to_graphml(graph).encode("utf-8")
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

        # em.json (JSON body) → Turtle (RDF/CIDOC projection), downloadable.
        # rdflib is imported lazily: the sidecar still starts and serves GraphML
        # even if rdflib was not bundled — TTL then fails with a clear 501.
        def _export_ttl(self, raw):
            try:
                doc = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                self._fail(400, f"invalid JSON body: {exc}")
                return
            try:
                graph, warnings = api.load_emjson(doc)
                for w in warnings:
                    sys.stderr.write(f"  [bridge] warning: {w}\n")
                # api.project_ttl raises MissingDependency (ImportError) if rdflib
                # is not bundled — map that to a clear 501, everything else 500.
                ttl = api.project_ttl(graph).encode("utf-8")
            except ImportError as exc:
                self._fail(
                    501, f"TTL export unavailable — rdflib not bundled in the bridge ({exc})")
                return
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"TTL export failed: {exc}")
                return

            gid = (doc.get("graph") or {}).get("graph_id") or "graph"
            filename = f"{gid}.ttl".replace("/", "_")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/turtle")
            self.send_header(
                "Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(ttl)))
            self.end_headers()
            self.wfile.write(ttl)

        # GraphML (yEd XML body) → em.json dict, returned as JSON for loadDocument
        def _import_graphml(self, raw):
            try:
                graph, warnings = api.graphml_to_graph(raw)
                for w in warnings:
                    sys.stderr.write(f"  [bridge] warning: {w}\n")
                doc = api.graph_to_emjson(graph)  # layout=None → EMStudio re-lays-out
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
    ap.add_argument("--exit-with-parent", action="store_true",
                    help="terminate when the spawning process exits "
                         "(used by the EMStudio desktop shell)")
    args = ap.parse_args()

    if args.exit_with_parent:
        _exit_when_orphaned()

    try:
        api = _load_s3dgraphy(args.s3dgraphy)
    except ImportError as exc:
        print(
            f"error: cannot import s3dgraphy ({exc}).\n"
            "Run this bridge with a Python that has s3Dgraphy + its deps "
            "(pandas, lxml) — e.g. the checkout's .venv — or pass "
            "--s3dgraphy pointing at its src/.",
            file=sys.stderr,
        )
        return 1

    handler = make_handler(api)
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"em_bridge listening on http://{args.host}:{args.port} "
          f"(POST /graphml, /import-graphml, /export-ttl, /resolve-authority; "
          f"GET /health, /resolve-authority) — Ctrl-C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nem_bridge stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
