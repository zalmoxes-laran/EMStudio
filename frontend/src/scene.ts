import type { EmEdge, EmNode } from "./types";

export interface SceneNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: EmNode;
  /** number of hidden nodes this (folded group) node stands for */
  badge?: number;
  /**
   * EM 1.6 Master/Instance documents: a visual instance of a document node
   * (the graph holds ONE node; the drawing repeats it per usage context).
   * Points to the real node id — selection resolves to it.
   */
  instanceOf?: string;
  /** how many times this document is used in the scene (corner decorator) */
  useCount?: number;
  /** position is pinned (locked) — the renderer shows a small lock badge */
  pinned?: boolean;
}

export interface SceneEdge {
  source: string;
  target: string;
  edge: EmEdge;
}

export interface Lane {
  id: string;
  label: string;
  y: number;
  height: number;
  /** the epoch's own colour (data.color, e.g. #CCFFCC) — tints the swimlane */
  color?: string;
  /** epoch temporal bounds (data.start_time / end_time), shown in the label */
  start?: string;
  end?: string;
  /** the epoch's temporal ParadataNodeGroup id, if any — drawn as a small "PD"
   *  tag in the lane label chip (click to enter the group) instead of a box */
  paradataGroupId?: string;
  /** chronology-coherence conflict → a warning marker next to the name */
  warn?: boolean;
}

/** Vertical gap (world units) stacked between adjacent phase sub-bands. The
 *  dashed separator is drawn centred in this gap, so matrix.ts (which lays the
 *  bands out) and renderer.ts (which draws the separator) MUST share it. */
export const BAND_GAP = 26;

/**
 * A phase (sub-epoch) sub-band inside an epoch swimlane. Emitted only when the
 * epoch's phases are toggled visible; the renderer draws a dashed separator at
 * the band's top edge (except the first) plus a small phase label. Geometry is
 * view-only — the document is untouched.
 */
export interface SubBand {
  /** parent epoch lane id */
  laneId: string;
  /** the phase EpochNode id, or the parent epoch id for the residual band */
  phaseId: string;
  label: string;
  color?: string;
  /** world-space top of the band */
  y: number;
  height: number;
  /** true for the epoch's own (un-phased) residual band */
  residual?: boolean;
  /** true for the topmost band of a lane (no separator above it) */
  first?: boolean;
  /** nesting depth: 0 = a top-level phase / the epoch residual, 1+ = sub-phase */
  depth?: number;
  /** the phase's temporal ParadataNodeGroup id, if any — drawn as a small "PD"
   *  tag in the band label chip (click to enter) instead of a box */
  paradataGroupId?: string;
  /** phase temporal bounds (data.start_time / end_time), shown under the name */
  start?: string;
  end?: string;
  /** chronology-coherence conflict → a warning marker next to the name */
  warn?: boolean;
}

/** yEd-style group container drawn on the canvas (open box or closed tab). */
export interface SceneGroup {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  headerH: number;
  title: string;
  folded: boolean;
}

export interface Scene {
  nodes: SceneNode[];
  byId: Map<string, SceneNode>;
  edges: SceneEdge[];
  lanes: Lane[];
  /** phase sub-bands inside epoch lanes (matrix view; when phases are shown) */
  subBands?: SubBand[];
  /** container groups (matrix view); the group node itself stays in nodes */
  groups?: SceneGroup[];
  groupsById?: Map<string, SceneGroup>;
  /** member id → container group id (open containers only) */
  memberOf?: Map<string, string>;
}

/** ± toggle button of a group container under a world-space point. */
export function hitGroupToggle(
  scene: Scene,
  wx: number,
  wy: number,
): SceneGroup | null {
  for (const g of scene.groups ?? []) {
    if (wx >= g.x + 3 && wx <= g.x + 19 && wy >= g.y + 3 && wy <= g.y + 19)
      return g;
  }
  return null;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function sceneBounds(scene: Scene): Bounds {
  if (!scene.nodes.length) return { x: 0, y: 0, w: 100, h: 100 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of scene.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  for (const l of scene.lanes) {
    minY = Math.min(minY, l.y);
    maxY = Math.max(maxY, l.y + l.height);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Pan/zoom transform between world (layout) and screen (CSS px) space. */
export class Viewport {
  x = 0; // screen-space translation
  y = 0;
  scale = 1;

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const next = Math.min(8, Math.max(0.02, this.scale * factor));
    const f = next / this.scale;
    this.x = sx - (sx - this.x) * f;
    this.y = sy - (sy - this.y) * f;
    this.scale = next;
  }

  fit(b: Bounds, viewW: number, viewH: number, pad = 40): void {
    const sw = (viewW - pad * 2) / Math.max(b.w, 1);
    const sh = (viewH - pad * 2) / Math.max(b.h, 1);
    // Very wide canvases (long EM matrices): fitting both axes makes nodes
    // microscopic — fit height instead and start at the left edge.
    if (b.w / Math.max(b.h, 1) > 4 * (viewW / Math.max(viewH, 1))) {
      this.scale = Math.min(2, Math.max(0.02, sh));
      this.x = pad - b.x * this.scale;
      this.y = (viewH - b.h * this.scale) / 2 - b.y * this.scale;
      return;
    }
    this.scale = Math.min(2, Math.max(0.02, Math.min(sw, sh)));
    this.x = (viewW - b.w * this.scale) / 2 - b.x * this.scale;
    this.y = (viewH - b.h * this.scale) / 2 - b.y * this.scale;
  }
}

/** Is a world-space point on a node's connect handle (right-edge circle)? */
export function hitHandle(
  n: SceneNode,
  wx: number,
  wy: number,
  scale: number,
): boolean {
  const r = 8 / Math.sqrt(scale); // slightly larger than drawn, easier to grab
  const dx = wx - (n.x + n.w);
  const dy = wy - (n.y + n.h / 2);
  return dx * dx + dy * dy <= r * r;
}

/** Topmost node under a world-space point (nodes drawn in array order). */
export function hitTest(scene: Scene, wx: number, wy: number): SceneNode | null {
  for (let i = scene.nodes.length - 1; i >= 0; i--) {
    const n = scene.nodes[i];
    if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n;
  }
  return null;
}
