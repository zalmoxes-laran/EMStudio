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
import { BAND_GAP } from "../scene";
import type { Scene, SceneGroup, SceneNode, SubBand } from "../scene";
import type { EmDocument } from "../types";

export const GROUP_HEADER = 20;
export const GROUP_PAD = 12;
const CELL_GAP = 14;
const LANE_PAD = 14;
const CLOSED_W = 150;
const CLOSED_H = 40;

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
  /** epochs whose phases (sub-epochs) are shown as lane sub-bands. When an
   *  epoch is absent, its phases are hidden and all its units render in the
   *  single epoch lane. View-state only — never touches the document. */
  phasesVisible?: Set<string>,
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
  const pinnedSet = new Set(doc.layout?.pinned ?? []);
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

  // lane index of a world-y (used by the epoch-paradata anchoring below AND the
  // container/expansion passes), plus the node→lane map the expansion reads.
  const laneIdxOfY = (cy: number): number => {
    for (let i = 0; i < scene.lanes.length; i++) {
      const l = scene.lanes[i];
      if (cy >= l.y && cy < l.y + l.height) return i;
    }
    return scene.lanes.length - 1;
  };
  const laneOf = new Map<string, number>(); // node id → lane index

  // ---- epoch / phase temporal PDG → "PD" tag ------------------------------
  // An epoch's (or phase's) temporal ParadataNodeGroup is NOT drawn as a box on
  // the canvas; it is represented by a small "PD" tag in the lane / band label
  // chip (click to enter the group). So build the epoch/phase→PDG lookup (for
  // the tag + its click target) and HIDE the PDG nodes (group + members) from
  // the Matrix — they live behind the tag. The Graph view still shows them.
  const parentOfPhase = new Map<string, string>(); // phase → immediate parent
  for (const e of doc.graph.edges)
    if (e.edge_type === "has_sub_epoch") parentOfPhase.set(e.target, e.source);
  const topEpochOf = (id: string): string => {
    let cur = id;
    const seen = new Set<string>();
    while (parentOfPhase.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOfPhase.get(cur)!;
    }
    return cur;
  };
  // any EpochNode (top-level epoch OR phase) → its temporal PDG id
  const pdgOfEpochNode = new Map<string, string>();
  for (const e of doc.graph.edges)
    if (
      e.edge_type === "has_paradata_nodegroup" &&
      nodeById.get(e.source)?.node_type === "EpochNode"
    )
      pdgOfEpochNode.set(e.source, e.target);
  const pdgOfPhase = pdgOfEpochNode; // phases are EpochNodes too — same lookup
  const propsOfPdg = new Map<string, string[]>(); // PDG id → member ids
  for (const e of doc.graph.edges)
    if (e.edge_type === "is_in_paradata_nodegroup") {
      const arr = propsOfPdg.get(e.target);
      if (arr) arr.push(e.source);
      else propsOfPdg.set(e.target, [e.source]);
    }
  // PDG nodes (group + members) hidden from the Matrix — reached via the tag
  const hiddenEpochPdg = new Set<string>();
  for (const [, pdg] of pdgOfEpochNode) {
    hiddenEpochPdg.add(pdg);
    for (const p of propsOfPdg.get(pdg) ?? []) hiddenEpochPdg.add(p);
  }
  const allPhasePdgNodes = hiddenEpochPdg; // reflow skip (nodes aren't in scene)
  // give each lane its epoch's PDG id so the renderer draws the "PD" tag
  for (const lane of scene.lanes)
    lane.paradataGroupId = pdgOfEpochNode.get(lane.id);

  // base placement from the stored layout
  const relocateIds: string[] = [];
  const outlineIds: string[] = [];
  const normal: SceneNode[] = [];
  for (const node of nodes) {
    // in the swimlane projection the epoch IS the lane — epochs render as
    // nodes only in graph view (E.D., 12 July 2026)
    if (node.node_type === "epoch" || node.node_type === "EpochNode") continue;
    // epoch/phase temporal PDGs are represented by a "PD" tag in the label chip,
    // not a box — drop the group + its members here (Matrix-only; Graph keeps them)
    if (hiddenEpochPdg.has(node.id)) continue;
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
      pinned: pinnedSet.has(node.id),
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

  // ---- phase (sub-epoch) re-homing --------------------------------------
  // Phase lanes were dropped above (they never show as top-level lanes), but
  // their member units must still render inside the PARENT epoch's lane. We
  // assign those nodes the parent lane so the swimlane-expansion pass grows it
  // to hold them. Two sources, both robust to em-core's flat epoch ordering:
  //   1. EM attribution edges (has_first_epoch / survive_in_epoch) → phase;
  //   2. a geometric catch-all for anything em-core placed inside a dropped
  //      phase lane's rect (e.g. paradata that inherited the phase's lane).
  // `phasesVisible` (view state) will later split the lane into sub-bands
  // (Step B); when an epoch is hidden its units simply share the one lane.
  const showPhases = phasesVisible ?? new Set<string>();
  const laneIndexOf = new Map<string, number>();
  scene.lanes.forEach((l, i) => laneIndexOf.set(l.id, i));
  if (phaseIds.size) {
    // 1. membership-based
    for (const e of doc.graph.edges) {
      if (e.edge_type !== "has_first_epoch" && e.edge_type !== "survive_in_epoch")
        continue;
      if (!phaseIds.has(e.target)) continue;
      const li = laneIndexOf.get(topEpochOf(e.target));
      if (li != null && scene.byId.has(e.source)) laneOf.set(e.source, li);
    }
    // 2. geometric catch-all: nodes inside a dropped phase lane's rect
    const droppedPhaseRects: { y: number; h: number; li: number }[] = [];
    for (const lane of layout.swimlanes ?? []) {
      if (!phaseIds.has(lane.epoch_id)) continue;
      const li = laneIndexOf.get(topEpochOf(lane.epoch_id));
      if (li != null) droppedPhaseRects.push({ y: lane.y, h: lane.height, li });
    }
    for (const sn of scene.byId.values()) {
      if (laneOf.has(sn.id)) continue;
      const cy = sn.y + sn.h / 2;
      for (const r of droppedPhaseRects)
        if (cy >= r.y && cy < r.y + r.h) {
          laneOf.set(sn.id, r.li);
          break;
        }
    }
  }

  // ---- resolve rule anchors (view-side, compact) ----
  // layout.anchors carries the RULE: a node placed at a CORNER of a container
  // (epoch lane) + offset. em-core also resolves anchors (for headless/CLI and
  // portability, e.g. Heriverse), but the VIEW re-resolves against the COMPACT
  // scene: container content = nodes whose CENTRE falls in the lane's y-band
  // (position-based), so a node em-core scattered into another lane's rows
  // (attributed here but edge-pulled elsewhere) does NOT inflate this lane. That
  // keeps the epoch paradata box tight under its lane's real content instead of
  // trailing a far-flung outlier. laneOf is set so the re-stack sizes the lane.
  const anchorList = doc.layout?.anchors ?? [];
  if (anchorList.length) {
    const laneById = new Map(scene.lanes.map((l, i) => [l.id, i]));
    const anchoredIds = new Set(anchorList.map((a) => a.node));
    for (const a of anchorList) {
      const laneIdx = laneById.get(a.to);
      if (laneIdx == null) continue;
      const node = scene.byId.get(a.node);
      if (!node) continue;
      const lane = scene.lanes[laneIdx];
      let minx = Infinity;
      let miny = Infinity;
      let maxx = -Infinity;
      let maxy = -Infinity;
      for (const sn of scene.byId.values()) {
        if (anchoredIds.has(sn.id)) continue;
        const cy = sn.y + sn.h / 2;
        if (cy >= lane.y && cy < lane.y + lane.height) {
          minx = Math.min(minx, sn.x);
          miny = Math.min(miny, sn.y);
          maxx = Math.max(maxx, sn.x + sn.w);
          maxy = Math.max(maxy, sn.y + sn.h);
        }
      }
      if (!Number.isFinite(minx)) {
        minx = 0;
        maxx = 0;
        miny = lane.y;
        maxy = lane.y;
      }
      const corner = a.corner || "bl";
      node.x = (corner.includes("r") ? maxx : minx) + (a.dx ?? 0);
      node.y = (corner.includes("t") ? miny : maxy) + (a.dy ?? 0);
      laneOf.set(a.node, laneIdx);
    }
  }

  // ---- container pass: relocate members inside open boxes ----
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

  // ---- phase sub-band reflow ----
  // For each epoch whose phases are toggled visible, split its lane into
  // stacked sub-bands: one per phase (newest start on top), then the epoch's
  // own residual band at the bottom (only if it holds units). Each band is
  // translated as a RIGID unit — every node keeps its relative position, so
  // group containers stay intact and only cross-band edges stretch. A node's
  // band is the phase it (or its group root) is attributed to; unattributed
  // roots fall in the residual band.
  const subBands: SubBand[] = [];
  if (phaseIds.size && showPhases.size) {
    const laneOfNode = (sn: SceneNode): number =>
      laneOf.get(sn.id) ?? laneIdxOfY(sn.y + sn.h / 2);
    // node → the phase it is attributed to (first has_first_epoch / survive)
    const phaseOfNode = new Map<string, string>();
    for (const e of doc.graph.edges) {
      if (e.edge_type !== "has_first_epoch" && e.edge_type !== "survive_in_epoch")
        continue;
      if (phaseIds.has(e.target) && !phaseOfNode.has(e.source))
        phaseOfNode.set(e.source, e.target);
    }
    const rootOf = (id: string): string => {
      let cur = id;
      const seen = new Set<string>();
      while (membership.primaryOf.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const p = membership.primaryOf.get(cur)!;
        if (!scene.byId.has(p)) break;
        cur = p;
      }
      return cur;
    };
    const num = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : -Infinity;
    };
    for (let li = 0; li < scene.lanes.length; li++) {
      const lane = scene.lanes[li];
      if (!showPhases.has(lane.id)) continue;
      // build the band order over the WHOLE phase subtree (phases can nest):
      // depth-first, each level newest start_time on top, a node's own
      // (direct-member) band placed AFTER its sub-phases, and the epoch's
      // residual band last — so finer/newer periods sit above coarser ones.
      const childPhases = new Map<string, string[]>();
      for (const [ph, par] of parentOfPhase) {
        if (!childPhases.has(par)) childPhases.set(par, []);
        childPhases.get(par)!.push(ph);
      }
      const bandOrder: string[] = [];
      const bandDepth = new Map<string, number>();
      const collect = (id: string, depth: number): void => {
        const subs = (childPhases.get(id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              num(nodeById.get(b)?.data?.start_time) -
              num(nodeById.get(a)?.data?.start_time),
          );
        for (const s of subs) collect(s, depth + 1);
        bandOrder.push(id);
        bandDepth.set(id, depth);
      };
      collect(lane.id, 0);
      if (bandOrder.length <= 1) continue; // epoch has no phases
      const bandIndex = new Map(bandOrder.map((k, i) => [k, i]));
      // which sub-tree phase, if any, does a node resolve to?
      const phaseFor = (id: string): string | undefined => {
        // direct attribution wins
        const direct = phaseOfNode.get(id);
        if (direct && topEpochOf(direct) === lane.id) return direct;
        return undefined;
      };
      // gather this lane's nodes, grouped by root block
      const rootBand = new Map<string, number>(); // root id → band index
      const rootKids = new Map<string, SceneNode[]>();
      for (const sn of scene.nodes) {
        if (laneOfNode(sn) !== li) continue;
        // phase PDG boxes are placed separately below (at their band's
        // bottom-left) — keep them out of the content bbox / band tally
        if (allPhasePdgNodes.has(sn.id)) continue;
        const root = rootOf(sn.id);
        if (!rootKids.has(root)) rootKids.set(root, []);
        rootKids.get(root)!.push(sn);
      }
      // assign each root a band = majority phase among its subtree, else residual
      for (const [root, kids] of rootKids) {
        const tally = new Map<string, number>();
        for (const k of kids) {
          const ph = phaseFor(k.id);
          if (ph) tally.set(ph, (tally.get(ph) ?? 0) + 1);
        }
        let best: string | undefined;
        let bestN = 0;
        for (const [ph, n] of tally)
          if (n > bestN) {
            best = ph;
            bestN = n;
          }
        rootBand.set(root, bandIndex.get(best ?? lane.id) ?? bandOrder.length - 1);
      }
      // per-band bbox (over all member nodes) at current positions
      const bMinX = bandOrder.map(() => Infinity);
      const bMinY = bandOrder.map(() => Infinity);
      const bMaxY = bandOrder.map(() => -Infinity);
      const nodeBand = new Map<string, number>();
      for (const [root, kids] of rootKids) {
        const bi = rootBand.get(root)!;
        for (const sn of kids) {
          nodeBand.set(sn.id, bi);
          bMinX[bi] = Math.min(bMinX[bi], sn.x);
          bMinY[bi] = Math.min(bMinY[bi], sn.y);
          bMaxY[bi] = Math.max(bMaxY[bi], sn.y + sn.h);
        }
      }
      // ---- place each phase's temporal PDG box in its own band --------------
      // A phase has no lane, so its box goes at the phase band's content
      // bottom-left (mirroring the epoch PDG at the lane bottom-left) and is
      // folded into the band bbox so the stacking below reserves room and grows
      // the band. A phase whose direct-member band is empty (only sub-phases
      // hold units) still shows its box as a thin PDG-only band, so the
      // chronology stays reachable and never floats loose.
      let laneContentMinX = Infinity;
      for (const v of bMinX) if (Number.isFinite(v)) laneContentMinX = Math.min(laneContentMinX, v);
      if (!Number.isFinite(laneContentMinX)) laneContentMinX = 40;
      const PDG_GAP = 8;
      for (let bi = 0; bi < bandOrder.length; bi++) {
        const key = bandOrder[bi];
        if (key === lane.id) continue; // residual band: the epoch's own PDG box
        const pdgId = pdgOfPhase.get(key);
        if (!pdgId) continue;
        const grp = scene.byId.get(pdgId);
        if (!grp) continue; // bands off / filtered → not in the scene
        const props = (propsOfPdg.get(pdgId) ?? [])
          .map((p) => scene.byId.get(p))
          .filter((s): s is SceneNode => !!s);
        if (!props.length) continue;
        const hasContent = Number.isFinite(bMinY[bi]);
        // align every phase box at the LANE's left edge (like the epoch PDG),
        // not the band's own leftmost unit — the band spans the full width, so
        // a per-band minX would leave the boxes scattered mid-canvas
        const baseX = laneContentMinX;
        const contentBottom = hasContent ? bMaxY[bi] : 0;
        // props sit PDG_GAP below the content; the group box header clears it
        const baseY = contentBottom + PDG_GAP + GROUP_HEADER + 6;
        let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
        props.forEach((sn, s) => {
          sn.x = baseX + s * 100;
          sn.y = baseY;
          nodeBand.set(sn.id, bi);
          laneOf.set(sn.id, li);
          mx = Math.min(mx, sn.x);
          my = Math.min(my, sn.y);
          Mx = Math.max(Mx, sn.x + sn.w);
          My = Math.max(My, sn.y + sn.h);
        });
        // wrap the group box around the props (same maths as the outline pass)
        grp.x = mx - GROUP_PAD;
        grp.y = my - GROUP_HEADER - 6;
        grp.w = Mx - mx + GROUP_PAD * 2;
        grp.h = My - grp.y + GROUP_PAD;
        nodeBand.set(grp.id, bi);
        laneOf.set(grp.id, li);
        if (hasContent) {
          bMaxY[bi] = Math.max(bMaxY[bi], grp.y + grp.h);
        } else {
          // empty direct band → the box IS the band's content
          bMinY[bi] = grp.y;
          bMaxY[bi] = grp.y + grp.h;
        }
      }
      // stack the non-empty bands from the lane's top, translating each rigidly
      let cursor = lane.y;
      let firstBand = true;
      for (let bi = 0; bi < bandOrder.length; bi++) {
        if (!Number.isFinite(bMinY[bi])) continue; // empty band → skip
        const h = bMaxY[bi] - bMinY[bi];
        const delta = cursor - bMinY[bi];
        for (const [id, b] of nodeBand)
          if (b === bi) {
            const sn = scene.byId.get(id);
            if (sn) sn.y += delta;
          }
        const key = bandOrder[bi];
        const isResidual = key === lane.id;
        subBands.push({
          laneId: lane.id,
          phaseId: key,
          label: isResidual
            ? `${lane.label} (senza fase)`
            : (nodeById.get(key)?.name ?? key),
          color:
            typeof nodeById.get(key)?.data?.color === "string"
              ? (nodeById.get(key)!.data!.color as string)
              : lane.color,
          y: cursor,
          height: h,
          residual: isResidual,
          first: firstBand,
          depth: bandDepth.get(key) ?? 0,
          paradataGroupId: isResidual ? undefined : pdgOfPhase.get(key),
        });
        firstBand = false;
        cursor += h + BAND_GAP;
      }
    }
  }
  if (subBands.length) scene.subBands = subBands;

  // ---- dynamic swimlane re-stack ----
  // Re-flow the top-level lanes into a contiguous vertical stack. This both
  //  (a) grows a lane to fit content that overflows its em-core rect (group
  //      headers poking above, boxes / re-homed phase units below), and
  //  (b) closes the gaps left where phase lanes were dropped (a phase's
  //      em-core swimlane leaves an empty slot between top-level lanes).
  // Every node moves by a single constant delta for its lane, so intra-lane
  // layout and edge geometry are preserved.
  if (scene.lanes.length) {
    for (const sn of scene.nodes) {
      if (!laneOf.has(sn.id)) laneOf.set(sn.id, laneIdxOfY(sn.y + sn.h / 2));
    }
    const origY = scene.lanes.map((l) => l.y);
    const origH = scene.lanes.map((l) => l.height);
    // content overflow beyond each lane's original rect, both directions
    const bottom = scene.lanes.map(() => 0);
    const top = scene.lanes.map(() => 0);
    for (const sn of scene.nodes) {
      const li = laneOf.get(sn.id)!;
      const over = sn.y + sn.h + LANE_PAD - (origY[li] + origH[li]);
      if (over > 0) bottom[li] = Math.max(bottom[li], over);
      const above = origY[li] + 8 - sn.y;
      if (above > 0) top[li] = Math.max(top[li], above);
    }
    let cursor = origY[0] - top[0]; // keep the first lane roughly anchored
    const nodeShift = scene.lanes.map(() => 0);
    for (let i = 0; i < scene.lanes.length; i++) {
      const newY = cursor;
      const newH = origH[i] + top[i] + bottom[i];
      nodeShift[i] = newY + top[i] - origY[i];
      scene.lanes[i].y = newY;
      scene.lanes[i].height = newH;
      cursor = newY + newH;
    }
    for (const sn of scene.nodes) sn.y += nodeShift[laneOf.get(sn.id)!];
    // keep sub-band separators aligned with the nodes they bracket
    for (const sb of subBands) {
      const bi = laneIndexOf.get(sb.laneId);
      if (bi != null) sb.y += nodeShift[bi];
    }
  }

  // Re-wrap every ParadataNodeGroup box around its members' FINAL positions.
  // The band reflow + re-stack translate members rigidly, but a PDG box can be
  // left behind when its em-core anchor seeded it a position that maps to a
  // different lane than its props (the epoch PDG detaches in a banded lane
  // otherwise). Idempotent where the members did not move.
  for (const g of outlineNodes) {
    if (g.node.node_type !== "ParadataNodeGroup") continue;
    if (folded.has(g.id) || emptyOutline.has(g.id)) continue;
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity, any = false;
    for (const [m, gid] of outlineMemberOf) {
      if (gid !== g.id) continue;
      const sn = scene.byId.get(m);
      if (!sn) continue;
      any = true;
      mx = Math.min(mx, sn.x);
      my = Math.min(my, sn.y);
      Mx = Math.max(Mx, sn.x + sn.w);
      My = Math.max(My, sn.y + sn.h);
    }
    if (!any) continue;
    g.x = mx - GROUP_PAD;
    g.y = my - GROUP_HEADER - 6;
    g.w = Mx - mx + GROUP_PAD * 2;
    g.h = My - g.y + GROUP_PAD;
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
