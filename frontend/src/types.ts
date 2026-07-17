// .em.json v1 shapes (draft spec: docs/emjson-v1-draft.md, normative home: s3Dgraphy)

export interface EmNode {
  id: string;
  name?: string;
  node_type: string;
  description?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface EmEdge {
  id?: string;
  source: string;
  target: string;
  edge_type?: string;
  [k: string]: unknown;
}

export interface EmGraph {
  graph_id?: string;
  nodes: EmNode[];
  edges: EmEdge[];
  [k: string]: unknown;
}

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Swimlane {
  epoch_id: string;
  y: number;
  height: number;
  order?: number;
}

export interface EmLayout {
  canvas?: { width: number; height: number };
  swimlanes?: Swimlane[];
  positions?: Record<string, LayoutRect>;
  folded_groups?: string[];
  group_spaces?: Record<string, Record<string, LayoutRect>>;
  /** node ids pinned in place — the layout engine keeps them at their Rect */
  pinned?: string[];
  /** rule pins: a node placed at a corner of a container (epoch/group) + offset */
  anchors?: LayoutAnchor[];
  [k: string]: unknown;
}

export interface LayoutAnchor {
  node: string;
  /** container id — an epoch (its lane content) or a group node */
  to: string;
  /** "bl" | "tl" | "br" | "tr" (default "bl") */
  corner?: string;
  dx?: number;
  dy?: number;
}

export interface EmDocument {
  header?: Record<string, unknown>;
  graph: EmGraph;
  layout?: EmLayout;
}

export type ViewKind = "matrix" | "graph";
