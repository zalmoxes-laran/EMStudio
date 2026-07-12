// Single canvas renderer serving both projections (matrix and graph view):
// one hit-testing model, one style system, styles driven by the EM palette
// metadata (palette.ts ← em_visual_rules.json).
import { edgeStyle, nodeStyle } from "./palette";
import type { Scene, SceneNode, Viewport } from "./scene";

export interface RenderState {
  hoverId: string | null;
  selectedId: string | null;
  /** edge_type predicate; edges failing it are skipped */
  edgeVisible: (edgeType: string | undefined) => boolean;
}

const LANE_COLORS = ["#EDF3FA", "#F7FAFD"];
const ACCENT = "#1F6FEB";

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

function edgeAnchors(
  a: SceneNode,
  b: SceneNode,
): [number, number, number, number] {
  const acx = a.x + a.w / 2,
    acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2,
    bcy = b.y + b.h / 2;
  const dx = bcx - acx,
    dy = bcy - acy;
  if (Math.abs(dy) * 1.3 > Math.abs(dx)) {
    // predominantly vertical: bottom → top
    return dy > 0
      ? [acx, a.y + a.h, bcx, b.y]
      : [acx, a.y, bcx, b.y + b.h];
  }
  // predominantly horizontal: side midpoints
  return dx > 0
    ? [a.x + a.w, acy, b.x, bcy]
    : [a.x, acy, b.x + b.w, bcy];
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
  const accentEdges: typeof scene.edges = [];
  for (const e of scene.edges) {
    if (!state.edgeVisible(e.edge.edge_type)) continue;
    const a = scene.byId.get(e.source);
    const b = scene.byId.get(e.target);
    if (!a || !b) continue;
    if (focusId && (e.source === focusId || e.target === focusId)) {
      accentEdges.push(e);
      continue;
    }
    const st = edgeStyle(e.edge.edge_type);
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = e.edge.edge_type === "is_after" ? 0.8 : 0.38;
    ctx.lineWidth = st.width / Math.sqrt(vp.scale);
    ctx.setLineDash(st.dash.map((d) => d / Math.sqrt(vp.scale)));
    const [x1, y1, x2, y2] = edgeAnchors(a, b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  for (const e of accentEdges) {
    const a = scene.byId.get(e.source)!;
    const b = scene.byId.get(e.target)!;
    const st = edgeStyle(e.edge.edge_type);
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = (st.width * 2) / Math.sqrt(vp.scale);
    ctx.setLineDash(st.dash.map((d) => d / Math.sqrt(vp.scale)));
    const [x1, y1, x2, y2] = edgeAnchors(a, b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // nodes
  const drawLabels = vp.scale > 0.35;
  for (const n of scene.nodes) {
    const st = nodeStyle(n.node.node_type);
    shapePath(ctx, st.shape, n.x, n.y, n.w, n.h);
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.strokeStyle = st.border;
    ctx.lineWidth = 1.1 / Math.sqrt(vp.scale);
    ctx.setLineDash(
      st.borderStyle === "dashed"
        ? [5, 3]
        : st.borderStyle === "dotted"
          ? [2, 2]
          : [],
    );
    ctx.stroke();
    ctx.setLineDash([]);

    if (n.id === state.selectedId || n.id === state.hoverId) {
      shapePath(ctx, st.shape, n.x - 2, n.y - 2, n.w + 4, n.h + 4);
      ctx.strokeStyle = n.id === state.selectedId ? ACCENT : "#7fb0f0";
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
