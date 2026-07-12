import "./style.css";
import { edgeStyle, SEQUENCE_EDGES } from "./palette";
import { render } from "./renderer";
import { hitTest, sceneBounds, Viewport, type Scene } from "./scene";
import { renderInspector } from "./inspector";
import { setupSearch } from "./search";
import type { EmDocument, ViewKind } from "./types";
import { buildGraphScene } from "./views/graph";
import { buildMatrixScene } from "./views/matrix";

declare global {
  interface Window {
    __EM_TEST_DATA__?: EmDocument;
  }
}

// ---------- state ----------
let doc: EmDocument | null = null;
let view: ViewKind = "matrix";
const scenes: Partial<Record<ViewKind, Scene | null>> = {};
const viewports: Record<ViewKind, Viewport> = {
  matrix: new Viewport(),
  graph: new Viewport(),
};
let hoverId: string | null = null;
let selectedId: string | null = null;
let edgeFilter: "all" | "sequence" | "none" = "all";

// ---------- dom ----------
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const wrap = document.getElementById("canvas-wrap")!;
const info = document.getElementById("info")!;
const tooltip = document.getElementById("tooltip")!;
const dropHint = document.getElementById("drop-hint")!;
const legend = document.getElementById("legend")!;
const inspector = document.getElementById("inspector")!;
const btnMatrix = document.getElementById("btn-matrix") as HTMLButtonElement;
const btnGraph = document.getElementById("btn-graph") as HTMLButtonElement;

function viewSize(): { w: number; h: number } {
  return { w: wrap.clientWidth, h: wrap.clientHeight };
}

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = viewSize();
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  draw();
}

const edgeVisible = (t: string | undefined): boolean => {
  if (edgeFilter === "none") return false;
  if (edgeFilter === "sequence") return SEQUENCE_EDGES.has(t ?? "");
  return true;
};

function scene(): Scene | null {
  return scenes[view] ?? null;
}

function draw(): void {
  const s = scene();
  const { w, h } = viewSize();
  if (!s) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return;
  }
  render(ctx, s, viewports[view], { hoverId, selectedId, edgeVisible }, w, h);
}

function fit(): void {
  const s = scene();
  if (!s) return;
  const { w, h } = viewSize();
  viewports[view].fit(sceneBounds(s), w, h);
  draw();
}

function centerOn(nodeId: string): void {
  const s = scene();
  const n = s?.byId.get(nodeId);
  if (!n) return;
  const vp = viewports[view];
  const { w, h } = viewSize();
  vp.scale = Math.max(vp.scale, 0.8);
  vp.x = w / 2 - (n.x + n.w / 2) * vp.scale;
  vp.y = h / 2 - (n.y + n.h / 2) * vp.scale;
  draw();
}

function select(nodeId: string | null): void {
  selectedId = nodeId;
  renderInspector(inspector, doc ?? { graph: { nodes: [], edges: [] } }, nodeId, {
    onJump: (id) => {
      select(id);
      centerOn(id);
    },
    onClose: () => select(null),
  });
  draw();
}

function updateLegend(): void {
  legend.innerHTML = "";
  const s = scene();
  if (!s || edgeFilter === "none") {
    legend.classList.add("hidden");
    return;
  }
  const types = new Set<string>();
  for (const e of s.edges) {
    const t = e.edge.edge_type ?? "edge";
    if (edgeVisible(e.edge.edge_type)) types.add(t);
  }
  if (!types.size) {
    legend.classList.add("hidden");
    return;
  }
  for (const t of [...types].sort()) {
    const st = edgeStyle(t);
    const item = document.createElement("span");
    item.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.borderBottomColor = st.color;
    sw.style.borderBottomStyle = st.dash.length ? "dashed" : "solid";
    item.appendChild(sw);
    item.appendChild(document.createTextNode(st.label));
    legend.appendChild(item);
  }
  legend.classList.remove("hidden");
}

function setView(v: ViewKind): void {
  view = v;
  btnMatrix.classList.toggle("active", v === "matrix");
  btnGraph.classList.toggle("active", v === "graph");
  if (doc && scenes[v] === undefined) buildScenes();
  if (scenes[v] === null && v === "matrix") {
    info.textContent =
      "no layout section — run: emstudio layout file.em.json -o out.em.json";
  } else {
    updateInfo();
  }
  updateLegend();
  fit();
}

function updateInfo(): void {
  if (!doc) return;
  const g = doc.graph;
  const lanes = scenes.matrix?.lanes.length ?? 0;
  const title =
    (g["name"] as string | undefined) ??
    (doc.header?.["name"] as string | undefined) ??
    g.graph_id ??
    "untitled";
  info.textContent =
    `${title} — ${g.nodes.length} nodes, ` +
    `${g.edges.length} edges` +
    (lanes ? `, ${lanes} epochs` : "");
}

function buildScenes(): void {
  if (!doc) return;
  scenes.matrix = buildMatrixScene(doc);
  scenes.graph = buildGraphScene(doc);
}

function loadDocument(d: EmDocument, sourceName: string): void {
  if (!d?.graph?.nodes) {
    info.textContent = `${sourceName}: not an .em.json document (missing graph.nodes)`;
    return;
  }
  doc = d;
  scenes.matrix = undefined;
  scenes.graph = undefined;
  hoverId = null;
  select(null);
  buildScenes();
  dropHint.classList.add("hidden");
  // prefer matrix when a layout is present, otherwise fall back to graph view
  setView(scenes.matrix ? "matrix" : "graph");
}

function loadFile(file: File): void {
  file
    .text()
    .then((t) => loadDocument(JSON.parse(t) as EmDocument, file.name))
    .catch((e) => (info.textContent = `parse error: ${e}`));
}

// ---------- toolbar wiring ----------
const fileInput = document.getElementById("file-input") as HTMLInputElement;
document.getElementById("btn-open")!.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
  fileInput.value = "";
});
btnMatrix.addEventListener("click", () => setView("matrix"));
btnGraph.addEventListener("click", () => setView("graph"));
document.getElementById("btn-fit")!.addEventListener("click", fit);
(document.getElementById("edge-filter") as HTMLSelectElement).addEventListener(
  "change",
  (ev) => {
    edgeFilter = (ev.target as HTMLSelectElement).value as typeof edgeFilter;
    updateLegend();
    draw();
  },
);

setupSearch(
  document.getElementById("search") as HTMLInputElement,
  document.getElementById("search-results")!,
  () => doc,
  (id) => {
    select(id);
    centerOn(id);
  },
);

// ---------- drag & drop ----------
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

// ---------- canvas interactions ----------
let panning = false;
let moved = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  panning = true;
  moved = false;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.classList.add("panning");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  if (panning) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (moved) {
      const vp = viewports[view];
      vp.x += dx;
      vp.y += dy;
      lastX = e.clientX;
      lastY = e.clientY;
      tooltip.classList.add("hidden");
      draw();
    }
    return;
  }
  const s = scene();
  if (!s) return;
  const w = viewports[view].toWorld(sx, sy);
  const hit = hitTest(s, w.x, w.y);
  const newHover = hit?.id ?? null;
  if (newHover !== hoverId) {
    hoverId = newHover;
    draw();
  }
  if (hit) {
    tooltip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
    (tooltip.children[0] as HTMLElement).textContent = String(
      hit.node.name || hit.id,
    );
    (tooltip.children[1] as HTMLElement).textContent = `[${hit.node.node_type}] ${hit.id}`;
    (tooltip.children[3] as HTMLElement).textContent = String(
      hit.node.description ?? "",
    ).slice(0, 220);
    tooltip.style.left = Math.min(e.clientX + 14, innerWidth - 380) + "px";
    tooltip.style.top = e.clientY + 14 + "px";
    tooltip.classList.remove("hidden");
  } else {
    tooltip.classList.add("hidden");
  }
});

canvas.addEventListener("pointerup", (e) => {
  canvas.classList.remove("panning");
  if (panning && !moved) {
    const rect = canvas.getBoundingClientRect();
    const s = scene();
    if (s) {
      const w = viewports[view].toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = hitTest(s, w.x, w.y);
      select(hit?.id ?? null);
    }
  }
  panning = false;
});

canvas.addEventListener("pointerleave", () => {
  tooltip.classList.add("hidden");
  if (hoverId) {
    hoverId = null;
    draw();
  }
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    viewports[view].zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      Math.exp(-e.deltaY * 0.0016),
    );
    draw();
  },
  { passive: false },
);

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "0") fit();
  if (e.key === "Escape") select(null);
  if (e.key === "+" || e.key === "=")
    viewports[view].zoomAt(viewSize().w / 2, viewSize().h / 2, 1.25), draw();
  if (e.key === "-")
    viewports[view].zoomAt(viewSize().w / 2, viewSize().h / 2, 0.8), draw();
});

new ResizeObserver(resizeCanvas).observe(wrap);
resizeCanvas();

// ---------- boot ----------
if (window.__EM_TEST_DATA__) {
  loadDocument(window.__EM_TEST_DATA__, "embedded test data");
} else if (location.protocol !== "file:") {
  // dev convenience: auto-load the sample if it is served alongside the app
  fetch("./testdata/TempluMare.em.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && !doc) loadDocument(d as EmDocument, "TempluMare sample");
    })
    .catch(() => void 0);
}
