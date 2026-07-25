// Node palette, generated from the EM visual rules + node class registry —
// the palette is data-driven, EMStudio never hardcodes the EM language.
// Icons are the official s3Dgraphy 2D assets (JSON_config/src/2D), inlined
// at build time; types without an official icon fall back to a drawn swatch.
import { nodeStyle } from "./palette";
import {
  dtcAuthoringKinds,
  hdtoAuthoringTypes,
  isGroupType,
  nodeLabel,
  typeDescription,
} from "./rules";

import { dtcGlyphUrl, iconUrlFor } from "./icons";

export interface Section {
  label: string;
  types: string[];
}

// Authoring surface, EM 1.5/1.6: stratigraphic units first, then series,
// paradata chain, groups, context/metadata nodes. Exported so the
// drag-to-connect "create node" menu offers the same taxonomy.
export const SECTIONS: Section[] = [
  {
    label: "Stratigraphic",
    types: ["US", "USVn", "USVs", "USD", "TSU", "USN", "SE", "BR"],
  },
  { label: "Special finds", types: ["SF", "VSF", "RSF"] },
  { label: "Series", types: ["serSU", "serUSVn", "serUSVs", "serUSD"] },
  {
    label: "Paradata",
    types: ["property", "extractor", "combiner", "document"],
  },
  {
    label: "Groups",
    types: [
      "ActivityNodeGroup",
      "ParadataNodeGroup",
      "TimeBranchNodeGroup",
      "LocationNodeGroup",
    ],
  },
  {
    label: "Context",
    types: ["EpochNode", "author", "author_ai", "link", "license", "embargo"],
  },
];

function swatch(nodeType: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = 26 * dpr;
  c.height = 16 * dpr;
  c.style.width = "26px";
  c.style.height = "16px";
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const st = nodeStyle(nodeType);
  // tiny generic swatch: rounded rect is fine at this size except for the
  // strongly-shaped types where the real silhouette reads better
  ctx.beginPath();
  switch (st.shape) {
    case "hexagon":
      ctx.moveTo(5, 1);
      ctx.lineTo(21, 1);
      ctx.lineTo(25, 8);
      ctx.lineTo(21, 15);
      ctx.lineTo(5, 15);
      ctx.lineTo(1, 8);
      ctx.closePath();
      break;
    case "octagon":
      ctx.moveTo(5, 1);
      ctx.lineTo(21, 1);
      ctx.lineTo(25, 5);
      ctx.lineTo(25, 11);
      ctx.lineTo(21, 15);
      ctx.lineTo(5, 15);
      ctx.lineTo(1, 11);
      ctx.lineTo(1, 5);
      ctx.closePath();
      break;
    case "ellipse":
    case "circle":
      ctx.ellipse(13, 8, 12, 7, 0, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(13, 1);
      ctx.lineTo(25, 8);
      ctx.lineTo(13, 15);
      ctx.lineTo(1, 8);
      ctx.closePath();
      break;
    case "parallelogram":
      ctx.moveTo(5, 1);
      ctx.lineTo(25, 1);
      ctx.lineTo(21, 15);
      ctx.lineTo(1, 15);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(13, 1);
      ctx.lineTo(25, 15);
      ctx.lineTo(1, 15);
      ctx.closePath();
      break;
    default:
      ctx.roundRect(1, 1, 24, 14, 3);
  }
  ctx.fillStyle = st.fill;
  ctx.fill();
  ctx.strokeStyle = st.border;
  // border weight tracks the visual-rules border_width (data-driven) so the
  // thick EM frame reads in the swatch too, clamped to this tiny 26×16 canvas.
  ctx.lineWidth = Math.min(2.4, Math.max(1.4, st.borderWidth * 0.6));
  if (st.borderStyle === "dashed") ctx.setLineDash([3, 2]);
  else if (st.borderStyle === "dotted") ctx.setLineDash([1.5, 1.5]);
  ctx.stroke();
  return c;
}

// NodeGroups (Activity/Paradata/TimeBranch/Location) are CONTAINERS, not
// node shapes — the generic swatch drew them as anonymous rectangles. Draw
// them as the canonical EM/yEd group box: a dashed coloured container with a
// title tab in the top-left corner. Colours come straight from the visual
// rules (never hardcoded): Activity=purple, Paradata/TimeBranch=grey,
// Location=black/light.
function groupSwatch(nodeType: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = 26 * dpr;
  c.height = 16 * dpr;
  c.style.width = "26px";
  c.style.height = "16px";
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const st = nodeStyle(nodeType);
  const x = 1.5,
    y = 2.5,
    w = 23,
    h = 12,
    r = 2.5;
  // container body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = st.fill;
  ctx.fill();
  ctx.strokeStyle = st.border;
  ctx.lineWidth = 1.4;
  ctx.setLineDash(st.borderStyle === "dotted" ? [1.5, 1.5] : [3, 2]);
  ctx.stroke();
  // title tab → the canonical group colour (em_visual_rules label_background:
  // Activity cyan, Paradata peach, TimeBranch green, Location light-grey);
  // falls back to the border colour if a group has no tab colour.
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.roundRect(x, y, 13, 4.5, [r, r, 0, 0]);
  ctx.fillStyle = st.labelBackground ?? st.border;
  ctx.fill();
  // thin outline on the tab so pale tabs stay visible on the white body
  ctx.lineWidth = 0.8;
  ctx.setLineDash([]);
  ctx.strokeStyle = st.border;
  ctx.stroke();
  return c;
}

export function buildPalette(
  root: HTMLElement,
  onPick: (nodeType: string, kind?: string) => void,
): { setActive: (activeKey: string | null) => void } {
  root.innerHTML = "";
  // keyed by a display key: node_type for plain items, `${nodeType}:${kind}` for
  // the DTC by-kind items (so several DTC items share a node_type without colliding).
  const buttons = new Map<string, HTMLButtonElement>();

  const makeItem = (
    t: string,
    parent: HTMLElement,
    opts?: {
      display?: string;
      iconUrl?: string | null;
      onClick?: () => void;
      key?: string;
    },
  ): void => {
    const b = document.createElement("button");
    b.className = "pal-item";
    b.title = typeDescription(t) || t;
    const iconUrl = opts?.iconUrl !== undefined ? opts.iconUrl : iconUrlFor(t);
    if (isGroupType(t)) {
      // groups render as canonical coloured container boxes, not swatches
      b.appendChild(groupSwatch(t));
    } else if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.className = "pal-icon";
      img.alt = t;
      b.appendChild(img);
    } else {
      b.appendChild(swatch(t));
    }
    const span = document.createElement("span");
    span.textContent = opts?.display ?? t;
    b.appendChild(span);
    b.addEventListener("click", opts?.onClick ?? (() => onPick(t)));
    parent.appendChild(b);
    buttons.set(opts?.key ?? t, b);
  };

  for (const section of SECTIONS) {
    const h = document.createElement("div");
    h.className = "pal-sect";
    h.textContent = section.label;
    root.appendChild(h);
    for (const t of section.types) makeItem(t, root);
  }

  // A gated, collapsed "advanced" section BELOW the stratigrapher palette (which
  // stays byte-unchanged). Mirrors the HDT-O gating.
  const gatedSection = (
    label: string,
    title: string,
    fill: (wrap: HTMLElement) => void,
  ): void => {
    const toggle = document.createElement("button");
    toggle.className = "pal-sect pal-sect-toggle";
    const wrap = document.createElement("div");
    let open = false;
    const paint = (): void => {
      toggle.textContent = `${open ? "▾" : "▸"} ${label}`;
      wrap.style.display = open ? "" : "none";
    };
    toggle.title = title;
    toggle.addEventListener("click", () => {
      open = !open;
      paint();
    });
    root.appendChild(toggle);
    root.appendChild(wrap);
    fill(wrap);
    paint();
  };

  // Gated HDT-O authoring layer (ECHOES D7.1). Types from the datamodel's
  // `hdto_nodes` section; items show the human label.
  const hdtoTypes = hdtoAuthoringTypes();
  if (hdtoTypes.length)
    gatedSection(
      "HDT-O (advanced)",
      "Heritage Digital Twin authoring (ECHOES D7.1) — gated; the stratigraphic palette is unaffected.",
      (wrap) => {
        for (const t of hdtoTypes) makeItem(t, wrap, { display: nodeLabel(t) });
      },
    );

  // Gated DTC authoring layer (ECHOES). One item per (input/process/output) ×
  // specific kind, read data-driven from `dtc_kinds`; each shows its label + the
  // per-kind glyph. Creating a node sets node.data.dtc_kind (via onPick's 2nd arg).
  const dtcKinds = dtcAuthoringKinds();
  if (dtcKinds.length)
    gatedSection(
      "DTC (advanced)",
      "Digital Twin Chain authoring (ECHOES) — provenance that produces documents; gated, the stratigraphic palette is unaffected.",
      (wrap) => {
        for (const d of dtcKinds)
          makeItem(d.nodeType, wrap, {
            display: d.label,
            iconUrl: dtcGlyphUrl(d.glyph),
            onClick: () => onPick(d.nodeType, d.kind),
            key: `${d.nodeType}:${d.kind}`,
          });
      },
    );

  return {
    setActive(activeKey: string | null): void {
      for (const [k, b] of buttons)
        b.classList.toggle("active", k === activeKey);
    },
  };
}
