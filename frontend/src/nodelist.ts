// Node list view (outliner): the node groups on top — with inline
// fold/unfold and explode (isolate) controls — then the filterable table of
// every node (name / type / description); click selects and centres.
import { nodeStyle } from "./palette";
import { isGroupType } from "./rules";
import type { EmDocument } from "./types";

export interface NodeListApi {
  refresh: () => void;
  setSelected: (id: string | null) => void;
}

export interface NodeListCallbacks {
  isFolded: (id: string) => boolean;
  onToggleFold: (id: string) => void;
  onExplode: (id: string) => void;
  /** fold/unfold every paradata node group at once (single undo step) */
  onFoldAll: (folded: boolean) => void;
  /** true when the node physically contains others (is_part_of members) */
  isContainer: (id: string) => boolean;
}

export function buildNodeList(
  root: HTMLElement,
  getDoc: () => EmDocument | null,
  onPick: (id: string) => void,
  groupCb: NodeListCallbacks,
): NodeListApi {
  root.innerHTML = "";
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = "Filter…";
  filter.className = "nl-filter";
  root.appendChild(filter);
  const count = document.createElement("div");
  count.className = "nl-count";
  root.appendChild(count);
  const listEl = document.createElement("div");
  listEl.className = "nl-rows";
  root.appendChild(listEl);

  let selected: string | null = null;
  const rows = new Map<string, HTMLElement>();

  const rebuild = (): void => {
    listEl.innerHTML = "";
    rows.clear();
    const doc = getDoc();
    if (!doc) {
      count.textContent = "";
      return;
    }
    const q = filter.value.trim().toLowerCase();
    const match = (s: unknown): boolean =>
      String(s ?? "")
        .toLowerCase()
        .includes(q);
    const matches = (n: (typeof doc.graph.nodes)[number]): boolean =>
      !q || match(n.name) || match(n.id) || match(n.node_type) || match(n.description);

    // ---- groups section (fold / explode inline) ----
    // node groups by type PLUS stratigraphic containers (is_part_of members)
    const groups = doc.graph.nodes
      .filter(
        (n) =>
          (isGroupType(n.node_type) || groupCb.isContainer(n.id)) && matches(n),
      )
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    if (groups.length) {
      const h = document.createElement("div");
      h.className = "nl-sect nl-sect-groups";
      const label = document.createElement("span");
      label.textContent = `Groups (${groups.length})`;
      h.appendChild(label);
      const foldAll = document.createElement("button");
      foldAll.className = "nl-icon";
      foldAll.textContent = "⊟";
      foldAll.title = "Fold all paradata node groups";
      foldAll.addEventListener("click", () => groupCb.onFoldAll(true));
      h.appendChild(foldAll);
      const unfoldAll = document.createElement("button");
      unfoldAll.className = "nl-icon";
      unfoldAll.textContent = "⊞";
      unfoldAll.title = "Unfold all paradata node groups";
      unfoldAll.addEventListener("click", () => groupCb.onFoldAll(false));
      h.appendChild(unfoldAll);
      listEl.appendChild(h);
      for (const g of groups) {
        const row = document.createElement("div");
        row.className = "nl-grow";
        const fold = document.createElement("button");
        fold.className = "nl-icon";
        const folded = groupCb.isFolded(g.id);
        fold.textContent = folded ? "▸" : "▾";
        fold.title = folded ? "Unfold group" : "Fold group";
        fold.addEventListener("click", (ev) => {
          ev.stopPropagation();
          groupCb.onToggleFold(g.id);
        });
        row.appendChild(fold);
        const name = document.createElement("button");
        name.className = "nl-gname";
        name.textContent = String(g.name || g.id);
        name.title = `${g.id} [${g.node_type}]`;
        name.addEventListener("click", () => onPick(g.id));
        row.appendChild(name);
        const explode = document.createElement("button");
        explode.className = "nl-icon";
        explode.textContent = "⤢";
        explode.title = "Explode: isolate the group contents";
        explode.addEventListener("click", (ev) => {
          ev.stopPropagation();
          groupCb.onExplode(g.id);
        });
        row.appendChild(explode);
        listEl.appendChild(row);
        rows.set(g.id, row);
      }
      const h2 = document.createElement("div");
      h2.className = "nl-sect";
      h2.textContent = "Nodes";
      listEl.appendChild(h2);
    }

    const nodes = doc.graph.nodes
      .filter((n) => !isGroupType(n.node_type) && matches(n))
      .sort((a, b) =>
        String(a.name || a.id).localeCompare(String(b.name || b.id)),
      );
    count.textContent = `${nodes.length + groups.length} / ${doc.graph.nodes.length} nodes`;
    for (const n of nodes) {
      const row = document.createElement("button");
      row.className = "nl-row" + (n.id === selected ? " selected" : "");
      const st = nodeStyle(n.node_type);
      const dot = document.createElement("span");
      dot.className = "nl-dot";
      dot.style.background = st.fill;
      dot.style.borderColor = st.border;
      row.appendChild(dot);
      const body = document.createElement("span");
      body.className = "nl-body";
      const name = document.createElement("b");
      name.textContent = String(n.name || n.id);
      const type = document.createElement("small");
      type.textContent = ` ${n.node_type}`;
      const desc = document.createElement("span");
      desc.className = "nl-desc";
      desc.textContent = String(n.description ?? "");
      body.appendChild(name);
      body.appendChild(type);
      body.appendChild(document.createElement("br"));
      body.appendChild(desc);
      row.appendChild(body);
      row.addEventListener("click", () => onPick(n.id));
      listEl.appendChild(row);
      rows.set(n.id, row);
    }
  };

  filter.addEventListener("input", rebuild);

  return {
    refresh: rebuild,
    setSelected(id: string | null): void {
      if (selected && rows.get(selected)) rows.get(selected)!.classList.remove("selected");
      selected = id;
      const row = id ? rows.get(id) : null;
      if (row) {
        row.classList.add("selected");
        row.scrollIntoView({ block: "nearest" });
      }
    },
  };
}
