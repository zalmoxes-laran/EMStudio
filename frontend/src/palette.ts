// Palette driven by s3Dgraphy's em_visual_rules.json — EMStudio never
// hardcodes the EM language (ARCHITECTURE.md §6). The asset is a verbatim
// copy of s3dgraphy/JSON_config/em_visual_rules.json; refresh it when the
// datamodel bumps.
import rules from "./assets/em_visual_rules.json";

export interface NodeStyle {
  shape: string;
  fill: string;
  border: string;
  borderStyle: "solid" | "dashed" | "dotted";
  textColor: string;
  /** label placement from the visual rules: "over" | "top_left" | "center" */
  labelPosition: string;
}

export interface EdgeStyle {
  color: string;
  dash: number[];
  width: number;
  label: string;
}

interface RawNodeStyle {
  label_position?: string;
  style?: {
    fill_color?: string;
    border_color?: string;
    border_style?: string;
    shape?: string;
  };
}

interface RawEdgeStyle {
  style?: { color?: string; line_style?: string; width?: number };
  label?: string;
}

// runtime node_type → visual-rules key (short names). Stratigraphic types
// (US, USVn, serSU…) match 1:1 and need no alias.
const NODE_ALIAS: Record<string, string> = {
  property: "PROP",
  combiner: "COMB",
  extractor: "EXT",
  document: "DOC",
  EpochNode: "EP",
  epoch: "EP",
  ActivityNodeGroup: "ANG",
  ParadataNodeGroup: "GRAPH",
  TimeBranchNodeGroup: "GRAPH",
  author: "AUTH",
  author_ai: "AUTH_AI",
  link: "LINK",
  geo_position: "GEO",
  semantic_shape: "SS",
  representation_model: "RM",
  representation_model_doc: "RMDoc",
  representation_model_sf: "RMSF",
  license: "LIC",
  embargo: "EMB",
  graph: "GRAPH",
};

const LINE_DASH: Record<string, number[]> = {
  solid: [],
  dashed: [7, 4],
  dotted: [2, 3],
  "dashed-dotted": [8, 3, 2, 3],
};

const nodeStyles = (rules as { node_styles: Record<string, RawNodeStyle> })
  .node_styles;
const edgeStyles = (rules as { edge_style: Record<string, RawEdgeStyle> })
  .edge_style;

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 1;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const nodeCache = new Map<string, NodeStyle>();

export function nodeStyle(nodeType?: string): NodeStyle {
  const key = nodeType ?? "unknown";
  const hit = nodeCache.get(key);
  if (hit) return hit;
  const rulesKey = NODE_ALIAS[key] ?? key;
  const raw = nodeStyles[rulesKey] ?? nodeStyles["unknown"];
  const s = raw?.style ?? {};
  const fill = s.fill_color ?? "#FFFFFF";
  const style: NodeStyle = {
    shape: s.shape ?? "rectangle",
    fill,
    border: s.border_color ?? "#333333",
    borderStyle: (s.border_style as NodeStyle["borderStyle"]) ?? "solid",
    textColor: luminance(fill) > 0.45 ? "#1a1a1a" : "#f5f5f5",
    labelPosition: raw?.label_position ?? "over",
  };
  nodeCache.set(key, style);
  return style;
}

// Edge types missing from the datamodel get quiet structural defaults;
// is_after is the stratigraphic sequence and stays prominent.
const EDGE_FALLBACK: Record<string, EdgeStyle> = {
  is_after: { color: "#2b2b2b", dash: [], width: 1.6, label: "Is After" },
  is_in_paradata_nodegroup: {
    color: "#c9a86a",
    dash: [3, 3],
    width: 1,
    label: "In Paradata Group",
  },
  has_paradata_nodegroup: {
    color: "#c9a86a",
    dash: [3, 3],
    width: 1,
    label: "Has Paradata Group",
  },
  is_part_of: { color: "#9aa7b5", dash: [5, 3], width: 1, label: "Part Of" },
  extracted_from: {
    color: "#5a7fb5",
    dash: [4, 3],
    width: 1,
    label: "Extracted From",
  },
  combines: { color: "#b5975a", dash: [4, 3], width: 1, label: "Combines" },
  has_property: {
    color: "#7a7a7a",
    dash: [4, 3],
    width: 1,
    label: "Has Property",
  },
  has_linked_resource: {
    color: "#cc7832",
    dash: [2, 3],
    width: 1,
    label: "Linked Resource",
  },
};

const edgeCache = new Map<string, EdgeStyle>();

export function edgeStyle(edgeType?: string): EdgeStyle {
  const key = edgeType ?? "generic";
  const hit = edgeCache.get(key);
  if (hit) return hit;
  const raw = edgeStyles?.[key];
  let style: EdgeStyle;
  if (raw?.style) {
    style = {
      color: raw.style.color ?? "#888888",
      dash: LINE_DASH[raw.style.line_style ?? "solid"] ?? [],
      width: (raw.style.width ?? 1.5) * 0.75,
      label: raw.label ?? key,
    };
  } else {
    style =
      EDGE_FALLBACK[key] ?? {
        color: "#999999",
        dash: [4, 3],
        width: 1,
        label: key,
      };
  }
  edgeCache.set(key, style);
  return style;
}

/** Edge types considered part of the stratigraphic backbone. */
export const SEQUENCE_EDGES = new Set([
  "is_after",
  "is_before",
  "changed_from",
  "has_same_time",
]);
