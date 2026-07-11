# EMStudio frontend

Not yet initialised. To scaffold (phase 2):

```bash
# prerequisites: node >= 20
npm create vite@latest . -- --template svelte-ts   # or react-ts, to decide
npm install konva          # MIT — canvas scene graph (or pixi.js, MIT)
```

Principles (see ../docs/ARCHITECTURE.md §6):

* one renderer, two views (matrix swimlane / full graph) over the same model;
* palette generated at runtime from `s3Dgraphy_node_datamodel.json`
  (symbol/label/description per node type) + SVG glyphs
  (extend s3Dgraphy `em_palette_icons.json`);
* live socket validation from `allowed_connections` while drawing edges;
* group folding with breadcrumb navigation (hypergraph UX) — essential;
* no EPL/commercial libraries (GPL-3.0 suite — licensing table in
  ARCHITECTURE §7).
