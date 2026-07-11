# yEd parity checklist (layout & interaction)

Extracted from yEd's *Hierarchic Swimlane Layout* dialogs (screenshots,
11 July 2026) and EM 1.5 authoring practice. This is the reference feature
set the em-core layout engine and the frontend must cover — adapted, not
cloned: items marked *semantic* are solved by EM data rather than options.

## Layout — General
- [ ] Orientation top-to-bottom (EM: fixed, newest epoch on top) — *semantic*
- [ ] Symmetric placement (engine flag)
- [ ] Incremental layout of selected elements only (partial layout)
- [ ] Use drawing as sketch (soft-constraint mode) — **essential**
- [ ] Minimum distances: node↔node, node↔edge, edge↔edge, layer↔layer
- [ ] Maximal duration bound (engine time budget)

## Layout — Edges
- [ ] Orthogonal routing style (default in EM)
- [ ] Automatic edge grouping / bus routing (bundling of parallel
      stratigraphic edges)
- [ ] Minimum first/last segment length, minimum length, minimum edge distance
- [ ] Port constraint optimisation (socket sides per edge family:
      stratigraphic = vertical, paradata = bottom, epoch = lateral)
- [ ] Straighten edges option
- [ ] Arrows define edge direction (EM: canonical direction from datamodel)
      — *semantic*
- [ ] Consider edge thickness

## Layout — Layers
- [ ] Layer assignment policy — EM: **From epochs** (replaces
      Hierarchical-Optimal / Tight-Tree / BFS / Topmost) — *semantic*;
      "From sketch" kept for free-graph view
- [ ] Alignment within layer (top/center/bottom of nodes)
- [ ] Intra-lane sub-layering (paradata cascades inside one epoch)
- [ ] Component arrangement

## Layout — Labeling
- [ ] Consider node labels (avoid overlap)
- [ ] Edge labeling: none / generic / hierarchic, label model, compact placement

## Layout — Grouping
- [ ] Layering strategy: ignore groups / respect groups
- [ ] Horizontal group compaction (weak/strong)
- [ ] Uniform group port assignment
- [ ] Groups as layout constraints when open; single node when folded

## Layout — Swimlanes
- [ ] Epoch lanes from data; lane order = chronology — *semantic*
- [ ] Lane spacing, minimum insets, compact swimlanes
- [ ] Sectors as orthogonal (vertical) partition — EM extension beyond yEd

## Layout — Grid
- [ ] Optional snap grid with spacing; port snapping

## Interaction (editor)
- [ ] Palette with EM node types (generated from node datamodel + SVG glyphs)
- [ ] Live socket validation from `allowed_connections` while drawing edges
- [ ] Group fold/unfold (proxy node) — double-click enters group space,
      breadcrumb + back button (hypergraph navigation) — **essential**
- [ ] Overview panel (minimap), neighborhood panel, structure tree
- [ ] Properties/inspector view (per-node data, paradata chain preview)
- [ ] Search with type/label filters
- [ ] Undo/redo, copy/paste with id re-minting
- [ ] Export SVG / PDF / PNG of current view
- [ ] One-click layout
