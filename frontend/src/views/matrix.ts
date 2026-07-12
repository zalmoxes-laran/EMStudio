// Matrix view: the Extended Matrix swimlane projection. Geometry comes from
// the .em.json layout section (em-cli `layout` / em-core WASM); folding is
// a view-state projection. Every EM node group is a yEd-style container:
//
//  * ParadataNodeGroup — "relocate" mode: members are pulled into a grid
//    inside the box (their canvas position is the box), swimlanes expand
//    dynamically when the box needs room;
//  * ActivityNodeGroup / TimeBranchNodeGroup / LocationNodeGroup —
//    "outline" mode: the layout engine already placed the members in a
//    contiguous band (layout v3), the box is drawn AROUND them without
//    moving anything.
import { buildMembership, type FoldedView } from "../folding";
import type { Scene, SceneGroup, SceneNode } from "../scene";
import type { EmDocument } from "../types";

export const GROUP_HEADER = 20;
export const GROUP_PAD = 12;
const CELL_GAP = 14;
const LANE_PAD = 14;
const CLOSED_W = 150;
const CLOSED_H = 40;

/** groups whose members are RELOCATED into the box (grid) */
export const CONTAINER_TYPES = new Set(["ParadataNodeGroup"]);
/** groups drawn as an outline around their engine-placed members */
export const OUTLINE_TYPES = new Set([
  "ActivityNodeGroup",
  "TimeBranchNodeGroup",
  "LocationNodeGroup",
]);

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
  const folded = new Set(layout.folded_groups ?? []);
  const membership = buildMembership(doc);

  const scene: Scene = {
    nodes: [],
    byId: new Map(),
    edges: [],
    lanes: [],
    groups: [],
    groupsById: new Map(),
    memberOf: new Map(),
  };

  for (const lane of [...(layout.swimlanes ?? [])].sort((a, b) => a.y - b.y)) {
    const epoch = nodeById.get(lane.epoch_id);
    scene.lanes.push({
      id: lane.epoch_id,
      label: epoch?.name ?? lane.epoch_id,
      y: lane.y,
      height: lane.height,
    });
  }

  // base placement from the stored layout
  const relocateIds: string[] = [];
  const outlineIds: string[] = [];
  const normal: SceneNode[] = [];
  for (const node of nodes) {
    // in the swimlane projection the epoch IS the lane — epochs render as
    // nodes only in graph view (E.D., 12 July 2026)
    if (node.node_type === "epoch" || node.node_type === "EpochNode") continue;
    const r = positions[node.id];
    if (!r) continue;
    const sn: SceneNode = {
      id: node.id,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      node,
      badge: view?.badges.get(node.id),
    };
    scene.byId.set(node.id, sn);
    if (CONTAINER_TYPES.has(node.node_type)) {
      relocateIds.push(node.id);
    } else if (OUTLINE_TYPES.has(node.node_type)) {
      outlineIds.push(node.id);
    } else {
      normal.push(sn);
    }
  }

  // containers first (drawn under their members): outlines are the
  // outermost boxes, then relocate boxes, then plain nodes
  const outlineNodes = outlineIds.map((id) => scene.byId.get(id)!);
  const containerNodes = relocateIds.map((id) => scene.byId.get(id)!);
  scene.nodes = [...outlineNodes, ...containerNodes, ...normal];

  // ---- container pass: relocate members inside open boxes ----
  const laneIdxOfY = (cy: number): number => {
    for (let i = 0; i < scene.lanes.length; i++) {
      const l = scene.lanes[i];
      if (cy >= l.y && cy < l.y + l.height) return i;
    }
    return scene.lanes.length - 1;
  };
  const laneOf = new Map<string, number>(); // node id → lane index

  for (const g of containerNodes) {
    if (folded.has(g.id)) {
      g.w = CLOSED_W;
      g.h = CLOSED_H;
      continue; // members are already hidden by the folding projection
    }
    const memberIds = (membership.membersOf.get(g.id) ?? []).filter((m) =>
      scene.byId.has(m),
    );
    if (!memberIds.length) continue;
    const space = layout.group_spaces?.[g.id] ?? {};
    const originX = g.x + GROUP_PAD;
    const originY = g.y + GROUP_HEADER + GROUP_PAD;

    // auto-grid defaults for members without a stored local position
    // (narrow grid: keeps the box inside its band, less outline overlap)
    const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(memberIds.length))));
    let gi = 0;
    let maxW = 0;
    let maxH = 0;
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      maxW = Math.max(maxW, sn.w);
      maxH = Math.max(maxH, sn.h);
    }
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      const local = space[m];
      if (local) {
        sn.x = originX + local.x;
        sn.y = originY + local.y;
      } else {
        sn.x = originX + (gi % cols) * (maxW + CELL_GAP);
        sn.y = originY + Math.floor(gi / cols) * (maxH + CELL_GAP);
        gi++;
      }
      scene.memberOf!.set(m, g.id);
    }
    // box from members' bbox
    let mx = Infinity,
      my = Infinity,
      Mx = -Infinity,
      My = -Infinity;
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      mx = Math.min(mx, sn.x);
      my = Math.min(my, sn.y);
      Mx = Math.max(Mx, sn.x + sn.w);
      My = Math.max(My, sn.y + sn.h);
    }
    g.w = Math.max(CLOSED_W, Mx - g.x + GROUP_PAD);
    g.h = Math.max(CLOSED_H + 20, My - g.y + GROUP_PAD);
    // members always share the group's lane for the expansion pass
    const gLane = laneIdxOfY(g.y + GROUP_HEADER / 2);
    laneOf.set(g.id, gLane);
    for (const m of memberIds) laneOf.set(m, gLane);
  }

  // ---- outline containers: box AROUND engine-placed members ----
  // computed BEFORE lane expansion so the expansion accounts for the boxes
  const outlineMemberOf = new Map<string, string>();
  for (const g of outlineNodes) {
    if (folded.has(g.id)) {
      g.w = CLOSED_W;
      g.h = CLOSED_H;
      continue;
    }
    const memberIds = (membership.membersOf.get(g.id) ?? []).filter(
      (m) => m !== g.id && scene.byId.has(m),
    );
    if (!memberIds.length) continue; // no visible members → plain node
    let mx = Infinity,
      my = Infinity,
      Mx = -Infinity,
      My = -Infinity;
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      mx = Math.min(mx, sn.x);
      my = Math.min(my, sn.y);
      Mx = Math.max(Mx, sn.x + sn.w);
      My = Math.max(My, sn.y + sn.h);
      outlineMemberOf.set(m, g.id);
    }
    g.x = mx - GROUP_PAD;
    g.y = my - GROUP_HEADER - 6;
    g.w = Mx - mx + GROUP_PAD * 2;
    g.h = My - g.y + GROUP_PAD;
  }

  // ---- dynamic swimlane expansion ----
  if (scene.lanes.length) {
    for (const sn of scene.nodes) {
      if (!laneOf.has(sn.id)) laneOf.set(sn.id, laneIdxOfY(sn.y + sn.h / 2));
    }
    const delta = scene.lanes.map(() => 0);
    for (const sn of scene.nodes) {
      const li = laneOf.get(sn.id)!;
      const lane = scene.lanes[li];
      const overflow = sn.y + sn.h + LANE_PAD - (lane.y + lane.height);
      if (overflow > 0) delta[li] = Math.max(delta[li], overflow);
    }
    let shift = 0;
    const prefix: number[] = [];
    for (let i = 0; i < scene.lanes.length; i++) {
      prefix.push(shift);
      scene.lanes[i].y += shift;
      scene.lanes[i].height += delta[i];
      shift += delta[i];
    }
    if (shift > 0) {
      for (const sn of scene.nodes) sn.y += prefix[laneOf.get(sn.id)!];
    }
  }

  // ---- container descriptors for the renderer ----
  for (const g of [...outlineNodes, ...containerNodes]) {
    if (
      OUTLINE_TYPES.has(g.node.node_type) &&
      !folded.has(g.id) &&
      ![...outlineMemberOf.values()].includes(g.id)
    )
      continue; // outline group without visible members: plain node
    const sg: SceneGroup = {
      id: g.id,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      headerH: GROUP_HEADER,
      title: String(g.node.name || g.id),
      folded: folded.has(g.id),
    };
    scene.groups!.push(sg);
    scene.groupsById!.set(g.id, sg);
  }

  for (const e of edges) {
    if (!scene.byId.has(e.source) || !scene.byId.has(e.target)) continue;
    // containment already expresses membership: hide the member→own-container
    // edge when the container is drawn open (yEd semantics)
    if (
      scene.memberOf!.get(e.source) === e.target ||
      scene.memberOf!.get(e.target) === e.source ||
      outlineMemberOf.get(e.source) === e.target ||
      outlineMemberOf.get(e.target) === e.source
    )
      continue;
    scene.edges.push({ source: e.source, target: e.target, edge: e });
  }
  return scene;
}
