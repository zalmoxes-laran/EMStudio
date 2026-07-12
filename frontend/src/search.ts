import type { EmDocument } from "./types";

export function setupSearch(
  input: HTMLInputElement,
  resultsBox: HTMLElement,
  getDoc: () => EmDocument | null,
  onPick: (nodeId: string) => void,
): void {
  const hide = (): void => {
    resultsBox.classList.add("hidden");
    resultsBox.innerHTML = "";
  };

  const run = (): void => {
    const doc = getDoc();
    const q = input.value.trim().toLowerCase();
    if (!doc || q.length < 2) {
      hide();
      return;
    }
    const hits = doc.graph.nodes
      .filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          String(n.name ?? "").toLowerCase().includes(q) ||
          String(n.description ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
    resultsBox.innerHTML = "";
    if (!hits.length) {
      hide();
      return;
    }
    for (const n of hits) {
      const b = document.createElement("button");
      b.className = "search-hit";
      b.innerHTML = `<b></b> <span class="hit-type"></span><br><small></small>`;
      (b.children[0] as HTMLElement).textContent = String(n.name || n.id);
      (b.children[1] as HTMLElement).textContent = n.node_type;
      (b.children[3] as HTMLElement).textContent = n.id;
      b.addEventListener("click", () => {
        onPick(n.id);
        hide();
        input.blur();
      });
      resultsBox.appendChild(b);
    }
    resultsBox.classList.remove("hidden");
  };

  input.addEventListener("input", run);
  input.addEventListener("focus", run);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      input.value = "";
      hide();
      input.blur();
    }
    if (ev.key === "Enter") {
      const first = resultsBox.querySelector("button");
      if (first) (first as HTMLButtonElement).click();
    }
  });
  document.addEventListener("pointerdown", (ev) => {
    if (!resultsBox.contains(ev.target as Node) && ev.target !== input) hide();
  });
}
