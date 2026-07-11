# `.em.json` v1 — draft specification

Status: **v1.0 FROZEN (11 July 2026)** — reference implementation in
s3Dgraphy (`exporter/emjson_exporter.py`, `importer/emjson_importer.py`,
round-trip test `tests/test_emjson_roundtrip.py`). The normative spec lives
with the reference implementation; this copy tracks the editor's needs.

**Freeze decision record — flat, not bucketed.** The `graph` section is a
FLAT property graph (nodes[]/edges[]), NOT the bucketed Heriverse payload:
one canonical shape for editor, library and web consumers, and the
bucket-enumeration bug class (node types silently dropped when a bucket
list lags the datamodel) becomes structurally impossible. The bucketed
payload (json_exporter) remains available as the legacy transitional
format for Heriverse 1.5.x; Heriverse 1.6 adopts `.em.json`.

```jsonc
{
  "header": {
    "format": "em.json",
    "version": "1.0",                      // semver of the FORMAT
    "generator": { "tool": "EMStudio", "version": "0.1.0" },
    "datamodel_versions": {                // mirrors s3Dgraphy headers
      "nodes": "1.6.0", "connections": "1.6.0", "qualia": "4.1"
    },
    "ontology_versions": { "CIDOC-CRM": "7.1.3", "CRMarchaeo": "2.1.1" /* … */ }
  },

  "graph": {
    "graph_id": "…",
    "name": "…", "description": "…",          // optional
    "data": { },                               // graph-level metadata
    "nodes": [ {"id": "US12", "node_type": "US",
                "name": "US12", "description": "wall",
                "data": { }} ],
    "edges": [ {"id": "e1", "edge_type": "is_after",
                "source": "US12", "target": "US13"} ]
  },

  "layout": {                              // OPTIONAL, reconstructable
    "canvas": { "title": "…", "width": 0, "height": 0 },
    "swimlanes": [                         // epoch lanes, top = most recent
      { "epoch_id": "EP2", "order": 0, "y": 0.0, "height": 480.0 }
    ],
    "sectors": [                           // vertical spatial columns
      { "id": "peristylium", "order": 0, "x": 0.0, "width": 900.0 }
    ],
    "positions": { "US12": { "x": 120.5, "y": 340.0, "w": 60, "h": 30 } },
    "folded_groups": ["USV148_PD"],
    "group_spaces": {                      // per-context positions (§5 folding)
      "USV148_PD": { "positions": { "D.05": { "x": 40, "y": 80 } } }
    },
    "edge_routes": { "e17": [[120,340],[120,410],[260,410]] }   // optional
  },

  "@context": "…"                          // optional JSON-LD lift, later
}
```

## Conformance

1. `header.format` and `header.version` are mandatory; consumers MUST reject
   major versions they do not know and MUST ignore unknown top-level keys.
2. `graph` is the single source of truth; a consumer that rewrites `graph`
   MUST either update or drop `layout` (stale layout is worse than none).
3. `layout` is always optional: the EMStudio layout engine regenerates it
   deterministically (same input → same output, CI-diffable).
4. IDs in `layout` MUST reference existing graph node/edge ids; danglers are
   ignored with a warning.
5. Positions in `group_spaces` are local to the group's own canvas (folding
   navigation); `positions` are global-canvas coordinates.

## Open points (to close with s3Dgraphy before freeze)

* ~~Edge ids~~ — RESOLVED at freeze: edges carry the s3dgraphy `edge_id`.
* Multigraph documents (multiple graphs per file) — single-graph in v1;
  multi-graph in v1.1.
* Checksum / provenance of the generating datamodels (nice for CI).
