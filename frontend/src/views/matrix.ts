// Matrix view: the Extended Matrix swimlane projection. Read-only phase 2/3 —
// geometry comes straight from the em-core layout section (em-cli `layout`).
import type { Scene } from "../scene";
import type { EmDocument } from "../types";

export function buildMatrixScene(doc: EmDocument): Scene | null {
  const layout = doc.layout;
  const positions = layout?.positions;
  if (!layout || !positions || !Object.keys(positions).length) return null;

  const nodeById = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const scene: Scene = { nodes: [], byId: new Map(), edges: [], lanes: [] };

  for (const lane of layout.swimlanes ?? []) {
    const epoch = nodeById.get(lane.epoch_id);
    scene.lanes.push({
      id: lane.epoch_id,
      label: epoch?.name ?? lane.epoch_id,
      y: lane.y,
      height: lane.height,
    });
  }

  for (const [id, r] of Object.entries(positions)) {
    const node = nodeById.get(id);
    if (!node) continue;
    const sn = { id, x: r.x, y: r.y, w: r.w, h: r.h, node };
    scene.nodes.push(sn);
    scene.byId.set(id, sn);
  }

  for (const e of doc.graph.edges) {
    if (scene.byId.has(e.source) && scene.byId.has(e.target)) {
      scene.edges.push({ source: e.source, target: e.target, edge: e });
    }
  }
  return scene;
}
