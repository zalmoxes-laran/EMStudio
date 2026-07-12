// SVG export of the current scene (phase 5): lanes, orthogonally routed
// edges with bridges and arrowheads, node shapes and labels. The output is
// a plain standalone SVG — printable to PDF from any viewer.
import { edgeStyle, nodeStyle } from "./palette";
import { routeScene, SYMMETRIC_EDGES, type EdgeRoute } from "./routing";
import { sceneBounds, type Scene, type SceneNode } from "./scene";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shapeSvg(n: SceneNode): string {
  const st = nodeStyle(n.node.node_type);
  const { x, y, w, h } = n;
  const attrs =
    `fill="${st.fill}" fill-opacity="0.92" stroke="${st.border}" stroke-width="1.1"` +
    (st.borderStyle === "dashed"
      ? ' stroke-dasharray="5 3"'
      : st.borderStyle === "dotted"
        ? ' stroke-dasharray="2 2"'
        : "");
  const poly = (pts: number[][]): string =>
    `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" ${attrs}/>`;
  switch (st.shape) {
    case "ellipse":
    case "circle":
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
    case "hexagon": {
      const c = Math.min(w * 0.2, h);
      return poly([
        [x + c, y],
        [x + w - c, y],
        [x + w, y + h / 2],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h / 2],
      ]);
    }
    case "parallelogram": {
      const k = w * 0.18;
      return poly([
        [x + k, y],
        [x + w, y],
        [x + w - k, y + h],
        [x, y + h],
      ]);
    }
    case "octagon": {
      const c = Math.min(w, h) * 0.29;
      return poly([
        [x + c, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h - c],
        [x, y + c],
      ]);
    }
    case "diamond":
      return poly([
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ]);
    case "triangle":
      return poly([
        [x + w / 2, y],
        [x + w, y + h],
        [x, y + h],
      ]);
    case "pentagon":
      return poly([
        [x + w / 2, y],
        [x + w, y + h * 0.4],
        [x + w * 0.8, y + h],
        [x + w * 0.2, y + h],
        [x, y + h * 0.4],
      ]);
    case "rectangle":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(6, h / 2)}" ${attrs}/>`;
  }
}

function routePath(r: EdgeRoute, bridgeR: number): string {
  const pts = r.pts;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let s = 0; s < pts.length - 1; s++) {
    const p = pts[s];
    const q = pts[s + 1];
    const xsOn = r.bridges[s] ?? [];
    if (!xsOn.length || Math.abs(p.y - q.y) > 0.5) {
      d += ` L ${q.x} ${q.y}`;
      continue;
    }
    const ltr = p.x <= q.x;
    for (const bx of xsOn) {
      if (ltr) {
        d += ` L ${bx - bridgeR} ${p.y} A ${bridgeR} ${bridgeR} 0 0 1 ${bx + bridgeR} ${p.y}`;
      } else {
        d += ` L ${bx + bridgeR} ${p.y} A ${bridgeR} ${bridgeR} 0 0 0 ${bx - bridgeR} ${p.y}`;
      }
    }
    d += ` L ${q.x} ${q.y}`;
  }
  return d;
}

function arrowSvg(r: EdgeRoute, size: number, color: string): string {
  const pts = r.pts;
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const p1 = [tip.x - ux * size - uy * size * 0.45, tip.y - uy * size + ux * size * 0.45];
  const p2 = [tip.x - ux * size + uy * size * 0.45, tip.y - uy * size - ux * size * 0.45];
  return `<polygon points="${tip.x},${tip.y} ${p1.join(",")} ${p2.join(",")}" fill="${color}"/>`;
}

export function sceneToSvg(
  scene: Scene,
  edgeVisible: (t: string | undefined) => boolean,
  title: string,
): string {
  const b = sceneBounds(scene);
  const pad = 30;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" font-family="system-ui, sans-serif">`,
  );
  parts.push(`<title>${esc(title)}</title>`);
  parts.push(
    `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" fill="#fbfcfe"/>`,
  );

  scene.lanes.forEach((lane, i) => {
    parts.push(
      `<rect x="${b.x - pad}" y="${lane.y}" width="${b.w + pad * 2}" height="${lane.height}" fill="${i % 2 ? "#F7FAFD" : "#EDF3FA"}"/>`,
    );
    parts.push(
      `<text x="${b.x - pad + 6}" y="${lane.y + 16}" font-size="13" fill="#2c4a6e">${esc(lane.label)}</text>`,
    );
  });

  const visible = scene.edges.map((e) => edgeVisible(e.edge.edge_type));
  const routes = routeScene(scene, visible);
  routes.forEach((r, i) => {
    if (!visible[i]) return;
    const e = scene.edges[i];
    const st = edgeStyle(e.edge.edge_type);
    const dash = st.dash.length ? ` stroke-dasharray="${st.dash.join(" ")}"` : "";
    const alpha = e.edge.edge_type === "is_after" ? 0.85 : 0.5;
    parts.push(
      `<path d="${routePath(r, 3.5)}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-opacity="${alpha}"${dash}/>`,
    );
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      parts.push(arrowSvg(r, 6, st.color));
  });

  for (const n of scene.nodes) {
    parts.push(shapeSvg(n));
    const st = nodeStyle(n.node.node_type);
    const label = esc(String(n.node.name || n.id).slice(0, 24));
    parts.push(
      `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2}" font-size="${Math.min(11, n.h * 0.42)}" fill="${st.textColor}" text-anchor="middle" dominant-baseline="central">${label}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}
