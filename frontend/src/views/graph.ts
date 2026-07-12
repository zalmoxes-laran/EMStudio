// Graph view: the full property graph (epochs as nodes, paradata chains,
// authors, resources). Deterministic client-side layered layout — a
// projection for inspection, not the archival layout (which belongs to
// em-core and the .em.json layout section).
import type { FoldedView } from "../folding";
import type { Scene, SceneNode } from "../scene";
import type { EmDocument, EmEdge, EmNode } from "../types";

const NODE_W = 120;
const NODE_H = 34;
const H_GAP = 26;
const V_GAP = 70;
const SWEEPS = 4;

export function layoutLayered(
  inputNodes: EmNode[],
  inputEdges: EmEdge[],
  badges?: Map<string, number>,
): Scene {
  const nodes = [...inputNodes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const ids = nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  // adjacency, deduped, self-loops dropped
  const out: number[][] = Array.from({ length: n }, () => []);
  const inn: number[][] = Array.from({ length: n }, () => []);
  const seen = new Set<string>();
  for (const e of inputEdges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a + ":" + b;
    if (seen.has(key)) continue;
    seen.add(key);
    out[a].push(b);
    inn[b].push(a);
  }

  // DAG-ify: DFS in deterministic order, skip back edges
  const color = new Uint8Array(n);
  const dagOut: number[][] = Array.from({ length: n }, () => []);
  const dfs = (u: number): void => {
    color[u] = 1;
    for (const v of out[u]) {
      if (color[v] === 1) continue;
      dagOut[u].push(v);
      if (color[v] === 0) dfs(v);
    }
    color[u] = 2;
  };
  for (let i = 0; i < n; i++) if (color[i] === 0) dfs(i);

  // longest-path layering
  const indeg = new Uint32Array(n);
  for (let u = 0; u < n; u++) for (const v of dagOut[u]) indeg[v]++;
  const layer = new Int32Array(n);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
    for (const v of dagOut[u]) {
      layer[v] = Math.max(layer[v], layer[u] + 1);
      if (--indeg[v] === 0) queue.push(v);
    }
  }

  const maxLayer = n ? Math.max(...layer) : 0;
  const rows: number[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (let i = 0; i < n; i++) rows[layer[i]].push(i);

  // barycenter ordering sweeps (deterministic: stable sort, id tiebreak)
  const pos = new Float64Array(n);
  const reindex = (): void =>
    rows.forEach((row) => row.forEach((node, i) => (pos[node] = i)));
  reindex();
  const bary = (row: number[], neigh: number[][]): void => {
    const score = row.map((v) => {
      const ns = neigh[v];
      if (!ns.length) return pos[v];
      return ns.reduce((s, w) => s + pos[w], 0) / ns.length;
    });
    const order = row
      .map((_, i) => i)
      .sort(
        (a, b) => score[a] - score[b] || (ids[row[a]] < ids[row[b]] ? -1 : 1),
      );
    const next = order.map((i) => row[i]);
    row.length = 0;
    row.push(...next);
  };
  for (let s = 0; s < SWEEPS; s++) {
    for (let r = 1; r < rows.length; r++) bary(rows[r], inn);
    reindex();
    for (let r = rows.length - 2; r >= 0; r--) bary(rows[r], out);
    reindex();
  }

  const scene: Scene = { nodes: [], byId: new Map(), edges: [], lanes: [] };
  rows.forEach((row, r) => {
    const rowW = row.length * (NODE_W + H_GAP) - H_GAP;
    row.forEach((v, i) => {
      const sn: SceneNode = {
        id: ids[v],
        x: i * (NODE_W + H_GAP) - rowW / 2,
        y: r * (NODE_H + V_GAP),
        w: NODE_W,
        h: NODE_H,
        node: nodes[v],
        badge: badges?.get(ids[v]),
      };
      scene.nodes.push(sn);
      scene.byId.set(sn.id, sn);
    });
  });

  for (const e of inputEdges) {
    if (scene.byId.has(e.source) && scene.byId.has(e.target)) {
      scene.edges.push({ source: e.source, target: e.target, edge: e });
    }
  }
  return scene;
}

export function buildGraphScene(doc: EmDocument, view?: FoldedView): Scene {
  return layoutLayered(
    view?.nodes ?? doc.graph.nodes,
    view?.edges ?? doc.graph.edges,
    view?.badges,
  );
}
