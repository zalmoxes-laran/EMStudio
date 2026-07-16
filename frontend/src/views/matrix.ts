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
// an epoch's temporal ParadataNodeGroup renders as a tiny always-closed box
// tucked under the epoch name — really contained, so it barely grows the lane
const EPOCH_PDG_W = 86;
const EPOCH_PDG_H = 24;

/**
 * Groups whose members are RELOCATED into the box (grid). Empty since the
 * engine allocates a dedicated sub-band column slot to every nested group
 * (layout v3.1): all EM node groups are now outline containers around
 * engine-placed members. The relocate machinery stays for view-only spaces.
 */
export const CONTAINER_TYPES = new Set<string>([]);
/** groups drawn as an outline around their engine-placed members */
export const OUTLINE_TYPES = new Set([
  "ActivityNodeGroup",
  "ParadataNodeGroup",
  "TimeBranchNodeGroup",
  "LocationNodeGroup",
]);

export function buildMatrixScene(
  doc: EmDocument,
  view?: FoldedView,
  layoutOverride?: EmDocument["layout"],
): Scene | null {
  // A layoutOverride (a VIEW layout computed by em-core on the filtered
  // subgraph) recompacts the Matrix when detail-rings hide nodes, so hidden
  // nodes leave no gaps — the archival doc.layout is untouched (folding carried
  // over from it).
  const layout = layoutOverride
    ? { ...layoutOverride, folded_groups: doc.layout?.folded_groups }
    : doc.layout;
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

  // phases (sub-epochs) are EpochNodes too, so a full em-core relayout gives
  // them their own swimlane — but they must NOT appear as top-level lanes
  // (they render as lane sub-bands later). Drop phase lanes here.
  const phaseIds = new Set<string>();
  for (const e of doc.graph.edges)
    if (e.edge_type === "has_sub_epoch") phaseIds.add(e.target);
  for (const lane of [...(layout.swimlanes ?? [])].sort((a, b) => a.y - b.y)) {
    if (phaseIds.has(lane.epoch_id)) continue; // sub-epoch, not a top-level lane
    const epoch = nodeById.get(lane.epoch_id);
    const ed = (epoch?.data as Record<string, unknown> | undefined) ?? {};
    const ecolor = ed.color;
    const asText = (v: unknown): string | undefined =>
      v != null && v !== "" ? String(v) : undefined;
    scene.lanes.push({
      id: lane.epoch_id,
      label: epoch?.name ?? lane.epoch_id,
      y: lane.y,
      height: lane.height,
      color: typeof ecolor === "string" && ecolor ? ecolor : undefined,
      start: asText(ed.start_time),
      end: asText(ed.end_time),
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
    // outline containers: group-type nodes AND any stratigraphic node that
    // physically contains others. Containment follows the PRIMARY parent
    // (engine-consistent): a shared node lives in ONE box, its other
    // memberships stay visible as edges (yEd single-parent semantics).
    const hasMembers =
      (membership.childrenOf.get(node.id)?.filter((m) => m !== node.id)
        .length ?? 0) > 0;
    if (CONTAINER_TYPES.has(node.node_type)) {
      relocateIds.push(node.id);
    } else if (OUTLINE_TYPES.has(node.node_type) || hasMembers) {
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

  // ---- epoch paradata: an epoch-owned ParadataNodeGroup gets a CUSTOM rule —
  // a tiny, always-closed rounded box tucked under the epoch name (top-left of
  // the swimlane), with NO ± toggle: double-click enters it. Its members live
  // only in the group's isolated canvas, so it barely grows the lane.
  // ParadataNodeGroup ← EpochNode via has_paradata_nodegroup.
  const epochOfPdg = new Map<string, string>(); // pdgId → epochId
  for (const e of edges) {
    if (e.edge_type !== "has_paradata_nodegroup") continue;
    if (nodeById.get(e.source)?.node_type === "EpochNode")
      epochOfPdg.set(e.target, e.source);
  }
  const epochPdgIds = new Set<string>();
  if (epochOfPdg.size) {
    const laneById = new Map(scene.lanes.map((l) => [l.id, l]));
    let contentMinX = Infinity;
    for (const sn of scene.byId.values())
      if (!epochOfPdg.has(sn.id)) contentMinX = Math.min(contentMinX, sn.x);
    if (!Number.isFinite(contentMinX)) contentMinX = 0;
    const removed = new Set<string>();
    for (const [pdgId, epochId] of epochOfPdg) {
      const g = scene.byId.get(pdgId);
      const lane = laneById.get(epochId);
      if (!g || !lane) continue;
      epochPdgIds.add(pdgId);
      // closed: drop its members from the main scene (they render only inside
      // the group's isolated canvas)
      for (const m of membership.childrenOf.get(pdgId) ?? [])
        if (m !== pdgId && scene.byId.has(m)) removed.add(m);
      // compact box anchored to the lane's BOTTOM-LEFT edge; the dynamic
      // swimlane expansion below grows the lane so both the (top) epoch label
      // and this box fit without spilling out
      g.w = EPOCH_PDG_W;
      g.h = EPOCH_PDG_H;
      g.x = contentMinX;
      g.y = lane.y + lane.height - EPOCH_PDG_H - 2;
    }
    if (removed.size) {
      for (const id of removed) scene.byId.delete(id);
      scene.nodes = scene.nodes.filter((n) => !removed.has(n.id));
    }
  }

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

  // ---- EM 1.6 Master/Instance documents ----
  // The graph holds ONE document node (the GraphML importer dedupes the
  // yEd instances); the DRAWING re-instances it: one visual copy per usage
  // context (the paradata group of each extractor that references it),
  // with a corner decorator counting the uses. The master (thick border)
  // stays at its engine position; instances carry thin borders.
  const instanceByEdge = new Map<string, string>(); // edge key → instance id
  const instancesByGroup = new Map<string, SceneNode[]>();
  {
    const docUsages = new Map<string, { edgeKey: string; extractorId: string }[]>();
    for (const e of edges) {
      if (e.edge_type !== "extracted_from") continue;
      const doc = nodeById.get(e.target);
      if (!doc || doc.node_type !== "document") continue;
      if (!scene.byId.has(e.source) || !scene.byId.has(e.target)) continue;
      const key = e.id ?? `${e.source}→${e.target}`;
      if (!docUsages.has(e.target)) docUsages.set(e.target, []);
      docUsages.get(e.target)!.push({ edgeKey: key, extractorId: e.source });
    }
    for (const [docId, usages] of docUsages) {
      if (usages.length < 2) continue;
      const master = scene.byId.get(docId)!;
      master.useCount = usages.length;
      const masterCtx = membership.primaryOf.get(docId);
      let k = 0;
      for (const u of usages) {
        const ctx = membership.primaryOf.get(u.extractorId);
        // the master already serves its own context
        if (ctx !== undefined && ctx === masterCtx) continue;
        const ex = scene.byId.get(u.extractorId);
        if (!ex) continue;
        const inst: SceneNode = {
          id: `${docId}##${k++}`,
          x: ex.x + ex.w / 2 - master.w / 2,
          y: ex.y + ex.h + 26,
          w: master.w,
          h: master.h,
          node: master.node,
          instanceOf: docId,
          useCount: usages.length,
        };
        scene.nodes.push(inst);
        scene.byId.set(inst.id, inst);
        instanceByEdge.set(u.edgeKey, inst.id);
        if (ctx) {
          if (!instancesByGroup.has(ctx)) instancesByGroup.set(ctx, []);
          instancesByGroup.get(ctx)!.push(inst);
        }
      }
    }
  }

  // ---- outline containers: box AROUND engine-placed members ----
  // computed BEFORE lane expansion so the expansion accounts for the boxes;
  // innermost groups first, so an activity's box wraps its PD boxes
  const groupDepth = (id: string): number => {
    let d = 0;
    let cur = id;
    const seen = new Set<string>();
    while (!seen.has(cur) && d < 10) {
      seen.add(cur);
      const parents = membership.groupsOf.get(cur);
      if (!parents?.length) break;
      cur = [...parents].sort()[0];
      d++;
    }
    return d;
  };
  outlineNodes.sort((a, b) => groupDepth(b.id) - groupDepth(a.id));
  const outlineMemberOf = new Map<string, string>();
  const emptyOutline = new Set<string>(); // childless groups drawn as small boxes
  for (const g of outlineNodes) {
    if (epochPdgIds.has(g.id)) {
      // custom epoch-paradata box: keep the compact size/pos set above, just
      // register it so the descriptor loop emits a SceneGroup for it
      emptyOutline.add(g.id);
      continue;
    }
    if (folded.has(g.id)) {
      g.w = CLOSED_W;
      g.h = CLOSED_H;
      continue;
    }
    const memberIds = (membership.childrenOf.get(g.id) ?? []).filter(
      (m) => m !== g.id && scene.byId.has(m),
    );
    // document instances drawn inside this group count as members
    for (const inst of instancesByGroup.get(g.id) ?? []) memberIds.push(inst.id);
    if (!memberIds.length) {
      // a freshly-created / childless group still renders as a small EMPTY
      // container box (dashed outline + coloured header) so it reads as a
      // group, not a stray node.
      g.w = Math.max(g.w, 150);
      g.h = GROUP_HEADER + 30;
      emptyOutline.add(g.id);
      continue;
    }
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
    // both directions: content may exceed the lane bottom (bottom delta)
    // AND poke above the lane top (group headers) — the lane grows both
    // ways so boxes never spill outside their swimlane
    const bottom = scene.lanes.map(() => 0);
    const top = scene.lanes.map(() => 0);
    for (const sn of scene.nodes) {
      const li = laneOf.get(sn.id)!;
      const lane = scene.lanes[li];
      const over = sn.y + sn.h + LANE_PAD - (lane.y + lane.height);
      if (over > 0) bottom[li] = Math.max(bottom[li], over);
      const above = lane.y + 8 - sn.y;
      if (above > 0) top[li] = Math.max(top[li], above);
    }
    let shift = 0;
    const prefix: number[] = [];
    for (let i = 0; i < scene.lanes.length; i++) {
      prefix.push(shift);
      scene.lanes[i].y += shift;
      scene.lanes[i].height += top[i] + bottom[i];
      shift += top[i] + bottom[i];
    }
    if (shift > 0 || top.some((t) => t > 0)) {
      for (const sn of scene.nodes) {
        const li = laneOf.get(sn.id)!;
        sn.y += prefix[li] + top[li];
      }
    }
  }

  // ---- container descriptors for the renderer ----
  for (const g of [...outlineNodes, ...containerNodes]) {
    if (
      OUTLINE_TYPES.has(g.node.node_type) &&
      !folded.has(g.id) &&
      ![...outlineMemberOf.values()].includes(g.id) &&
      !emptyOutline.has(g.id)
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
      epochParadata: epochPdgIds.has(g.id),
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
    // a document instance inside the group already expresses the secondary
    // membership — no need for the long edge to the master
    if (
      e.edge_type === "is_in_paradata_nodegroup" &&
      instancesByGroup.get(e.target)?.some((i) => i.instanceOf === e.source)
    )
      continue;
    // extracted_from usages rewire to their local instance
    const key = e.id ?? `${e.source}→${e.target}`;
    const instTarget = instanceByEdge.get(key);
    scene.edges.push({
      source: e.source,
      target: instTarget ?? e.target,
      edge: e,
    });
  }
  return scene;
}
