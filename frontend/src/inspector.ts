import { edgeStyle, nodeStyle } from "./palette";
import type { EmDocument, EmEdge, EmNode } from "./types";

export interface InspectorCallbacks {
  onJump: (nodeId: string) => void;
  onClose: () => void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderInspector(
  root: HTMLElement,
  doc: EmDocument,
  nodeId: string | null,
  cb: InspectorCallbacks,
): void {
  root.innerHTML = "";
  if (!nodeId) {
    root.classList.add("hidden");
    return;
  }
  const node = doc.graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    root.classList.add("hidden");
    return;
  }
  root.classList.remove("hidden");

  const head = el("div", "insp-head");
  const st = nodeStyle(node.node_type);
  const chip = el("span", "insp-chip", node.node_type);
  chip.style.background = st.fill;
  chip.style.color = st.textColor;
  chip.style.borderColor = st.border;
  head.appendChild(chip);
  const close = el("button", "insp-close", "×");
  close.title = "Close (Esc)";
  close.addEventListener("click", cb.onClose);
  head.appendChild(close);
  root.appendChild(head);

  root.appendChild(el("h2", "insp-name", String(node.name || node.id)));
  root.appendChild(el("div", "insp-id", node.id));
  if (node.description)
    root.appendChild(el("p", "insp-desc", String(node.description)));

  // extra data fields
  const data = (node as EmNode).data;
  if (data && Object.keys(data).length) {
    const dl = el("dl", "insp-data");
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === "" || v === undefined) continue;
      dl.appendChild(el("dt", undefined, k));
      dl.appendChild(
        el("dd", undefined, typeof v === "object" ? JSON.stringify(v) : String(v)),
      );
    }
    if (dl.childElementCount) {
      root.appendChild(el("h3", "insp-sect", "Data"));
      root.appendChild(dl);
    }
  }

  // connections grouped by edge type and direction
  const groups = new Map<string, { edge: EmEdge; otherId: string; out: boolean }[]>();
  for (const e of doc.graph.edges) {
    let otherId: string, out: boolean;
    if (e.source === nodeId) {
      otherId = e.target;
      out = true;
    } else if (e.target === nodeId) {
      otherId = e.source;
      out = false;
    } else continue;
    const key = e.edge_type ?? "edge";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ edge: e, otherId, out });
  }
  if (groups.size) {
    root.appendChild(el("h3", "insp-sect", "Connections"));
    const nodeById = new Map(doc.graph.nodes.map((n) => [n.id, n]));
    for (const [type, list] of [...groups.entries()].sort()) {
      const es = edgeStyle(type);
      const g = el("div", "insp-group");
      const title = el("div", "insp-group-title", `${es.label} (${list.length})`);
      title.style.color = es.color;
      g.appendChild(title);
      for (const { otherId, out } of list) {
        const other = nodeById.get(otherId);
        const b = el(
          "button",
          "insp-link",
          `${out ? "→" : "←"} ${other?.name ?? otherId}`,
        );
        b.title = `${otherId} [${other?.node_type ?? "?"}]`;
        b.addEventListener("click", () => cb.onJump(otherId));
        g.appendChild(b);
      }
      root.appendChild(g);
    }
  }
}
