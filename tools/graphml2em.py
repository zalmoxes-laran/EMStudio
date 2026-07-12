#!/usr/bin/env python3
"""GraphML (yEd) → .em.json, via s3Dgraphy — the reference implementation.

One-time / batch interop stays in Python by design (ADR-001, Addendum C):
the importer handles yEd groups, US/USD/VSF containers (→ is_part_of),
Master/Instance document deduplication and the EM 1.6 colour taxonomy.

Usage:
    python3 tools/graphml2em.py input.graphml output.em.json
    python3 tools/graphml2em.py input.graphml output.em.json \
        --s3dgraphy ~/GitHub/s3Dgraphy/src

Then compute the layout:
    emstudio layout output.em.json -o output.em.json
"""

from __future__ import annotations

import argparse
import pathlib
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("graphml", type=pathlib.Path)
    ap.add_argument("emjson", type=pathlib.Path)
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
        from s3dgraphy.exporter.emjson_exporter import export_emjson
        from s3dgraphy.graph import Graph
        from s3dgraphy.importer.import_graphml import GraphMLImporter
    except ImportError as exc:  # pragma: no cover
        print(
            f"error: cannot import s3dgraphy ({exc}).\n"
            "Install it (pip install s3dgraphy) or pass --s3dgraphy "
            "pointing at a checkout's src/ directory.",
            file=sys.stderr,
        )
        return 1

    graph = Graph(graph_id=args.graphml.stem)
    graph = GraphMLImporter(str(args.graphml), graph).parse()
    export_emjson(graph, str(args.emjson))
    print(
        f"{args.emjson}: {len(graph.nodes)} nodes, {len(graph.edges)} edges "
        f"(now run: emstudio layout {args.emjson} -o {args.emjson})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
