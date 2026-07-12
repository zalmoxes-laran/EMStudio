# EMStudio frontend

TypeScript + Vite, single custom canvas renderer serving both projections
(ARCHITECTURE.md §6): **Matrix view** (epoch swimlanes, geometry from the
`.em.json` `layout` section produced by em-core) and **Graph view** (full
property graph, deterministic client-side layered layout for inspection).

Styles are driven by `src/assets/em_visual_rules.json`, a verbatim copy of
`s3dgraphy/JSON_config/em_visual_rules.json` — refresh it when the datamodel
bumps; EMStudio never hardcodes the EM language.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 — auto-loads testdata/TempluMare.em.json
```

## Build

```sh
npm run build      # → dist/index.html, fully self-contained (single file)
```

The single-file build works over `file://`, inside the Tauri shell
(`apps/desktop`) and as a portable artefact.

## Current features (phase 2–3, read-only)

- open `.em.json` via button or drag & drop
- Matrix ⁄ Graph view toggle (matrix requires a `layout` section:
  `emstudio layout file.em.json -o out.em.json`)
- pan (drag), zoom (wheel, `+`/`-`), fit (`0`), tooltip on hover
- click → inspector: type chip, description, data fields, connections
  grouped by edge type (click to jump)
- search by id/name/description
- edge filter (all / stratigraphic only / none) + live legend

Still to come (phase 4+): palette + editing with live socket validation from
`allowed_connections`, group folding with breadcrumb navigation (hypergraph
UX), from-sketch incremental layout.

`viewer.html` is the throwaway phase-2 proof kept for reference; the Vite app
supersedes it.
