// Single canvas renderer serving both projections (matrix and graph view):
// one hit-testing model, one style system, styles driven by the EM palette
// metadata (palette.ts ← em_visual_rules.json). Edges are routed
// orthogonally with crossing bridges (routing.ts), yEd-style.
import { ICON_NODE_TYPES, imageFor } from "./icons";
import { documentVariant, edgeStyle, nodeStyle } from "./palette";
import {
  drawArrowhead,
  routeScene,
  SYMMETRIC_EDGES,
  traceRoute,
  type EdgeRoute,
} from "./routing";
import { BAND_GAP } from "./scene";
import type { Scene, Viewport } from "./scene";

export interface ConnectDrag {
  fromId: string;
  /** current pointer position, world space */
  x: number;
  y: number;
  targetId: string | null;
  validity: "valid" | "generic" | "invalid" | null;
}

export interface RenderState {
  hoverId: string | null;
  selectedId: string | null;
  /** multi-selection set (D3); the primary is still `selectedId` */
  selectedIds?: Set<string> | null;
  /** edge_type predicate; edges failing it are skipped */
  edgeVisible: (edgeType: string | undefined) => boolean;
  /** index (into scene.edges) of the hovered connector, if any */
  hoverEdgeIdx?: number | null;
  /** index (into scene.edges) of the selected connector, if any */
  selectedEdgeIdx?: number | null;
  /** cache key for the edge filter (routes are recomputed when it changes) */
  filterKey?: string;
  /** live edge-drawing state (phase 4 editing) */
  connect?: ConnectDrag | null;
  /** show the connect handle on the hovered/selected node */
  editable?: boolean;
}

// per-scene route cache (scenes are rebuilt on every document mutation)
interface RouteCache {
  key: string;
  routes: EdgeRoute[];
  visible: boolean[];
}
const routeCaches = new WeakMap<Scene, RouteCache>();

function routesFor(scene: Scene, state: RenderState): RouteCache {
  const key = state.filterKey ?? "all";
  const hit = routeCaches.get(scene);
  if (hit && hit.key === key) return hit;
  const visible = scene.edges.map((e) => state.edgeVisible(e.edge.edge_type));
  const cache = { key, routes: routeScene(scene, visible), visible };
  routeCaches.set(scene, cache);
  return cache;
}

/** Squared distance from a point to a segment (world space). */
function distSqToSeg(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const vx = b.x - a.x,
    vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((px - a.x) * vx + (py - a.y) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (a.x + t * vx),
    dy = py - (a.y + t * vy);
  return dx * dx + dy * dy;
}

/** Index into `scene.edges` of the closest VISIBLE connector whose routed
 *  polyline passes within `tol` world units of (wx,wy); -1 if none. Uses the
 *  same cached routes the renderer draws, so picking matches the drawing. */
export function edgeAt(
  scene: Scene,
  state: RenderState,
  wx: number,
  wy: number,
  tol: number,
): number {
  const { routes, visible } = routesFor(scene, state);
  const tol2 = tol * tol;
  let best = -1;
  let bestD = tol2;
  for (let i = 0; i < routes.length; i++) {
    if (!visible[i]) continue;
    const pts = routes[i].pts;
    for (let s = 0; s < pts.length - 1; s++) {
      const d = distSqToSeg(wx, wy, pts[s], pts[s + 1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

const LANE_COLORS = ["#EDF3FA", "#F7FAFD"];
const ACCENT = "#1F6FEB";
const GROUP_HEADER_FILL = "#F6D7A4"; // yEd folder tab (paradata groups)
const GROUP_BODY_FILL = "rgba(190,196,204,0.25)";

// Screen-space hit rects for the "PD" tags drawn in lane / band label chips
// (an epoch's / phase's temporal ParadataNodeGroup, shown as a tag instead of a
// box). Rebuilt every draw; queried by main.ts on click to enter that group.
let pdTagHits: { pdgId: string; x: number; y: number; w: number; h: number }[] = [];
export function hitPdTag(sx: number, sy: number): string | null {
  for (const t of pdTagHits)
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h)
      return t.pdgId;
  return null;
}

// Screen-space hit rects for phase sub-band label chips → the id to select on
// click (the phase id, or the epoch id for the residual band). Rebuilt each draw.
let bandLabelHits: { id: string; x: number; y: number; w: number; h: number }[] = [];
export function hitBandLabel(sx: number, sy: number): string | null {
  for (const t of bandLabelHits)
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h)
      return t.id;
  return null;
}

// Screen-space hit circles for the "+" quick-add-phase button on each epoch's
// rail → the epoch id to add a phase to. Rebuilt each draw.
let addPhaseHits: { id: string; cx: number; cy: number; r: number }[] = [];
export function hitAddPhase(sx: number, sy: number): string | null {
  for (const t of addPhaseHits)
    if ((sx - t.cx) ** 2 + (sy - t.cy) ** 2 <= t.r * t.r) return t.id;
  return null;
}

/** group title-tab colour: the canonical `label_background` from
 *  em_visual_rules when present (Activity cyan / Paradata peach / TimeBranch
 *  green / Location grey), else a legacy fallback tint from the border. */
function headerFillFor(
  nodeType: string,
  border: string,
  labelBg?: string,
): string {
  if (labelBg) return labelBg;
  if (nodeType === "ParadataNodeGroup") return GROUP_HEADER_FILL;
  const h = border.replace("#", "");
  if (h.length < 6) return GROUP_HEADER_FILL;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.22)`;
}

function drawGroupContainer(
  ctx: CanvasRenderingContext2D,
  g: import("./scene").SceneGroup,
  borderColor: string,
  headerFill: string,
  scale: number,
  badge: number | undefined,
  drawLabels: boolean,
): void {
  // body
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.w, g.h, 5);
  ctx.fillStyle = GROUP_BODY_FILL;
  ctx.fill();
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2 / Math.sqrt(scale);
  ctx.stroke();
  ctx.setLineDash([]);
  // header band
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.w, g.headerH, [5, 5, 0, 0]);
  ctx.fillStyle = headerFill;
  ctx.fill();
  // ± toggle
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1 / Math.sqrt(scale);
  ctx.fillRect(g.x + 4, g.y + 4, 13, 13);
  ctx.strokeRect(g.x + 4, g.y + 4, 13, 13);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.4 / Math.sqrt(scale);
  ctx.beginPath();
  ctx.moveTo(g.x + 7, g.y + 10.5);
  ctx.lineTo(g.x + 14, g.y + 10.5);
  if (g.folded) {
    ctx.moveTo(g.x + 10.5, g.y + 7);
    ctx.lineTo(g.x + 10.5, g.y + 14);
  }
  ctx.stroke();
  // title
  if (drawLabels) {
    ctx.font = `600 ${Math.min(11, g.headerH * 0.55)}px system-ui, sans-serif`;
    ctx.fillStyle = "#4a3317";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let t = g.title;
    const maxW = g.w - 26;
    if (ctx.measureText(t).width > maxW) {
      while (t.length > 2 && ctx.measureText(t + "…").width > maxW)
        t = t.slice(0, -1);
      t += "…";
    }
    ctx.fillText(t, g.x + 21, g.y + g.headerH / 2 + 0.5);
  }
  // badge for folded containers
  if (badge) {
    const r = 9 / Math.sqrt(scale);
    ctx.beginPath();
    ctx.arc(g.x + g.w, g.y, r, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `${r * 1.1}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(badge), g.x + g.w, g.y + r * 0.05);
  }
}

function shapePath(
  ctx: CanvasRenderingContext2D,
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case "ellipse":
    case "circle":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "hexagon": {
      const c = Math.min(w * 0.2, h);
      ctx.moveTo(x + c, y);
      ctx.lineTo(x + w - c, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - c, y + h);
      ctx.lineTo(x + c, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    }
    case "parallelogram": {
      const k = w * 0.18;
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - k, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case "octagon": {
      const c = Math.min(w, h) * 0.29;
      ctx.moveTo(x + c, y);
      ctx.lineTo(x + w - c, y);
      ctx.lineTo(x + w, y + c);
      ctx.lineTo(x + w, y + h - c);
      ctx.lineTo(x + w - c, y + h);
      ctx.lineTo(x + c, y + h);
      ctx.lineTo(x, y + h - c);
      ctx.lineTo(x, y + c);
      ctx.closePath();
      break;
    }
    case "diamond":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case "pentagon":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h * 0.4);
      ctx.lineTo(x + w * 0.8, y + h);
      ctx.lineTo(x + w * 0.2, y + h);
      ctx.lineTo(x, y + h * 0.4);
      ctx.closePath();
      break;
    case "star": {
      const cx = x + w / 2,
        cy = y + h / 2,
        R = Math.min(w, h) / 2,
        r = R * 0.45;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R : r;
        const px = cx + rad * Math.cos(a),
          py = cy + rad * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "rectangle":
      ctx.rect(x, y, w, h);
      break;
    default: {
      // rounded_rectangle, roundrectangle, shield, chain, globe, model, …
      const r = Math.min(6, h / 2);
      ctx.roundRect(x, y, w, h, r);
    }
  }
}

// "Arrows point DOWN": a directed edge means source-above-target. An edge that
// points UP (target above source) conflicts with the lane chronology (e.g. an
// is_after toward a unit in a more-recent lane). Mirrors em-core `upward_edges`:
// symmetric / membership / epoch-attribution / paradata-group edges are exempt.
const CONFLICT_COLOR = "#ff1e1e"; // bright red
const CONFLICT_EXEMPT = new Set<string>([
  ...SYMMETRIC_EDGES,
  "is_in_activity",
  "is_in_paradata_nodegroup",
  "is_in_location",
  "is_in_timebranch",
  "is_part_of",
  "has_first_epoch",
  "survive_in_epoch",
  "has_paradata_nodegroup",
]);
function upwardConflict(scene: Scene, e: Scene["edges"][number]): boolean {
  if (CONFLICT_EXEMPT.has(e.edge.edge_type ?? "")) return false;
  const s = scene.byId.get(e.source);
  const tg = scene.byId.get(e.target);
  if (!s || !tg) return false;
  return tg.y + 0.5 < s.y; // target above source → arrow points up → conflict
}

export function render(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  vp: Viewport,
  state: RenderState,
  viewW: number,
  viewH: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.translate(vp.x, vp.y);
  ctx.scale(vp.scale, vp.scale);

  const worldLeft = -vp.x / vp.scale;
  const worldRight = (viewW - vp.x) / vp.scale;

  // lanes whose colour wash is provided by their phase sub-bands instead (so
  // the lane's own wash is suppressed there — otherwise the two stack and the
  // phase colour muddies against the epoch colour underneath)
  const lanesWithBands = new Set(scene.subBands?.map((sb) => sb.laneId));

  // epoch swimlanes
  scene.lanes.forEach((lane, i) => {
    ctx.fillStyle = LANE_COLORS[i % 2];
    ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
    // tint the whole lane with the epoch's own colour (data.color) at a very
    // low alpha — a 5%-visible wash; the strong colour lives in the left rail
    // + the label circle (drawn screen-space below). Skip it when sub-bands
    // cover the lane: each band paints its own single-colour wash below.
    if (lane.color && !lanesWithBands.has(lane.id)) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = lane.color;
      ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
      ctx.restore();
    }
    // selected epoch → a faint accent wash over the whole lane (visual feedback)
    if (lane.id === state.selectedId) {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
      ctx.restore();
    }
    ctx.strokeStyle = "#D5E0EC";
    ctx.lineWidth = 1 / vp.scale;
    ctx.beginPath();
    ctx.moveTo(worldLeft, lane.y);
    ctx.lineTo(worldRight, lane.y);
    ctx.stroke();
  });

  // phase sub-bands: a faint per-phase colour wash + a dashed separator at the
  // top edge of every band below the first (the first band's top is the lane
  // border already drawn above)
  if (scene.subBands?.length) {
    for (const sb of scene.subBands) {
      if (sb.color) {
        // single wash per band (the lane wash is suppressed under bands), so a
        // touch stronger than the old stacked 6% for a clean, legible tint
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = sb.color;
        ctx.fillRect(worldLeft, sb.y, worldRight - worldLeft, sb.height);
        ctx.restore();
      }
      // selected phase → accent wash over its band (same feedback as an epoch
      // lane); the residual band defers to the epoch's own lane highlight
      if (!sb.residual && sb.phaseId === state.selectedId) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = ACCENT;
        ctx.fillRect(worldLeft, sb.y, worldRight - worldLeft, sb.height);
        ctx.restore();
      }
      if (sb.first) continue; // topmost band: the lane border is its top edge
      ctx.save();
      ctx.strokeStyle = sb.color || "#94a3b8";
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.5 / vp.scale;
      ctx.setLineDash([9 / vp.scale, 6 / vp.scale]);
      ctx.beginPath();
      const sepY = sb.y - BAND_GAP / 2; // centre the line in the inter-band gap
      ctx.moveTo(worldLeft, sepY);
      ctx.lineTo(worldRight, sepY);
      ctx.stroke();
      ctx.restore();
    }
  }

  // edges (below nodes); incident edges of the HOVERED node get an accent pass
  // (a transient connection preview). Selection does NOT light up edges — that
  // read as "selecting all connected edges" and was unwanted (E.D.).
  const focusId = state.hoverId;
  const { routes, visible } = routesFor(scene, state);
  const bridgeR = 3.5;
  const arrowSize = 6 / Math.sqrt(vp.scale);
  const accent: number[] = [];
  for (let i = 0; i < scene.edges.length; i++) {
    if (!visible[i]) continue;
    const e = scene.edges[i];
    if (focusId && (e.source === focusId || e.target === focusId)) {
      accent.push(i);
      continue;
    }
    const st = edgeStyle(e.edge.edge_type);
    const conflict = upwardConflict(scene, e);
    const col = conflict ? CONFLICT_COLOR : st.color;
    ctx.strokeStyle = col;
    ctx.globalAlpha = conflict ? 1 : e.edge.edge_type === "is_after" ? 0.85 : 0.45;
    ctx.lineWidth =
      (conflict ? Math.max(st.width, 2.5) : st.width) / Math.sqrt(vp.scale);
    ctx.setLineDash(conflict ? [] : st.dash.map((d) => d / Math.sqrt(vp.scale)));
    ctx.beginPath();
    traceRoute(ctx, routes[i], bridgeR);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      drawArrowhead(ctx, routes[i], arrowSize, col);
  }
  for (const i of accent) {
    const e = scene.edges[i];
    const st = edgeStyle(e.edge.edge_type);
    const col = upwardConflict(scene, e) ? CONFLICT_COLOR : st.color;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 1;
    ctx.lineWidth = (st.width * 2) / Math.sqrt(vp.scale);
    ctx.setLineDash(st.dash.map((d) => d / Math.sqrt(vp.scale)));
    ctx.beginPath();
    traceRoute(ctx, routes[i], bridgeR);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      drawArrowhead(ctx, routes[i], arrowSize * 1.4, col);
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // picked connector (hover / selection): a blue halo + a bold solid stroke so
  // one edge stands out for inspection or deletion. Selection beats hover.
  const pickEdge = (idx: number | null | undefined, sel: boolean): void => {
    if (idx == null || idx < 0 || !visible[idx]) return;
    const e = scene.edges[idx];
    const base = edgeStyle(e.edge.edge_type).width;
    ctx.lineCap = "round";
    ctx.globalAlpha = sel ? 0.28 : 0.16;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = (base + (sel ? 9 : 7)) / Math.sqrt(vp.scale);
    ctx.beginPath();
    traceRoute(ctx, routes[idx], bridgeR);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = (base + (sel ? 2.4 : 1.4)) / Math.sqrt(vp.scale);
    ctx.beginPath();
    traceRoute(ctx, routes[idx], bridgeR);
    ctx.stroke();
    ctx.lineCap = "butt";
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      drawArrowhead(ctx, routes[idx], arrowSize * 1.4, ACCENT);
  };
  pickEdge(state.hoverEdgeIdx, false);
  pickEdge(state.selectedEdgeIdx, true);
  ctx.globalAlpha = 1;

  // nodes
  const drawLabels = vp.scale > 0.35;
  const isSel = (n: { id: string; instanceOf?: string }): boolean =>
    n.id === state.selectedId ||
    n.instanceOf === state.selectedId ||
    (state.selectedIds?.has(n.id) ?? false);
  for (const n of scene.nodes) {
    const st = nodeStyle(n.node.node_type);
    const group = scene.groupsById?.get(n.id);
    if (group) {
      drawGroupContainer(
        ctx,
        group,
        st.border,
        headerFillFor(n.node.node_type, st.border, st.labelBackground),
        vp.scale,
        n.badge,
        drawLabels,
      );
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? ACCENT : isSel(n) ? "#5b9bf0" : "#a9c9f5";
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(n.x - 2, n.y - 2, n.w + 4, n.h + 4);
      }
      continue;
    }

    // paradata nodes render as their official 2D icon (yEd parity):
    // extractor / combiner get the glyph with the label top-left,
    // document gets the sheet with the label over it
    const icon = ICON_NODE_TYPES.has(n.node.node_type)
      ? imageFor(n.node.node_type)
      : null;
    // document: vector sheet with ITS OWN border — thickness carries the
    // Master/Instance role, colour the geometry-axis variant
    // (em_visual_rules.document_variant_styles); corner decorator counts
    // the scene uses
    if (n.node.node_type === "document") {
      const data = (n.node.data ?? {}) as Record<string, unknown>;
      const isMaster =
        data["is_master"] === true ||
        (!n.instanceOf && (n.useCount ?? 0) > 1);
      const variant = documentVariant(
        typeof data["certainty_class"] === "string"
          ? (data["certainty_class"] as string)
          : undefined,
      );
      const ih = Math.min(n.h, 30);
      const iw = ih * 0.78;
      const x0 = n.x + n.w / 2 - iw / 2;
      const y0 = n.y + n.h / 2 - ih / 2;
      const f = iw * 0.32; // folded corner
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + iw - f, y0);
      ctx.lineTo(x0 + iw, y0 + f);
      ctx.lineTo(x0 + iw, y0 + ih);
      ctx.lineTo(x0, y0 + ih);
      ctx.closePath();
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = isMaster ? variant.color : "#1a1a1a";
      ctx.lineWidth =
        (isMaster ? Math.max(2.4, variant.width * 0.65) : 0.9) /
        Math.sqrt(vp.scale);
      ctx.stroke();
      // fold
      ctx.beginPath();
      ctx.moveTo(x0 + iw - f, y0);
      ctx.lineTo(x0 + iw - f, y0 + f);
      ctx.lineTo(x0 + iw, y0 + f);
      ctx.strokeStyle = isMaster ? variant.color : "#1a1a1a";
      ctx.lineWidth = 0.9 / Math.sqrt(vp.scale);
      ctx.stroke();
      if (drawLabels) {
        const label = String(n.node.name || n.id);
        ctx.font = `10px system-ui, sans-serif`;
        ctx.fillStyle = "#1a1a1a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, n.x + n.w / 2, y0 + ih * 0.62);
      }
      if (n.useCount) {
        const r = 6.5 / Math.sqrt(vp.scale);
        const bx = x0 + iw + 1;
        const by = y0 + ih + 1;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = n.instanceOf ? "#8a939e" : "#4a5568";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `${r * 1.15}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(n.useCount), bx, by + r * 0.05);
      }
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? ACCENT : isSel(n) ? "#5b9bf0" : "#a9c9f5";
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(x0 - 3, y0 - 3, iw + 6, ih + 6);
      }
      continue;
    }

    // property: yEd chip — white rectangle with a corner tab, name inside
    if (n.node.node_type === "property") {
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.1 / Math.sqrt(vp.scale);
      ctx.fillRect(n.x, n.y, n.w, n.h);
      ctx.strokeRect(n.x, n.y, n.w, n.h);
      // the two little tab ticks on the left edge (palette template)
      ctx.beginPath();
      ctx.moveTo(n.x, n.y + 4);
      ctx.lineTo(n.x - 4, n.y + 4);
      ctx.lineTo(n.x - 4, n.y + n.h - 4);
      ctx.lineTo(n.x, n.y + n.h - 4);
      ctx.stroke();
      if (drawLabels) {
        const label = String(n.node.name || n.id);
        ctx.font = `${Math.min(11, n.h * 0.42)}px system-ui, sans-serif`;
        ctx.fillStyle = "#1a1a1a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const maxW = n.w - 10;
        let text = label;
        if (ctx.measureText(text).width > maxW) {
          while (text.length > 2 && ctx.measureText(text + "…").width > maxW)
            text = text.slice(0, -1);
          text += "…";
        }
        ctx.fillText(text, n.x + n.w / 2, n.y + n.h / 2);
      }
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? ACCENT : isSel(n) ? "#5b9bf0" : "#a9c9f5";
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(n.x - 3, n.y - 3, n.w + 6, n.h + 6);
      }
      continue;
    }

    if (icon) {
      const ih = Math.min(n.h, 30);
      const iw = (icon.naturalWidth / icon.naturalHeight) * ih;
      const ix = n.x + n.w / 2 - iw / 2;
      const iy = n.y + n.h / 2 - ih / 2;
      ctx.drawImage(icon, ix, iy, iw, ih);
      if (drawLabels) {
        const label = String(n.node.name || n.id);
        const fs = 10;
        ctx.font = `${fs}px system-ui, sans-serif`;
        ctx.fillStyle = "#1a1a1a";
        if (st.labelPosition === "top_left") {
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          const lx = n.x + n.w / 2 - iw / 2 - 2;
          const ly = iy - 2;
          ctx.fillText(label, lx, ly);
          const tw = ctx.measureText(label).width;
          ctx.strokeStyle = "#1a1a1a";
          ctx.lineWidth = 0.8 / Math.sqrt(vp.scale);
          ctx.beginPath();
          ctx.moveTo(lx, ly + 1.5);
          ctx.lineTo(lx + tw, ly + 1.5);
          ctx.stroke();
        } else {
          // "over": centred on the icon (document sheet / property chip)
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const maxW = iw - 10;
          let text = label;
          if (ctx.measureText(text).width > maxW) {
            while (text.length > 2 && ctx.measureText(text + "…").width > maxW)
              text = text.slice(0, -1);
            text += "…";
          }
          ctx.fillText(text, n.x + n.w / 2, iy + ih * 0.62);
        }
      }
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? ACCENT : isSel(n) ? "#5b9bf0" : "#a9c9f5";
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(ix - 3, iy - 3, iw + 6, ih + 6);
      }
      continue;
    }

    shapePath(ctx, st.shape, n.x, n.y, n.w, n.h);
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.strokeStyle = st.border;
    // thick coloured frame so US/USV/SF/… read like the historical EM icons
    ctx.lineWidth = st.borderWidth / Math.sqrt(vp.scale);
    ctx.setLineDash(
      st.borderStyle === "dashed"
        ? [5, 3]
        : st.borderStyle === "dotted"
          ? [2, 2]
          : [],
    );
    ctx.stroke();
    ctx.setLineDash([]);

    if (n.id === state.selectedId || n.instanceOf === state.selectedId || n.id === state.hoverId) {
      shapePath(ctx, st.shape, n.x - 2, n.y - 2, n.w + 4, n.h + 4);
      ctx.strokeStyle = n.id === state.selectedId || n.instanceOf === state.selectedId ? ACCENT : "#7fb0f0";
      ctx.lineWidth = 2.2 / vp.scale;
      ctx.stroke();
    }

    if (drawLabels) {
      const label = String(n.node.name || n.id);
      const fs = Math.min(11, n.h * 0.42);
      ctx.font = `${fs}px system-ui, sans-serif`;
      ctx.fillStyle = st.textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const maxW = n.w - 8;
      let text = label;
      if (ctx.measureText(text).width > maxW) {
        while (text.length > 2 && ctx.measureText(text + "…").width > maxW)
          text = text.slice(0, -1);
        text += "…";
      }
      ctx.fillText(text, n.x + n.w / 2, n.y + n.h / 2);
    }

    // folded-group badge (count of hidden nodes)
    if (n.badge) {
      const r = 9 / Math.sqrt(vp.scale);
      const bx = n.x + n.w;
      const by = n.y;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `${r * 1.1}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n.badge), bx, by + r * 0.05);
    }
  }

  // connect handles: a bullet on the right edge of EVERY node (drag it to
  // draw an edge, or drop in the void to create a target node). Shown on all
  // nodes once zoomed in enough to be legible; only the hovered/selected node
  // keeps its accent bullet at low zoom so the overview stays uncluttered.
  if (state.editable && !state.connect) {
    const active = state.hoverId ?? state.selectedId;
    const showAll = vp.scale > 0.5;
    for (const n of scene.nodes) {
      const isActive = n.id === active;
      if (!isActive && !showAll) continue;
      const r = (isActive ? 5.5 : 4) / Math.sqrt(vp.scale);
      ctx.beginPath();
      ctx.arc(n.x + n.w, n.y + n.h / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = isActive ? ACCENT : "#9aa7b5";
      ctx.lineWidth = (isActive ? 2 : 1.3) / Math.sqrt(vp.scale);
      ctx.stroke();
    }
  }
  // pinned badge: a small lock at the top-right corner of every locked node
  for (const n of scene.nodes) {
    if (!n.pinned) continue;
    const s = 12 / vp.scale;
    ctx.font = `${s}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔒", n.x + n.w - s * 0.35, n.y + s * 0.35);
  }

  if (state.connect) {
    const from = scene.byId.get(state.connect.fromId);
    if (from) {
      const colors = {
        valid: "#1a7f37",
        generic: "#8a939e",
        invalid: "#c93c37",
      } as const;
      const c = state.connect.validity
        ? colors[state.connect.validity]
        : "#8a939e";
      ctx.strokeStyle = c;
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 4 / vp.scale]);
      ctx.beginPath();
      ctx.moveTo(from.x + from.w, from.y + from.h / 2);
      ctx.lineTo(state.connect.x, state.connect.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const t = state.connect.targetId
        ? scene.byId.get(state.connect.targetId)
        : null;
      if (t) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 3 / vp.scale;
        shapePath(ctx, nodeStyle(t.node.node_type).shape, t.x - 3, t.y - 3, t.w + 6, t.h + 6);
        ctx.stroke();
      }
    }
  }

  // lane colour rail + label chip, pinned to the left edge (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const RAIL = 6; // strong colour rail width (px) on the first pixels of a lane
  // "PD" tag: a small clickable badge for an epoch/phase temporal PDG, drawn in
  // the label chip instead of a box. Registers its screen rect for click-to-enter.
  pdTagHits = [];
  addPhaseHits = [];
  const PD_TAG_W = 22;
  const PD_TAG_H = 14;
  const drawPdTag = (x: number, y: number, pdgId: string): void => {
    ctx.save();
    ctx.fillStyle = GROUP_HEADER_FILL; // paradata group colour (yEd folder tab)
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.lineWidth = 1;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, PD_TAG_W, PD_TAG_H, 3);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, PD_TAG_W, PD_TAG_H);
      ctx.strokeRect(x, y, PD_TAG_W, PD_TAG_H);
    }
    ctx.fillStyle = "#5a4522";
    ctx.font = "700 9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PD", x + PD_TAG_W / 2, y + PD_TAG_H / 2 + 0.5);
    ctx.restore();
    pdTagHits.push({ pdgId, x, y, w: PD_TAG_W, h: PD_TAG_H });
  };
  // amber warning triangle (chronology-coherence conflict), centred at (x, cy)
  const WARN_W = 13;
  const drawWarn = (x: number, cy: number): void => {
    ctx.save();
    const h = 11;
    ctx.beginPath();
    ctx.moveTo(x + WARN_W / 2, cy - h / 2);
    ctx.lineTo(x + WARN_W, cy + h / 2);
    ctx.lineTo(x, cy + h / 2);
    ctx.closePath();
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#3a2a00";
    ctx.font = "700 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x + WARN_W / 2, cy + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.restore();
  };
  for (const lane of scene.lanes) {
    const sy = lane.y * vp.scale + vp.y;
    const sh = lane.height * vp.scale;
    if (sy + sh < 0 || sy > viewH) continue;
    // strong epoch colour on the left edge of the lane
    if (lane.color) {
      const y0 = Math.max(sy, 0);
      const y1 = Math.min(sy + sh, viewH);
      ctx.fillStyle = lane.color;
      ctx.fillRect(0, y0, RAIL, y1 - y0);
    }
    if (sh < 18) continue; // lane too thin on screen — the chip would overlap
    const ty = Math.max(sy + 4, 4);
    // start–end collapses out when the lane is too short to fit two lines
    const boundsText =
      lane.start || lane.end ? `${lane.start ?? "?"} – ${lane.end ?? "?"}` : "";
    const showBounds = !!boundsText && sh > 36;
    const dot = lane.color ? 12 : 0;
    ctx.font = "600 12px system-ui, sans-serif";
    const nameW = ctx.measureText(lane.label).width;
    ctx.font = "10px system-ui, sans-serif";
    const boundsW = showBounds ? ctx.measureText(boundsText).width : 0;
    const gap = dot ? 6 : 0;
    const hasPd = !!lane.paradataGroupId;
    const tagSpace = hasPd ? PD_TAG_W + 6 : 0;
    const hasWarn = !!lane.warn;
    const warnSpace = hasWarn ? WARN_W + 4 : 0;
    const chipX = RAIL + 4;
    const chipW =
      8 + dot + gap + Math.max(nameW, boundsW) + warnSpace + tagSpace + 8;
    const chipH = showBounds ? 32 : 18;
    const selectedLane = lane.id === state.selectedId;
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(chipX, ty - 2, chipW, chipH, 5);
      ctx.fill();
      if (selectedLane) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = ACCENT;
        ctx.stroke();
      }
    } else {
      ctx.fillRect(chipX, ty - 2, chipW, chipH);
      if (selectedLane) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = ACCENT;
        ctx.strokeRect(chipX, ty - 2, chipW, chipH);
      }
    }
    const textX = chipX + 8 + dot + gap;
    if (dot) {
      const cx = chipX + 8 + dot / 2;
      const cy = ty - 2 + (showBounds ? 10 : 9);
      ctx.beginPath();
      ctx.arc(cx, cy, dot / 2, 0, Math.PI * 2);
      ctx.fillStyle = lane.color!;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.stroke();
    }
    ctx.fillStyle = "#2c4a6e";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillText(lane.label, textX, ty);
    if (showBounds) {
      ctx.fillStyle = "#6b7785";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(boundsText, textX, ty + 15);
    }
    if (hasWarn) drawWarn(textX + nameW + 4, ty + 6);
    if (hasPd)
      drawPdTag(chipX + chipW - PD_TAG_W - 6, ty - 1, lane.paradataGroupId!);
    // "+" quick-add-phase button: a small circle in the epoch's colour hanging
    // off the coloured rail just below the name chip. Lanes ARE top-level epochs
    // (phases don't render as lanes), so this only ever adds a phase to an epoch.
    const addR = 7;
    const addCx = RAIL + 14;
    const addCy = ty - 2 + chipH + 12;
    const ecol = lane.color || "#94a3b8";
    ctx.strokeStyle = ecol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(RAIL, addCy);
    ctx.lineTo(addCx - addR, addCy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(addCx, addCy, addR, 0, Math.PI * 2);
    ctx.fillStyle = ecol;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.stroke();
    ctx.strokeStyle = "#2c4a6e";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(addCx - 3.2, addCy);
    ctx.lineTo(addCx + 3.2, addCy);
    ctx.moveTo(addCx, addCy - 3.2);
    ctx.lineTo(addCx, addCy + 3.2);
    ctx.stroke();
    addPhaseHits.push({ id: lane.id, cx: addCx, cy: addCy, r: addR + 2 });
  }

  // phase sub-band labels: a small indented chip (colour dot + name) at each
  // band's top-left; the band flush with the lane top is pushed below the lane
  // chip so the two don't collide
  if (scene.subBands?.length) {
    bandLabelHits = [];
    for (const sb of scene.subBands) {
      const sy = sb.y * vp.scale + vp.y;
      const sh = sb.height * vp.scale;
      if (sy + sh < 0 || sy > viewH || sh < 14) continue;
      // nesting rail: a vertical colour bar indented by depth, echoing the
      // lane's own left rail so a sub-phase reads as contained at a glance.
      // Skip the residual band — that IS the epoch, already marked by the lane
      // rail; drawing another bar there would just double it.
      if (!sb.residual && sb.color) {
        const railX = RAIL + (sb.depth ?? 0) * 16;
        const y0 = Math.max(sy, 0);
        const y1 = Math.min(sy + sh, viewH);
        if (y1 > y0) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = sb.color;
          ctx.fillRect(railX, y0, 4, y1 - y0);
          ctx.restore();
        }
      }
      const ty = Math.max(sy + 3, 4);
      const dot = 9;
      // a phase band shows its start–end under the name (like the lane chip);
      // the residual band never does (it's the epoch, already on the lane chip)
      const hasBounds = !sb.residual && (sb.start != null || sb.end != null);
      const boundsText = hasBounds ? `${sb.start ?? "?"} – ${sb.end ?? "?"}` : "";
      ctx.font = "600 10px system-ui, sans-serif";
      const nameW = ctx.measureText(sb.label).width;
      ctx.font = "9px system-ui, sans-serif";
      const boundsW = hasBounds ? ctx.measureText(boundsText).width : 0;
      // indent deeper (sub-phase) bands so the hierarchy reads at a glance
      const chipX = RAIL + 14 + (sb.depth ?? 0) * 16;
      const hasPd = !!sb.paradataGroupId;
      const tagSpace = hasPd ? PD_TAG_W + 5 : 0;
      const hasWarn = !!sb.warn;
      const warnSpace = hasWarn ? WARN_W + 4 : 0;
      const chipW =
        7 + dot + 5 + Math.max(nameW, boundsW) + warnSpace + tagSpace + 8;
      const chipH = hasBounds ? 28 : 16;
      const selectedBand = sb.phaseId === state.selectedId;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(chipX, ty - 1, chipW, chipH, 4);
        ctx.fill();
        if (selectedBand) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = ACCENT;
          ctx.stroke();
        }
      } else {
        ctx.fillRect(chipX, ty - 1, chipW, chipH);
        if (selectedBand) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = ACCENT;
          ctx.strokeRect(chipX, ty - 1, chipW, chipH);
        }
      }
      const cx = chipX + 7 + dot / 2;
      const cy = ty - 1 + 8;
      ctx.beginPath();
      ctx.arc(cx, cy, dot / 2, 0, Math.PI * 2);
      ctx.fillStyle = sb.color || "#94a3b8";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.24)";
      ctx.stroke();
      ctx.fillStyle = sb.residual ? "#6b7785" : "#2c4a6e";
      ctx.font = sb.residual
        ? "italic 10px system-ui, sans-serif"
        : "600 10px system-ui, sans-serif";
      ctx.fillText(sb.label, chipX + 7 + dot + 5, ty);
      if (hasBounds) {
        ctx.fillStyle = "#6b7785";
        ctx.font = "9px system-ui, sans-serif";
        ctx.fillText(boundsText, chipX + 7 + dot + 5, ty + 13);
      }
      if (hasWarn) drawWarn(chipX + 7 + dot + 5 + nameW + 4, ty + 5);
      if (hasPd)
        drawPdTag(chipX + chipW - PD_TAG_W - 5, ty - 1, sb.paradataGroupId!);
      // the chip is a click target → select the phase (residual → the epoch)
      bandLabelHits.push({ id: sb.phaseId, x: chipX, y: ty - 1, w: chipW, h: chipH });
    }
  }
}
