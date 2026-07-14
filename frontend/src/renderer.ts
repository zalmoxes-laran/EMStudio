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

const LANE_COLORS = ["#EDF3FA", "#F7FAFD"];
const ACCENT = "#1F6FEB";
const GROUP_HEADER_FILL = "#F6D7A4"; // yEd folder tab (paradata groups)
const GROUP_BODY_FILL = "rgba(190,196,204,0.25)";

/** header tint from the group type's own colour (em_visual_rules border) */
function headerFillFor(nodeType: string, border: string): string {
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

  // epoch swimlanes
  scene.lanes.forEach((lane, i) => {
    ctx.fillStyle = LANE_COLORS[i % 2];
    ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
    ctx.strokeStyle = "#D5E0EC";
    ctx.lineWidth = 1 / vp.scale;
    ctx.beginPath();
    ctx.moveTo(worldLeft, lane.y);
    ctx.lineTo(worldRight, lane.y);
    ctx.stroke();
  });

  // edges (below nodes); incident edges of hover/selection get an accent pass
  const focusId = state.hoverId ?? state.selectedId;
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
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = e.edge.edge_type === "is_after" ? 0.85 : 0.45;
    ctx.lineWidth = st.width / Math.sqrt(vp.scale);
    ctx.setLineDash(st.dash.map((d) => d / Math.sqrt(vp.scale)));
    ctx.beginPath();
    traceRoute(ctx, routes[i], bridgeR);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      drawArrowhead(ctx, routes[i], arrowSize, st.color);
  }
  for (const i of accent) {
    const e = scene.edges[i];
    const st = edgeStyle(e.edge.edge_type);
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = (st.width * 2) / Math.sqrt(vp.scale);
    ctx.setLineDash(st.dash.map((d) => d / Math.sqrt(vp.scale)));
    ctx.beginPath();
    traceRoute(ctx, routes[i], bridgeR);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      drawArrowhead(ctx, routes[i], arrowSize * 1.4, st.color);
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

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
        headerFillFor(n.node.node_type, st.border),
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

  // connect handle on hovered/selected node + elastic edge while dragging
  if (state.editable) {
    const handleOn = state.connect
      ? null
      : (state.hoverId ?? state.selectedId);
    const hn = handleOn ? scene.byId.get(handleOn) : null;
    if (hn) {
      const r = 5.5 / Math.sqrt(vp.scale);
      ctx.beginPath();
      ctx.arc(hn.x + hn.w, hn.y + hn.h / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2 / Math.sqrt(vp.scale);
      ctx.stroke();
    }
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

  // lane labels pinned to the left edge (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const lane of scene.lanes) {
    const sy = lane.y * vp.scale + vp.y;
    const sh = lane.height * vp.scale;
    if (sy + sh < 0 || sy > viewH) continue;
    if (sh < 18) continue; // lane too thin on screen — labels would overlap
    const ty = Math.max(sy + 4, 4);
    const tw = ctx.measureText(lane.label).width;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillRect(6, ty - 2, tw + 10, 18);
    ctx.fillStyle = "#2c4a6e";
    ctx.fillText(lane.label, 11, ty);
  }
}
