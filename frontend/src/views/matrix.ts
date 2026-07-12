// Matrix view: the Extended Matrix swimlane projection. Geometry comes from
// the .em.json layout section (em-cli `layout`); folding is applied as a
// view-state projection before building the scene.
import type { FoldedView } from "../folding";
import type { Scene } from "../scene";
import type { EmDocument } from "../types";

export function buildMatrixScene(
  doc: EmDocument,
  view?: FoldedView,
): Scene | null {
  const layout = doc.layout;
  const positions = layout?.positions;
  if (!layout || !positions || !Object.keys(positions).length) return null;

  const nodes = view?.nodes ?? doc.graph.nodes;
  const edges = view?.edges ?? doc.graph.edges;
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

  for (const node of nodes) {
    const r = positions[node.id];
    if (!r) continue;
    const sn = {
      id: node.id,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      node,
      badge: view?.badges.get(node.id),
    };
    scene.nodes.push(sn);
    scene.byId.set(node.id, sn);
  }

  for (const e of edges) {
    if (scene.byId.has(e.source) && scene.byId.has(e.target)) {
      scene.edges.push({ source: e.source, target: e.target, edge: e });
    }
  }
  return scene;
}
