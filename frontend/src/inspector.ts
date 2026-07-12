import type { DocumentStore } from "./model";
import { edgeStyle, nodeStyle } from "./palette";
import { isGroupType } from "./rules";
import type { EmEdge, EmNode } from "./types";

export interface InspectorCallbacks {
  onJump: (nodeId: string) => void;
  onClose: () => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edge: EmEdge) => void;
  onToggleFold: (groupId: string) => void;
  onEnterGroup: (groupId: string) => void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderInspector(
  root: HTMLElement,
  store: DocumentStore,
  nodeId: string | null,
  cb: InspectorCallbacks,
): void {
  root.innerHTML = "";
  const node = nodeId ? store.node(nodeId) : undefined;
  if (!nodeId || !node) {
    const empty = el("div", "insp-empty", "Select a node to inspect it");
    root.appendChild(empty);
    return;
  }
  const doc = store.doc;

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

  // editable name
  const nameInput = document.createElement("input");
  nameInput.className = "insp-name-input";
  nameInput.value = String(node.name || "");
  nameInput.placeholder = node.id;
  nameInput.addEventListener("change", () =>
    store.updateNode(nodeId, { name: nameInput.value }),
  );
  root.appendChild(nameInput);
  root.appendChild(el("div", "insp-id", node.id));

  // editable description
  const desc = document.createElement("textarea");
  desc.className = "insp-desc-input";
  desc.rows = 3;
  desc.placeholder = "description…";
  desc.value = String(node.description ?? "");
  desc.addEventListener("change", () =>
    store.updateNode(nodeId, { description: desc.value }),
  );
  root.appendChild(desc);

  // group actions
  if (isGroupType(node.node_type)) {
    const bar = el("div", "insp-actions");
    const fold = el(
      "button",
      "insp-btn",
      store.isFolded(nodeId) ? "Unfold group" : "Fold group",
    ) as HTMLButtonElement;
    fold.addEventListener("click", () => cb.onToggleFold(nodeId));
    bar.appendChild(fold);
    const enter = el("button", "insp-btn", "Enter group ▸") as HTMLButtonElement;
    enter.title = "Isolated canvas with only the group members (double-click)";
    enter.addEventListener("click", () => cb.onEnterGroup(nodeId));
    bar.appendChild(enter);
    root.appendChild(bar);
  }

  // extra data fields (read-only)
  const data = (node as EmNode).data;
  if (data && Object.keys(data).length) {
    const dl = el("dl", "insp-data");
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === "" || v === undefined) continue;
      dl.appendChild(el("dt", undefined, k));
      dl.appendChild(
        el(
          "dd",
          undefined,
          typeof v === "object" ? JSON.stringify(v) : String(v),
        ),
      );
    }
    if (dl.childElementCount) {
      root.appendChild(el("h3", "insp-sect", "Data"));
      root.appendChild(dl);
    }
  }

  // connections grouped by edge type and direction, deletable
  const groups = new Map<
    string,
    { edge: EmEdge; otherId: string; out: boolean }[]
  >();
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
      const title = el(
        "div",
        "insp-group-title",
        `${es.label} (${list.length})`,
      );
      title.style.color = es.color;
      g.appendChild(title);
      for (const { edge, otherId, out } of list) {
        const row = el("div", "insp-link-row");
        const b = el(
          "button",
          "insp-link",
          `${out ? "→" : "←"} ${nodeById.get(otherId)?.name || otherId}`,
        );
        b.title = `${otherId} [${nodeById.get(otherId)?.node_type ?? "?"}]`;
        b.addEventListener("click", () => cb.onJump(otherId));
        row.appendChild(b);
        const del = el("button", "insp-edge-del", "×");
        del.title = "Delete this connection";
        del.addEventListener("click", () => cb.onDeleteEdge(edge));
        row.appendChild(del);
        g.appendChild(row);
      }
      root.appendChild(g);
    }
  }

  const danger = el("div", "insp-actions");
  const delNode = el("button", "insp-btn danger", "Delete node");
  delNode.addEventListener("click", () => cb.onDeleteNode(nodeId));
  danger.appendChild(delNode);
  root.appendChild(danger);
}
