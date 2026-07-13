#!/usr/bin/env python3
""".em.json → GraphML (yEd), via s3Dgraphy — the reference implementation.

Round-trip counterpart of ``graphml2em.py`` (ADR-001, Addendum C): batch
interop stays in Python by design. This re-emits the native .em.json
document as a yEd-compatible GraphML, so a graph authored/edited in
EMStudio can be reopened in yEd and re-imported without loss of the EM
structure the exporter expresses as GraphML nesting:

    * US/USD/VSF stratigraphic containers  →  yEd group nodes
      (``is_part_of`` is re-derived from the nesting on import — it is
      never emitted as an explicit edge, because yEd edges carry only a
      line style, so an explicit ``is_part_of`` would re-import as a
      bogus ``is_after``).
    * ParadataNodeGroups, epoch swimlanes and the physical-relations /
      property side channels are handled by the s3Dgraphy exporter.

Usage:
    python3 tools/em2graphml.py input.em.json output.graphml
    python3 tools/em2graphml.py input.em.json output.graphml \
        --s3dgraphy ~/GitHub/s3Dgraphy/src
"""

from __future__ import annotations

import argparse
import pathlib
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("emjson", type=pathlib.Path)
    ap.add_argument("graphml", type=pathlib.Path)
    ap.add_argument(
        "--s3dgraphy",
        type=pathlib.Path,
        default=None,
        help="path to a s3Dgraphy 'src' directory (default: installed "
        "package, else ../s3Dgraphy/src next to this repo)",
    )
    args = ap.parse_args()

    if args.s3dgraphy:
        sys.path.insert(0, str(args.s3dgraphy))
    else:
        sibling = pathlib.Path(__file__).resolve().parents[2] / "s3Dgraphy" / "src"
        if sibling.is_dir():
            sys.path.insert(0, str(sibling))

    try:
        from s3dgraphy.exporter.graphml.graphml_exporter import GraphMLExporter
        from s3dgraphy.importer.emjson_importer import import_emjson
    except ImportError as exc:  # pragma: no cover
        print(
            f"error: cannot import s3dgraphy ({exc}).\n"
            "Install it (pip install s3dgraphy) or pass --s3dgraphy "
            "pointing at a checkout's src/ directory.",
            file=sys.stderr,
        )
        return 1

    graph, warnings = import_emjson(str(args.emjson))
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)

    GraphMLExporter(graph).export(str(args.graphml))
    print(
        f"{args.graphml}: {len(graph.nodes)} nodes, {len(graph.edges)} edges "
        f"(open in yEd; re-import with tools/graphml2em.py)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
