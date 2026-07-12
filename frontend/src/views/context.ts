// Group-context canvas (hypergraph navigation): an isolated space showing
// only the members of one group. Positions are per-context, persisted in
// layout.group_spaces[groupId]; members without a stored position get a
// deterministic layered layout as the starting arrangement.
import { buildMembership, groupMembers } from "../folding";
import type { Scene } from "../scene";
import type { EmDocument } from "../types";
import { layoutLayered } from "./graph";

export function buildGroupScene(doc: EmDocument, groupId: string): Scene {
  const membership = buildMembership(doc);
  const { nodes, edges } = groupMembers(doc, membership, groupId);
  const scene = layoutLayered(nodes, edges);
  const stored = doc.layout?.group_spaces?.[groupId];
  if (stored) {
    for (const sn of scene.nodes) {
      const r = stored[sn.id];
      if (r) {
        sn.x = r.x;
        sn.y = r.y;
        sn.w = r.w;
        sn.h = r.h;
      }
    }
  }
  return scene;
}
