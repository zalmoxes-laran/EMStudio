// Node palette, generated from the EM visual rules + node class registry —
// the palette is data-driven, EMStudio never hardcodes the EM language.
// Icons are the official s3Dgraphy 2D assets (JSON_config/src/2D), inlined
// at build time; types without an official icon fall back to a drawn swatch.
import { nodeStyle } from "./palette";
import { isGroupType, typeDescription } from "./rules";

import { iconUrlFor } from "./icons";

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
  onPick: (nodeType: string) => void,
): { setActive: (nodeType: string | null) => void } {
  root.innerHTML = "";
  const buttons = new Map<string, HTMLButtonElement>();
  for (const section of SECTIONS) {
    const h = document.createElement("div");
    h.className = "pal-sect";
    h.textContent = section.label;
    root.appendChild(h);
    for (const t of section.types) {
      const b = document.createElement("button");
      b.className = "pal-item";
      b.title = typeDescription(t) || t;
      if (isGroupType(t)) {
        // groups render as canonical coloured container boxes, not swatches
        b.appendChild(groupSwatch(t));
      } else {
        const icon = iconUrlFor(t);
        if (icon) {
          const img = document.createElement("img");
          img.src = icon;
          img.className = "pal-icon";
          img.alt = t;
          b.appendChild(img);
        } else {
          b.appendChild(swatch(t));
        }
      }
      const span = document.createElement("span");
      span.textContent = t;
      b.appendChild(span);
      b.addEventListener("click", () => onPick(t));
      root.appendChild(b);
      buttons.set(t, b);
    }
  }
  return {
    setActive(nodeType: string | null): void {
      for (const [t, b] of buttons)
        b.classList.toggle("active", t === nodeType);
    },
  };
}
