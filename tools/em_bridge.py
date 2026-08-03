#!/usr/bin/env python3
"""Local dev bridge: em.json (from the EMStudio frontend) → GraphML (yEd).

The frontend cannot run s3Dgraphy (ADR-001 invariant 2: batch interop stays
in Python), so the "Export GraphML" button POSTs the current .em.json to this
tiny localhost server, which runs the s3Dgraphy exporter in-process and
returns the yEd GraphML for download. Dev-only, single-user, no auth.

**Who may call it (S6).** No authentication, but not open either: a request
carrying an `Origin` that is not localhost (or the desktop app's own
`tauri://localhost`) is refused with 403 before dispatch, and the CORS header
reflects the vetted origin instead of `*`. Requests with no `Origin` at all —
curl, the CLI, any non-browser tool — still pass. This matters because the
bridge can hold an API key in memory (S3): without the gate, any page open in
the same browser could spend it. `Origin: null` (a page opened from `file://`,
but also a sandboxed iframe anywhere) is refused; override with
`EM_BRIDGE_ALLOW_ORIGIN=<origin>[,<origin>]`.

Endpoints:
    GET  /health           → {"ok": true, ...}
    POST /graphml          ← em.json body   → GraphML (text/xml), downloadable
    POST /import-graphml   ← GraphML (XML)  → em.json dict (application/json)
    POST /export-ttl       ← em.json body   → Turtle (text/turtle), downloadable
                             (RDF/CIDOC projection via s3Dgraphy rdf_exporter;
                             needs rdflib bundled — 501 if unavailable)
    GET  /resolve-authority?term=&facet=     → ranked authority candidates (JSON)
    POST /resolve-authority ← {term, facet}  → ranked authority candidates (JSON)
                             (offline resolver — s3Dgraphy authorities; P1-D)
    POST /scan-resources   ← {folder, doc?}  → {shelf: [orphans + stable IDs]}
    POST /list-resources   ← {doc}           → {resources: [...]}
    POST /resolve-resource ← {doc, resource_id} → {location: {kind,value,exists}}
                             (Resource layer — s3Dgraphy resources; R0/R1/R5;
                             501 if the active s3dgraphy predates it)
    POST /reproject        ← {x, y, epsg_source, epsg_target?}  → {lon, lat}
                           ← {points: [[x,y], …], epsg_source, …} → {points: […]}
                             (G1 — EPSG → WGS84 via s3Dgraphy api.reproject, i.e.
                             pyproj. Excavation coordinates are normally PROJECTED
                             (UTM, national grids) and a web map needs degrees;
                             this is the ONLY place that conversion happens, and
                             it is not going to be reimplemented in TypeScript.
                             The batch form builds one transformer for a whole
                             footprint. 501 when the [geo] extra is not bundled —
                             the map then refuses honestly rather than guessing.)
    POST /georeference-scene
                           ← {doc, points_local?, epsg_target?}
                           → {points, centroid?, extent?, rotation, shift, …}
                             (G3 — poses the scene on the ground: rotate by the
                             graph's azimuth, add the shift, reproject. With no
                             `points_local` it uses the extent DERIVED from the
                             graph's own spatial proxies (SemanticShapeNode) and
                             returns the four corners plus the centroid; with no
                             proxies it returns extent=null and invents nothing.)
    POST /resource-preview ← {resource_id, folder?, doc?, max_bytes?}
                           → {resource_type, media_type, data_url|url|...}
                             (N10 — bytes for a THUMBNAIL, by stable ID only. A
                             browser cannot read a local file, and the Shelf must
                             not learn filesystem paths: this resolves the id the
                             same way everything else does — the folder manifest
                             (R1) or the graph's resolver — and returns the bytes
                             inline. The path is NEVER echoed back. Only images
                             travel as bytes; anything else answers with its type
                             so the UI can draw a typed placeholder, and remote
                             resources answer with their URL so the browser
                             fetches them directly.)
    POST /ingest-minio     ← {path, resource_id?} → {id, object_key, s3_uri}
    POST /presign          ← {id|object_key} → {object_key, http_url}
                             (shared MinIO object store — s3Dgraphy R2; config from
                             the S3_* env, same store Heriverse uses; resource_id
                             keeps a resource's stable ID on "promote"; 501 if the
                             optional [minio] extra is not bundled)
    POST /generate-narrative-draft
                           ← {doc, activity_id, provider?, model?, instruction?}
                           → {doc, narrative_id, chapter_title, author_id,
                              prompt_id, status, sent}
                             (EM Narrative N5: s3Dgraphy builds the briefing,
                              the selected LLMProvider writes the prose, s3Dgraphy
                              writes it back attributed to the AI author with the
                              prompt as a source and UNENDORSED. Provider from
                              `provider` or $EM_LLM_PROVIDER, default claude.
                              501 when unconfigured, 502 when the model call fails.)
    GET  /llm-key-status   → {set: bool, source: "session"|"env"|"none"}
    POST /set-llm-key      ← {key}  → {set, source}
    POST /clear-llm-key    →         {set, source}
                             (S3 — the browser-dev half of the key story. No
                              keychain in a browser, so the pasted key lives in
                              a MODULE VARIABLE for this process's lifetime:
                              never on disk, never in the environment, never in
                              a log, never in a response. The session key wins
                              over $ANTHROPIC_API_KEY. There is deliberately NO
                              route that returns a key — only one that says
                              whether there is one and where it came from.)
    POST /detach-dtc       ← {graph, process_id} → {record}   (read-only)
    POST /inject-dtc       ← {graph, record}     → {…ids, graph}
    POST /bake-dtc         ← {graph, injector_id} → {report, graph}
                             (DTC residency — s3Dgraphy R3; inject/bake return the
                             mutated em.json; 501 if the op is unavailable)

Run it via ``dev.sh``, or standalone:
    python3 tools/em_bridge.py --port 8765 --s3dgraphy ~/GitHub/s3Dgraphy/src
Needs s3Dgraphy importable (pandas + lxml) — use its checkout's venv python.
"""

from __future__ import annotations

import argparse
import base64
import errno
import json
import os
import pathlib
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


#: Extra origins the operator vouches for, comma-separated in
#: `EM_BRIDGE_ALLOW_ORIGIN`. The gate below is deliberately strict — it refuses
#: `Origin: null`, which is what a page opened straight from disk sends — and
#: this is the way out that does not require weakening it for everybody.
_ALLOWED_EXTRA_ORIGINS = {
    o.strip() for o in os.environ.get("EM_BRIDGE_ALLOW_ORIGIN", "").split(",")
    if o.strip()
}


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


def _ensure_proj_data() -> None:
    """Point PROJ at its data directory when running FROZEN, if it needs help.

    pyproj bundles PROJ inside its wheel and finds `proj_dir/share/proj` next to
    its own package — which works in a PyInstaller build too, because
    pyinstaller-hooks-contrib's `hook-pyproj` collects that directory. This is the
    belt for the cases the hook cannot predict: an old hooks-contrib, or a
    repackaged pyproj (Conda, Debian) that de-vendors the data elsewhere.

    Two properties matter here. It **does not import pyproj** — that import is
    lazy on purpose, and paying ~1 s of cold start on every launch to check a
    directory would undo the reason it is lazy. And it **never overrides** a
    PROJ_DATA the operator set deliberately.

    Failure mode without this, when it is needed: reprojection works in dev and
    fails only in the packaged app, with a PROJ error about missing datum grids —
    the worst kind of difference to debug remotely. `docs/DEVELOPMENT.md` has the
    post-build verification step that catches it.
    """
    if not getattr(sys, "frozen", False):
        return
    if os.environ.get("PROJ_DATA") or os.environ.get("PROJ_LIB"):
        return
    base = getattr(sys, "_MEIPASS", None) or os.path.dirname(sys.executable)
    for rel in (
        os.path.join("pyproj", "proj_dir", "share", "proj"),  # pip wheel layout
        os.path.join("share", "proj"),                        # de-vendored (hook)
        os.path.join("Library", "share", "proj"),             # de-vendored, Windows
    ):
        candidate = os.path.join(base, rel)
        # proj.db is the file PROJ actually needs; a directory without it would
        # be a worse answer than leaving the variable unset.
        if os.path.isfile(os.path.join(candidate, "proj.db")):
            os.environ["PROJ_DATA"] = candidate
            os.environ.setdefault("PROJ_LIB", candidate)  # PROJ < 9 reads this
            return


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
        # Per-process id → MinIO object_key map, populated by /ingest-minio so a
        # later /presign can accept the stable {id} (transport-layer convenience;
        # callers may also presign an {object_key} directly, statelessly).
        _minio_keys: dict = {}

        # Quieter, dev-friendly logging.
        def log_message(self, fmt, *args):
            sys.stderr.write("  [bridge] " + (fmt % args) + "\n")

        # ── who may talk to this bridge ─────────────────────────────────
        #
        # The bridge listens on loopback with no auth, which was tolerable while
        # it only transformed documents. Since S3 it can hold an API key in
        # memory, and `Access-Control-Allow-Origin: *` meant any page you
        # happened to have open could spend that key, or overwrite it.
        #
        # A browser sets `Origin` itself and a page cannot forge it, so checking
        # it is enough to keep other sites out. Requests with NO Origin — curl,
        # the CLI, anything not a browser — still pass: they are not the threat,
        # and blocking them would break every local tool for nothing.

        def _origin_allowed(self, origin):
            if origin in _ALLOWED_EXTRA_ORIGINS:
                return True
            # Tauri's own protocol: the packaged desktop app serves from
            # `tauri://localhost` (macOS/Linux) or `http://tauri.localhost`
            # (Windows), NOT from an http://localhost port. Leaving these out
            # would have blocked the desktop app on the first packaged build,
            # while the dev flow kept working — the exact shape of bug that
            # ships.
            if origin in ("tauri://localhost", "http://tauri.localhost",
                          "https://tauri.localhost"):
                return True
            try:
                parsed = urllib.parse.urlparse(origin)
            except ValueError:
                return False
            return (parsed.scheme in ("http", "https")
                    and parsed.hostname in ("localhost", "127.0.0.1", "::1"))

        def _gate(self):
            """False → the request was refused and answered; stop handling it.

            `Origin: null` is refused deliberately. It is what a `file://` page
            sends — and also what a sandboxed iframe on any site sends, so
            allowing it would hand the key back to the thing this gate exists to
            stop. Serve the frontend over http://localhost instead, or name the
            origin in EM_BRIDGE_ALLOW_ORIGIN.
            """
            origin = self.headers.get("Origin")
            if origin is None or self._origin_allowed(origin):
                return True
            # The refused value is NOT echoed — not in the body, not in a log
            # line. It is attacker-controlled text and this message is read by
            # a human.
            self._fail(403, "origin not allowed: em-bridge answers only the "
                            "local EMStudio (localhost, or the desktop app). "
                            "Serve the frontend from http://localhost, or set "
                            "EM_BRIDGE_ALLOW_ORIGIN.")
            return False

        def _cors(self):
            # Reflect the caller's origin instead of `*`, so the browser only
            # ever hands a response to the origin we vetted. `Vary: Origin`
            # keeps a cache from serving one origin's response to another.
            origin = self.headers.get("Origin")
            if origin and self._origin_allowed(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self):
            if not self._gate():
                return
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            if not self._gate():
                return
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
            elif route == "/llm-key-status":
                self._llm_key_status()
            elif route == "/resolve-authority":
                q = urllib.parse.parse_qs(parsed.query)
                self._resolve_authority(
                    (q.get("term") or [""])[0], (q.get("facet") or [""])[0])
            else:
                self.send_error(404, "unknown endpoint")

        def do_POST(self):
            if not self._gate():
                return
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
            elif route in ("/scan-resources", "/list-resources", "/resolve-resource"):
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._resources(route, body)
            elif route == "/resource-preview":
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._resource_preview(body)
            elif route == "/reproject":
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._reproject(body)
            elif route == "/georeference-scene":
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._georeference_scene(body)
            elif route in ("/ingest-minio", "/presign"):
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._minio(route, body)
            elif route == "/generate-narrative-draft":
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._generate_narrative_draft(body)
            elif route in ("/stratiminer-prompt", "/stratiminer-extract",
                           "/import-em-data"):
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._stratiminer(route, body)
            elif route in ("/set-llm-key", "/clear-llm-key"):
                self._llm_key_write(route, raw)
            elif route in ("/detach-dtc", "/inject-dtc", "/bake-dtc"):
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    self._fail(400, f"invalid JSON body: {exc}")
                    return
                self._dtc(route, body)
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

        # The session API key (S3). Three routes, and note the shape of the set:
        # you can PUT a key and you can DELETE it, but there is nothing that
        # GIVES one back. `/llm-key-status` answers "is there one, and where
        # from" — never "which one". That asymmetry is the invariant; it is the
        # same one the desktop shell keeps in Rust.
        #
        # The key exists in a module variable for the life of this process. It
        # is not written to disk, not put in the environment, not echoed in a
        # response, and not logged: the access log prints the request LINE only
        # (method + path), never the body, and the failure paths below say what
        # went wrong without quoting what was sent.
        def _llm_key_status(self):
            try:
                _here = str(pathlib.Path(__file__).resolve().parent)
                if _here not in sys.path:
                    sys.path.insert(0, _here)
                from llm_provider import api_key_source
            except ImportError as exc:
                self._fail(501, f"LLM seam unavailable: {exc}")
                return
            source = api_key_source()
            self._json({"ok": True, "set": source != "none", "source": source})

        def _llm_key_write(self, route, raw):
            try:
                _here = str(pathlib.Path(__file__).resolve().parent)
                if _here not in sys.path:
                    sys.path.insert(0, _here)
                from llm_provider import (api_key_source, clear_session_key,
                                          set_session_key)
            except ImportError as exc:
                self._fail(501, f"LLM seam unavailable: {exc}")
                return

            if route == "/clear-llm-key":
                clear_session_key()
                source = api_key_source()
                self._json({"ok": True, "set": source != "none",
                            "source": source})
                return

            try:
                body = json.loads(raw.decode("utf-8")) if raw else {}
            except Exception:
                # deliberately not `{exc}`: a decoder message can carry a
                # fragment of the document, and this document is a key
                self._fail(400, "invalid JSON body")
                return
            key = (body.get("key") or "").strip() if isinstance(body, dict) else ""
            if not key:
                self._fail(400, "no key in the request body")
                return
            set_session_key(key)
            del key, body, raw
            self._json({"ok": True, "set": True, "source": api_key_source()})

        def _json(self, payload, status=200):
            out = json.dumps(payload).encode()
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        # EM Narrative — generate one chapter's prose from an activity (N5).
        #
        # The whole flow, and every step is somebody's job:
        #   s3Dgraphy   builds the briefing from the graph      (pure, no network)
        #   LLMProvider turns the briefing into prose           (the only network)
        #   s3Dgraphy   writes it back, attributed, UNENDORSED  (pure)
        #
        # The bridge only wires them together. It never validates anything —
        # endorsement is an act by a named person (N4) and pressing "generate"
        # is not one — and the API key never leaves this process: not into the
        # response, not into the returned em.json, not into the log.
        def _generate_narrative_draft(self, body):
            if not hasattr(api, "build_narrative_generation_context"):
                self._fail(501, "this s3dgraphy has no narrative generation "
                                "seam (needs N5)")
                return
            doc = body.get("doc") or body.get("graph")
            activity_id = body.get("activity_id")
            if not isinstance(doc, dict):
                self._fail(400, "/generate-narrative-draft needs the em.json "
                                "as 'doc'")
                return
            if not activity_id:
                self._fail(400, "/generate-narrative-draft needs an "
                                "'activity_id': generation is anchored to an "
                                "activity, which is where the actions are")
                return
            try:
                # sibling module; sys.path[0] is this file's directory when the
                # bridge runs as a script, but be explicit so an embedded import
                # works too
                _here = str(pathlib.Path(__file__).resolve().parent)
                if _here not in sys.path:
                    sys.path.insert(0, _here)
                from llm_provider import (LLMError, SYSTEM_PROMPT, build_prompt,
                                          describe_payload, get_provider)
            except ImportError as exc:
                self._fail(501, f"LLM seam unavailable: {exc}")
                return

            try:
                graph, _warnings = api.load_emjson(doc)
                context = api.build_narrative_generation_context(
                    graph, activity_id)
            except Exception as exc:
                self._fail(400, f"could not build the generation context: {exc}")
                return

            prompt = build_prompt(context, body.get("instruction", "") or "")
            try:
                # a model override is per-request; the provider's own default
                # (a Sonnet, see llm_provider.py) applies when it is empty
                opts = {}
                if (body.get("model") or "").strip():
                    opts["model"] = body["model"].strip()
                provider = get_provider(body.get("provider"), **opts)
                text = provider.generate(SYSTEM_PROMPT, prompt, context)
            except LLMError as exc:
                # 501 = not configured (no key, unknown provider); 502 = the
                # model was reached and something went wrong. Different problems,
                # different fixes.
                self._fail(exc.status, str(exc))
                return
            except Exception as exc:
                self._fail(502, f"generation failed: {exc}")
                return

            try:
                written = api.write_ai_draft(
                    graph, activity_id, text,
                    model=getattr(provider, "model", "") or provider.name,
                    version=body.get("model_version", "") or "",
                    date=body.get("date"),
                    prompt=prompt,
                    narrative_id=body.get("narrative_id"))
            except Exception as exc:
                self._fail(400, f"could not write the draft back: {exc}")
                return

            out = json.dumps({
                "ok": True,
                "provider": provider.name,
                "model": getattr(provider, "model", ""),
                "sent": describe_payload(context),
                # the prose itself, so the caller can show it without digging
                # it back out of the returned document
                "text": text,
                **written,
                "doc": api.graph_to_emjson(graph),
            }).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        # ── StratiMiner: assisted graph creation from a folder of sources ─────
        #
        # Three routes for a pipeline with a deliberate seam in the middle:
        #
        #   /stratiminer-prompt   → the prompt, for the user to run in Cowork
        #   /stratiminer-extract  → Path A: the bridge calls a model and writes
        #                           em_data.xlsx from the rows it returns
        #   /import-em-data       → em_data.xlsx → em.json (no model involved)
        #
        # The two paths converge on a FILE the archaeologist can open. The model
        # never writes the graph — it returns table rows, `api.write_em_data`
        # materialises the workbook, and only the deterministic importer turns
        # that into em.json. Splitting it this way is the point, not a
        # limitation: canonisation stays reviewable while it is still a table.
        #
        # Text-extraction honesty: the bridge reads what it can decode as text
        # and tells the model, in the prompt, which files it could NOT read.
        # PDFs need an extractor this build does not bundle, so for a folder of
        # PDFs Path B (Cowork, where the agent has the filesystem) is the real
        # answer today — and the response says so rather than quietly returning
        # a table built from filenames.
        #: Per file, and in total, so one large folder cannot turn a request into
        #: an unbounded upload. Generous enough for excavation notes.
        _TEXT_BYTES_PER_FILE = 200_000
        _TEXT_BYTES_TOTAL = 800_000

        def _stratiminer_catalog(self, folder):
            """Inventory a source folder: every file named, the readable ones also
            read. Returns the dict `build_stratiminer_prompt` expects.

            **Which suffixes are readable, and how a PDF is read, is s3Dgraphy's
            decision** (`api.source_text`) — not this file's. The rule is the same
            wherever StratiMiner runs, and a copy kept here would be a second rule
            free to drift from the one the library tests.
            """
            entries, total = [], 0
            for name in sorted(os.listdir(folder)):
                full = os.path.join(folder, name)
                if not os.path.isfile(full) or name.startswith("."):
                    continue
                entry = {
                    "name": name,
                    "kind": os.path.splitext(name)[1].lower().lstrip(".")
                            or "file",
                    "bytes": os.path.getsize(full),
                }
                if total < self._TEXT_BYTES_TOTAL:
                    read = api.source_text(
                        full, max_chars=min(
                            self._TEXT_BYTES_PER_FILE,
                            self._TEXT_BYTES_TOTAL - total))
                    if read.get("text"):
                        entry["text"] = read["text"]
                        total += len(read["text"])
                    # The REASON travels with the entry, so the prompt can tell the
                    # model "this one was not read, and why" instead of leaving it
                    # to guess from a bare filename.
                    if read.get("note"):
                        entry["note"] = read["note"]
                else:
                    entry["note"] = ("budget for source text exhausted — this "
                                     "file was not read")
                entries.append(entry)
            return {
                "folder": folder,
                "files": entries,
                "sheets": list(api.em_data_sheets()),
                "columns": {k: list(v)
                            for k, v in api.em_data_columns().items()},
                # Stated once, before the work: with no extractor a folder of PDFs
                # yields filenames only, and the user has to know that BEFORE
                # reading a suspiciously thin table.
                "pdf_text": api.pdf_text_available(),
                "extractor": api.source_text_extractor(),
            }

        def _stratiminer(self, route, body):
            for need in ("em_data_sheets", "import_em_data"):
                if not hasattr(api, need):
                    self._fail(501, "StratiMiner unavailable — this s3dgraphy "
                                    "has no em_data surface (needs SM1)")
                    return

            if route == "/import-em-data":
                path = (body.get("path") or "").strip()
                if not path:
                    self._fail(400, "/import-em-data needs the 'path' of an "
                                    "em_data.xlsx")
                    return
                if not os.path.isfile(path):
                    self._fail(400, f"no such file: {path}")
                    return
                try:
                    graph, warnings, stats = api.em_data_to_graph(
                        path, graph_id=(body.get("graph_id") or "").strip()
                        or None)
                except ImportError as exc:
                    # pandas/openpyxl absent (a slimmed sidecar): the request was
                    # valid, this build cannot serve it. 501, never 500.
                    self._fail(501, f"em_data import needs pandas/openpyxl, "
                                    f"absent from this build: {exc}")
                    return
                except FileNotFoundError as exc:
                    self._fail(400, str(exc))
                    return
                except Exception as exc:
                    # A malformed workbook is the user's file, not our bug —
                    # 400 with the importer's own message (it names the sheet).
                    self._fail(400, f"could not read em_data.xlsx: {exc}")
                    return
                self._json({"ok": True, "stats": stats, "warnings": warnings,
                            "doc": api.graph_to_emjson(graph)})
                return

            folder = (body.get("folder") or "").strip()
            if not folder:
                self._fail(400, f"{route} needs a source 'folder'")
                return
            if not os.path.isdir(folder):
                self._fail(400, f"not a folder: {folder}")
                return

            try:
                spec = api.stratiminer_prompt(
                    language=(body.get("language") or "").strip() or None,
                    documents_folder=folder,
                    dosco_in_place=bool(body.get("dosco_in_place", True)),
                    ai_has_filesystem_access=bool(
                        body.get("ai_has_filesystem_access",
                                 route == "/stratiminer-prompt")),
                )
            except FileNotFoundError as exc:
                self._fail(501, f"the StratiMiner prompt template is missing "
                                f"from this s3dgraphy: {exc}")
                return

            if route == "/stratiminer-prompt":
                # Path B. The prompt goes to the user, who runs it where the
                # agent CAN read the folder. Nothing is sent anywhere from here.
                self._json({"ok": True, "prompt": spec,
                            "chars": len(spec), "folder": folder})
                return

            # Path A — the bridge does the model call itself.
            try:
                _here = str(pathlib.Path(__file__).resolve().parent)
                if _here not in sys.path:
                    sys.path.insert(0, _here)
                from llm_provider import (LLMError, STRATIMINER_SYSTEM_PROMPT,
                                          build_stratiminer_prompt,
                                          get_provider, model_for_task,
                                          parse_stratiminer_reply)
            except ImportError as exc:
                self._fail(501, f"LLM seam unavailable: {exc}")
                return

            catalog = self._stratiminer_catalog(folder)
            if not catalog["files"]:
                self._fail(400, f"no files to read in {folder}")
                return
            prompt = build_stratiminer_prompt(
                spec, catalog, body.get("instruction", "") or "")

            try:
                # Per-request model wins; otherwise the per-TASK default, which
                # for extraction is a frontier model rather than the prose
                # default (see llm_provider.TASK_MODELS).
                opts = {}
                chosen = ((body.get("model") or "").strip()
                          or model_for_task("stratiminer"))
                if chosen:
                    opts["model"] = chosen
                # A table is many rows; the prose default would truncate it.
                opts["max_tokens"] = int(body.get("max_tokens") or 16000)
                provider = get_provider(body.get("provider"), **opts)
                reply = provider.generate(
                    STRATIMINER_SYSTEM_PROMPT, prompt, catalog)
                sheets = parse_stratiminer_reply(reply)
            except LLMError as exc:
                self._fail(exc.status, str(exc))
                return
            except Exception as exc:
                self._fail(502, f"extraction failed: {exc}")
                return

            out_path = (body.get("out_path") or "").strip() or os.path.join(
                folder, "em_data.xlsx")
            try:
                report = api.write_em_data(sheets, out_path)
            except ImportError as exc:
                self._fail(501, f"writing em_data.xlsx needs openpyxl, absent "
                                f"from this build: {exc}")
                return
            except Exception as exc:
                self._fail(502, f"could not write em_data.xlsx: {exc}")
                return

            # Name AND reason: "report.pdf" alone tells the user nothing about
            # whether to install an extra, fix a scan, or accept the gap.
            unread = [{"name": e["name"], "why": e.get("note", "not read")}
                      for e in catalog["files"] if not e.get("text")]
            self._json({
                "ok": True,
                "provider": provider.name,
                "model": getattr(provider, "model", ""),
                "xlsx_path": report["path"],
                "rows": report["rows"],
                # Two kinds of warning, kept apart: what the writer refused
                # (invented columns) and what the bridge could not read at all.
                "warnings": report["warnings"],
                "unread_files": unread,
                # So the UI can say "no PDF extractor in this build" once, rather
                # than the user inferring it from a suspiciously thin table.
                "pdf_text": catalog["pdf_text"],
                "extractor": catalog["extractor"],
                "sent": {"folder": folder,
                         "files": len(catalog["files"]),
                         "files_with_text": len(catalog["files"]) - len(unread),
                         "excludes": ["the graph", "credentials",
                                      "anything outside the named folder"]},
            })

        # Shared MinIO object store (R2 + connective tissue): ingest a local file
        # into the SAME MinIO Heriverse provisions (config read from the S3_* env
        # by s3dgraphy.api), and presign an object key → a fetchable http_url.
        # Thin adapter over the api ops; 501 if the [minio] extra is absent (like
        # TTL without rdflib) or the op is missing (stale s3dgraphy). A small
        # per-process id→object_key cache lets /presign accept {id} across requests.
        def _minio(self, route, body):
            need = "ingest_minio_resource" if route == "/ingest-minio" \
                else "presign_minio_resource"
            if not hasattr(api, need):
                self._fail(501, "MinIO ops unavailable — s3dgraphy is out of date")
                return
            try:
                if route == "/ingest-minio":
                    path = body.get("path", "")
                    if not path:
                        self._fail(400, "ingest-minio needs a local file 'path'")
                        return
                    if not os.path.isfile(path):
                        self._fail(400, f"no such file: {path}")
                        return
                    # optional resource_id → "promote" keeps the resource's stable
                    # ID (same id whether FS or MinIO — one ID space)
                    rid = body.get("resource_id") or None
                    res = api.ingest_minio_resource(path, resource_id=rid)
                    Handler._minio_keys[res["id"]] = res["object_key"]
                    payload = {"ok": True, **res}
                else:  # /presign
                    key = body.get("object_key")
                    if not key and body.get("id"):
                        key = Handler._minio_keys.get(body["id"])
                        if not key:
                            self._fail(404, "unknown id — ingest first, or pass object_key")
                            return
                    if not key:
                        self._fail(400, "presign needs 'object_key' (or a known 'id')")
                        return
                    expires = int(body.get("expires_seconds", 3600))
                    res = api.presign_minio_resource(key, expires_seconds=expires)
                    payload = {"ok": True, **res}
            except ImportError as exc:  # api.MissingDependency (minio SDK absent)
                self._fail(501,
                           f"MinIO backend unavailable — the 'minio' extra is not "
                           f"bundled ({exc})")
                return
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"{route} failed: {exc}")
                return
            out = json.dumps(payload).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        # DTC residency (R3): detach a DTC to a portable record, inject a record
        # into a graph (nodes tagged injected_by = temporary), or bake it in
        # (promote to persistent — e.g. for publication). Thin adapter over the
        # s3dgraphy.api DTC ops. detach is read-only; inject/bake mutate the loaded
        # graph, so they return the updated em.json alongside the result. 501 if
        # the op is unavailable (stale s3dgraphy).
        def _dtc(self, route, body):
            op = {"/detach-dtc": "detach_dtc", "/inject-dtc": "inject_dtc",
                  "/bake-dtc": "bake_dtc"}[route]
            if not hasattr(api, op):
                self._fail(501, "DTC ops unavailable — s3dgraphy is out of date")
                return
            doc = body.get("graph")
            if doc is None:
                self._fail(400, f"{route} needs the 'graph' (em.json)")
                return
            try:
                graph, warnings = api.load_emjson(doc)
                for w in warnings:
                    sys.stderr.write(f"  [bridge] warning: {w}\n")
                if route == "/detach-dtc":
                    pid = body.get("process_id")
                    if not pid:
                        self._fail(400, "detach-dtc needs a 'process_id'")
                        return
                    try:
                        record = api.detach_dtc(graph, pid)
                    except ValueError as exc:  # not a DTC process node
                        self._fail(404, str(exc))
                        return
                    payload = {"ok": True, "record": record}
                elif route == "/inject-dtc":
                    record = body.get("record")
                    if not isinstance(record, dict):
                        self._fail(400, "inject-dtc needs a DTC 'record'")
                        return
                    result = api.inject_dtc(graph, record)
                    # inject mutates the graph → return the updated em.json too
                    payload = {"ok": True, **result,
                               "graph": api.graph_to_emjson(graph)}
                else:  # /bake-dtc
                    injector_id = body.get("injector_id")
                    if not injector_id:
                        self._fail(400, "bake-dtc needs an 'injector_id'")
                        return
                    report = api.bake_dtc(graph, injector_id)
                    payload = {"ok": True, "report": report,
                               "graph": api.graph_to_emjson(graph)}
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"{route} failed: {exc}")
                return
            out = json.dumps(payload).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        # Resource layer (R0/R1/R5): a thin adapter over the s3dgraphy.api
        # resource ops. All three take/return JSON; the FS-index scan needs a
        # server-visible folder path. 501 if the active s3dgraphy predates the
        # resource layer (op missing).
        def _resources(self, route, body):
            op = {"/scan-resources": "shelf_resources",
                  "/list-resources": "list_resources",
                  "/resolve-resource": "resolve_resource"}[route]
            if not hasattr(api, op) or not hasattr(api, "scan_fs_resources"):
                self._fail(501, "resource layer unavailable — s3dgraphy is out of date")
                return
            try:
                if route == "/scan-resources":
                    folder = body.get("folder", "")
                    if not folder:
                        self._fail(400, "scan-resources needs a 'folder'")
                        return
                    shelf = api.shelf_resources(
                        body.get("doc"), folder,
                        graph_code=body.get("graph_code"))
                    payload = {"ok": True, "folder": folder, "shelf": shelf}
                else:
                    doc = body.get("doc")
                    if doc is None:
                        self._fail(400, f"{route} needs the current 'doc' (em.json)")
                        return
                    graph, warnings = api.load_emjson(doc)
                    for w in warnings:
                        sys.stderr.write(f"  [bridge] warning: {w}\n")
                    if route == "/list-resources":
                        payload = {"ok": True, "resources": api.list_resources(graph)}
                    else:  # /resolve-resource
                        rid = body.get("resource_id", "")
                        if not rid:
                            self._fail(400, "resolve-resource needs a 'resource_id'")
                            return
                        payload = {"ok": True, "resource_id": rid,
                                   "location": api.resolve_resource(graph, rid)}
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"{route} failed: {exc}")
                return
            out = json.dumps(payload).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        # ── coordinate reprojection (G1) ─────────────────────────────────────
        # A thin adapter over s3Dgraphy's api.reproject / api.reproject_many.
        #
        # Why it is here at all: excavation coordinates are PROJECTED (a UTM zone,
        # a national grid) with an EPSG code, and the OSM map wants degrees. That
        # conversion needs PROJ, PROJ lives in pyproj, and pyproj is Python — so
        # the map asks, and nothing about datums gets reimplemented in TypeScript
        # where a wrong guess would put a site in the wrong hemisphere and look
        # authoritative doing it.
        #
        # Two shapes, one op: a single point, or a batch (a footprint is four
        # corners plus a centroid, and one transformer serves them all). 501 when
        # the [geo] extra is absent, which the map turns into an honest refusal.
        def _reproject(self, body):
            if not hasattr(api, "reproject_many"):
                self._fail(501, "reprojection unavailable — s3dgraphy is out of date")
                return
            try:
                epsg_source = int(body["epsg_source"])
            except (KeyError, TypeError, ValueError):
                self._fail(400, "reproject needs an integer 'epsg_source'")
                return
            epsg_target = body.get("epsg_target", 4326)
            try:
                epsg_target = int(epsg_target)
            except (TypeError, ValueError):
                self._fail(400, "'epsg_target' must be an integer EPSG code")
                return

            batch = body.get("points")
            if batch is None:
                if "x" not in body or "y" not in body:
                    self._fail(400, "reproject needs {x, y} or {points: [[x, y], …]}")
                    return
                try:
                    pts = [(float(body["x"]), float(body["y"]))]
                except (TypeError, ValueError):
                    self._fail(400, "'x' and 'y' must be numbers")
                    return
            else:
                if not isinstance(batch, list) or not batch:
                    self._fail(400, "'points' must be a non-empty list of [x, y]")
                    return
                if len(batch) > 512:
                    # A footprint is a handful of corners. A cap keeps one request
                    # from turning into a projection service by accident.
                    self._fail(400, "at most 512 points per request")
                    return
                try:
                    pts = [(float(p[0]), float(p[1])) for p in batch]
                except (TypeError, ValueError, IndexError):
                    self._fail(400, "each point must be a [x, y] pair of numbers")
                    return

            try:
                out = api.reproject_many(pts, epsg_source, epsg_target)
            except api.MissingDependency as exc:
                self._fail(501,
                           f"reprojection unavailable — the 'geo' extra (pyproj) "
                           f"is not bundled ({exc})")
                return
            except ValueError as exc:
                # An unknown EPSG or a point outside the frame's domain: the
                # client asked something impossible, and should hear which.
                self._fail(400, f"reproject failed: {exc}")
                return
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"reproject failed: {exc}")
                return

            payload = {"ok": True, "epsg_source": epsg_source,
                       "epsg_target": epsg_target,
                       "points": [[x, y] for x, y in out]}
            if batch is None:
                # Single-point convenience: name the axes, so no caller has to
                # remember whether [0] was longitude (it is).
                x, y = out[0]
                if epsg_target == 4326:
                    payload["lon"], payload["lat"] = x, y
                else:
                    payload["x"], payload["y"] = x, y
            self._json(payload)

        # ── georeferencing a whole scene (G3) ────────────────────────────────
        # Where /reproject answers "this point in degrees", this answers "the
        # scene, posed": rotate by the graph's azimuth, add the origin, reproject.
        # The extent it rotates is either given by the caller or DERIVED from the
        # graph's own spatial proxies — never made up, so a graph with no geometry
        # gets `extent: null` and the map draws a marker and nothing else.
        def _georeference_scene(self, body):
            if not hasattr(api, "georeference_scene"):
                self._fail(501, "scene georeferencing unavailable — s3dgraphy is "
                                "out of date")
                return
            doc = body.get("doc")
            if doc is None:
                self._fail(400, "georeference-scene needs the current 'doc' (em.json)")
                return
            try:
                graph, warnings = api.load_emjson(doc)
            except Exception as exc:
                self._fail(400, f"em.json non leggibile: {exc}")
                return
            for w in warnings:
                sys.stderr.write(f"  [bridge] warning: {w}\n")

            epsg_target = body.get("epsg_target", 4326)
            try:
                epsg_target = int(epsg_target)
            except (TypeError, ValueError):
                self._fail(400, "'epsg_target' must be an integer EPSG code")
                return

            extent = None
            points = body.get("points_local")
            if points is None:
                # No explicit extent: derive one from the graph. The corners come
                # back in a documented winding (SW, SE, NE, NW) and the centroid
                # LAST, so the caller reads them positionally without a schema.
                extent = api.scene_extent(graph)
                if extent is None:
                    self._json({"ok": True, "extent": None, "points": [],
                                "hint": "il grafo non porta geometria (nessun "
                                        "SemanticShapeNode): niente impronta"})
                    return
                points = list(extent["corners"]) + [extent["centroid"]]
            if not isinstance(points, list) or not points:
                self._fail(400, "'points_local' must be a non-empty list of [x, y]")
                return
            if len(points) > 512:
                self._fail(400, "at most 512 points per request")
                return
            try:
                pts = [(float(p[0]), float(p[1])) for p in points]
            except (TypeError, ValueError, IndexError):
                self._fail(400, "each point must be a [x, y] pair of numbers")
                return

            try:
                out = api.georeference_scene(graph, pts, epsg_target=epsg_target)
            except api.MissingDependency as exc:
                self._fail(501,
                           f"reprojection unavailable — the 'geo' extra (pyproj) "
                           f"is not bundled ({exc})")
                return
            except ValueError as exc:
                self._fail(400, f"georeference-scene failed: {exc}")
                return
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"georeference-scene failed: {exc}")
                return

            payload = {"ok": True, **out}
            if extent is not None:
                # The LOCAL extent travels too: the UI shows the scene's size in
                # metres, which degrees cannot state legibly.
                payload["extent"] = extent
                payload["centroid"] = out["points"][-1]
                payload["corners"] = out["points"][:-1]
            self._json(payload)

        # ── resource previews (N10) ──────────────────────────────────────────
        # Bytes for ONE resource's thumbnail, addressed by its STABLE ID.
        #
        # Why this exists at all: a browser cannot read a local file, and the
        # Shelf must not learn filesystem paths — the whole point of the resource
        # layer is that a resource is an id and a locator is an implementation
        # detail. So the id comes in, the bytes go out, and the path is never in
        # the response. What the page can address, it cannot enumerate: only ids
        # the folder manifest or the posted graph already own resolve at all.
        #
        # Two resolutions, mirroring the two ID spaces that are really one:
        #   · a scanned library/DosCo FOLDER — its `.em_resources_manifest.json`
        #     (the record s3Dgraphy R1 writes and EMTools R4 shares) maps id →
        #     rel_path. Read as the documented on-disk artefact it is, NOT by
        #     importing s3dgraphy internals: this handler stays a thin adapter.
        #     This is also how a HATTED Document previews — its node id IS the FS
        #     stable id, so adoption pays off here for free.
        #   · the GRAPH — `api.resolve_resource` (the resolver seam) for a
        #     LinkNode, which may answer with a local path, an http URL, or s3.
        #
        # Only images travel as bytes. Everything else answers with its type and
        # lets the UI draw a typed placeholder — a "preview" that shipped 40 MB of
        # point cloud to draw a grey box would be worse than the grey box.
        _PREVIEW_MAX_BYTES = 6 * 1024 * 1024
        _MANIFEST_NAME = ".em_resources_manifest.json"
        #: Longest edge of a generated thumbnail, in pixels (G2). 512 covers a
        #: retina 52-pixel chip and a larger card without a second size.
        _THUMB_PX = 512

        def _manifest_rel_path(self, folder, rid):
            """id → (abs_path, filename, resource_type) from the folder manifest,
            or None. The path is confined to the folder: a manifest is data, and
            data does not get to point outside its own directory."""
            mpath = os.path.join(folder, Handler._MANIFEST_NAME)
            if not os.path.isfile(mpath):
                return None
            try:
                with open(mpath, encoding="utf-8") as fh:
                    manifest = json.load(fh)
            except Exception:
                return None
            for entry in manifest.get("entries", []):
                if entry.get("id") != rid:
                    continue
                rel = entry.get("rel_path") or ""
                full = os.path.realpath(os.path.join(folder, rel))
                if not full.startswith(os.path.realpath(folder) + os.sep):
                    return None
                if not os.path.isfile(full):
                    return None
                return full, os.path.basename(full), entry.get("resource_type")
            return None

        def _resource_preview(self, body):
            import mimetypes

            rid = body.get("resource_id", "")
            if not rid:
                self._fail(400, "resource-preview needs a 'resource_id'")
                return
            max_bytes = int(body.get("max_bytes") or Handler._PREVIEW_MAX_BYTES)
            max_bytes = max(1024, min(max_bytes, 32 * 1024 * 1024))
            folder = body.get("folder") or ""
            payload = {"ok": True, "resource_id": rid}
            local = None

            try:
                if folder:
                    hit = self._manifest_rel_path(folder, rid)
                    if hit:
                        local, filename, res_type = hit
                        payload["filename"] = filename
                        if res_type:
                            payload["resource_type"] = res_type

                if local is None and body.get("doc") is not None:
                    if not hasattr(api, "resolve_resource"):
                        self._fail(501, "resource layer unavailable — s3dgraphy "
                                        "is out of date")
                        return
                    # A document the importer refuses is not a server error: it
                    # is one row that cannot show a thumbnail. Failing the whole
                    # request with a 500 would paint a red box over a picture.
                    try:
                        graph, warnings = api.load_emjson(body["doc"])
                    except Exception as exc:
                        payload["unresolved"] = True
                        payload["hint"] = f"em.json non leggibile dal bridge: {exc}"
                        self._json(payload)
                        return
                    for w in warnings:
                        sys.stderr.write(f"  [bridge] warning: {w}\n")
                    loc = api.resolve_resource(graph, rid) or {}
                    kind, value = loc.get("kind"), loc.get("value") or ""
                    if kind == "http_url":
                        # Remote already: hand back the URL and let the browser
                        # fetch it — proxying bytes we do not have to touch would
                        # only add a hop and a copy.
                        payload["url"] = value
                        payload["filename"] = os.path.basename(
                            value.split("?")[0].rstrip("/"))
                        self._json(payload)
                        return
                    if kind == "s3_uri":
                        url = self._presign_s3(value)
                        if url:
                            payload["url"] = url
                        else:
                            payload["needs_presign"] = True
                        payload["filename"] = os.path.basename(value.rstrip("/"))
                        self._json(payload)
                        return
                    if kind in ("local_path", "file_uri") and value:
                        path = value[7:] if value.startswith("file://") else value
                        if os.path.isfile(path):
                            local = path
                            payload["filename"] = os.path.basename(path)

                if local is None:
                    payload["unresolved"] = True
                    payload["hint"] = (
                        "l'id non risolve: se è una risorsa di cartella, fai "
                        "prima Scan; se è del grafo, controlla il locator."
                    )
                    self._json(payload)
                    return

                media, _ = mimetypes.guess_type(local)
                payload["media_type"] = media or "application/octet-stream"
                size = os.path.getsize(local)
                payload["bytes"] = size
                thumb_px = int(body.get("thumb_px") or Handler._THUMB_PX)

                if (media or "").startswith("image/"):
                    # G2 — with Pillow, a real THUMBNAIL: the resize happens here
                    # and only the small image travels, so a 7 MB orthophoto costs
                    # a few tens of kB instead of 9 MB of base64. Without Pillow,
                    # exactly the previous behaviour.
                    thumb = self._thumbnail(local, thumb_px)
                    if thumb is not None:
                        raw, thumb_media, dims = thumb
                        payload["media_type"] = thumb_media
                        payload["thumbnail"] = True
                        payload["thumb_bytes"] = len(raw)
                        payload["dimensions"] = list(dims)
                        payload["data_url"] = (
                            f"data:{thumb_media};base64,"
                            + base64.b64encode(raw).decode("ascii"))
                        self._json(payload)
                        return
                    if size > max_bytes:
                        # No thumbnail and the file is big: the honest answer is
                        # the size, not a truncated image file that would decode to
                        # garbage. Two reasons land here and they are not the same
                        # thing — say which, or the hint sends the user to install
                        # something they already have.
                        payload["too_large"] = True
                        payload["hint"] = (
                            "il file non è decodificabile come immagine"
                            if self._has_pillow()
                            else "installa Pillow nel bridge per avere la "
                                 "miniatura di immagini grandi")
                        self._json(payload)
                        return
                    with open(local, "rb") as fh:
                        raw = fh.read()
                    payload["data_url"] = (
                        f"data:{payload['media_type']};base64,"
                        + base64.b64encode(raw).decode("ascii"))
                    self._json(payload)
                    return

                if (media or "") == "application/pdf":
                    # G2 — the first page, if a PDF engine happens to be present.
                    page = self._pdf_first_page(local, thumb_px)
                    if page is not None:
                        raw, page_media = page
                        payload["media_type"] = page_media
                        payload["thumbnail"] = True
                        payload["first_page"] = True
                        payload["thumb_bytes"] = len(raw)
                        payload["data_url"] = (
                            f"data:{page_media};base64,"
                            + base64.b64encode(raw).decode("ascii"))
                        self._json(payload)
                        return

                # Not an image (and no page raster): the type is the preview.
                payload["no_inline"] = True
            except Exception as exc:  # pragma: no cover — surface to the UI
                import traceback
                traceback.print_exc()
                self._fail(500, f"resource-preview failed: {exc}")
                return
            self._json(payload)

        # ── thumbnails from OPTIONAL engines (G2) ─────────────────────────────
        # Both of these return None when their library is absent, and the caller
        # falls back to exactly what it did before. That is the whole contract: a
        # bridge without Pillow behaves like yesterday's bridge, and one with it
        # moves LESS data — which is the unusual and pleasant part. A 7 MB
        # orthophoto used to be refused as "too large"; now it arrives as a ~40 kB
        # JPEG, so adding the dependency reduces bandwidth instead of adding a
        # feature at a cost.
        @staticmethod
        def _has_pillow():
            try:
                import PIL  # noqa: F401
                return True
            except ImportError:
                return False

        def _thumbnail(self, path, max_px):
            """(bytes, media_type, (w, h)) downscaled with Pillow, or None."""
            try:
                from PIL import Image, ImageOps
            except ImportError:
                return None
            try:
                import io
                with Image.open(path) as im:
                    # EXIF orientation applied: a portrait photo from a camera is
                    # stored landscape with a flag, and ignoring it shows every
                    # field photo on its side.
                    im = ImageOps.exif_transpose(im)
                    im.thumbnail((max_px, max_px))
                    dims = im.size
                    buf = io.BytesIO()
                    # Alpha survives as PNG; everything else becomes JPEG, which
                    # for a photographic thumbnail is several times smaller.
                    if im.mode in ("RGBA", "LA", "P"):
                        im.convert("RGBA").save(buf, format="PNG", optimize=True)
                        return buf.getvalue(), "image/png", dims
                    im.convert("RGB").save(buf, format="JPEG", quality=82,
                                           optimize=True)
                    return buf.getvalue(), "image/jpeg", dims
            except Exception as exc:
                # A file Pillow cannot decode (a TIFF variant, a truncated scan)
                # is not an error here: the caller draws a typed placeholder.
                sys.stderr.write(f"  [bridge] thumbnail failed: {exc}\n")
                return None

        def _pdf_first_page(self, path, max_px):
            """(bytes, media_type) raster of page 1, or None when no engine is
            installed. PyMuPDF is tried first (one call), then pdf2image."""
            try:
                import fitz  # PyMuPDF
            except ImportError:
                fitz = None
            if fitz is not None:
                try:
                    import io
                    with fitz.open(path) as doc:
                        if not doc.page_count:
                            return None
                        page = doc.load_page(0)
                        rect = page.rect
                        longest = max(rect.width, rect.height) or 1
                        zoom = min(2.0, max_px / longest)
                        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
                        return pix.tobytes("png"), "image/png"
                except Exception as exc:
                    sys.stderr.write(f"  [bridge] pdf first page failed: {exc}\n")
                    return None
            return None

        def _presign_s3(self, s3_uri):
            """s3://bucket/key → a temporary http URL, or None when the MinIO
            extra is not bundled / the store is unreachable. Best effort: a
            missing signature is a placeholder, not an error."""
            if not hasattr(api, "presign_minio_resource"):
                return None
            rest = s3_uri[5:] if s3_uri.startswith("s3://") else s3_uri
            key = rest.split("/", 1)[1] if "/" in rest else ""
            if not key:
                return None
            try:
                return api.presign_minio_resource(key, expires_seconds=3600).get(
                    "http_url")
            except Exception:
                return None

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

    _ensure_proj_data()

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
    # A socket left in TIME_WAIT by a Ctrl-C should not lock the port for the
    # next run. This does NOT help against a bridge that is still alive — for
    # that there is the message below, and dev.sh frees the port up front.
    ThreadingHTTPServer.allow_reuse_address = True
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE:
            raise
        # A traceback here says "something went wrong in the socket module".
        # What the reader actually needs is the one command that fixes it.
        print(
            f"error: port {args.port} is already in use — a previous em-bridge "
            f"is probably still running.\n"
            f"Free it with:\n"
            f"    lsof -ti tcp:{args.port} | xargs kill\n"
            f"or start this one elsewhere with --port <n>.",
            file=sys.stderr,
        )
        return 2
    print(f"em_bridge listening on http://{args.host}:{args.port} "
          f"(POST /graphml, /import-graphml, /export-ttl, /resolve-authority, "
          f"/scan-resources, /list-resources, /resolve-resource, "
          f"/resource-preview, /reproject, /georeference-scene, /ingest-minio, "
          f"/presign, /detach-dtc, /inject-dtc, /bake-dtc; "
          f"GET /health, /resolve-authority) — Ctrl-C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nem_bridge stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
