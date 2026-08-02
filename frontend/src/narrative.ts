/**
 * N2 — the narrative view: the graph read as a story.
 *
 * A NarrativeNode carries chapters; each chapter carries prose the author wrote
 * and embeds pointing at resources the graph already holds. This module renders
 * that, read-only (authoring is N3).
 *
 * The one rule that shapes everything here: **an embed is a reference**. Every
 * `ref` is resolved against the CURRENT node index at render time — nothing is
 * cached, nothing is copied. Rename a US and the story says the new name; remove
 * a source and the story says, in as many words, that the reference no longer
 * resolves. A viewer that quietly rendered stale text would undo the reason for
 * authoring on a graph in the first place.
 *
 * Colours and labels come from the vendored datamodel (`nodeStyle`,
 * `typeDescription`) — the same functions the canvas renderer uses. There is one
 * palette in this app and this is not a second one.
 */

import { VIEW_TYPES } from "./narrative-edit";
import { nodeStyle } from "./palette";
import { typeDescription } from "./rules";
import type { EmDocument, EmNode } from "./types";

/** A block as it is serialised by s3Dgraphy (`narrative_node.Block`). */
interface NarrativeBlock {
  block_type: "prose" | "embed";
  text?: string;
  ref?: string;
  view_type?: string;
  options?: Record<string, unknown>;
}

interface NarrativeChapter {
  title: string;
  anchor?: string;
  canonical?: boolean;
  blocks?: NarrativeBlock[];
}

export interface Narrative {
  id: string;
  name: string;
  description?: string;
  lang?: string;
  templateId?: string;
  chapters: NarrativeChapter[];
}

/** The view types this phase actually draws. Anything else is labelled as not
 *  yet rendered — an honest placeholder, never an error: the enum is allowed to
 *  lead the implementations. */
const RENDERED_VIEW_TYPES = new Set(["source", "document", "us", "map"]);

export function narrativesIn(doc: EmDocument | null): Narrative[] {
  if (!doc?.graph?.nodes) return [];
  return doc.graph.nodes
    .filter((n) => n.node_type === "narrative")
    .map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      return {
        id: n.id,
        name: String(n.name || n.id),
        description: n.description,
        lang: typeof data.lang === "string" ? data.lang : undefined,
        templateId:
          typeof data.template_id === "string" ? data.template_id : undefined,
        chapters: (data.chapters as NarrativeChapter[]) ?? [],
      };
    });
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Minimal markdown: paragraphs, **bold**, *italic*, `code`. Enough for prose
 *  written in a text box, and small enough not to need a dependency or a
 *  sanitiser — the input is escaped first, so no markup can come through. */
function renderProse(text: string): HTMLElement {
  const wrap = el("div", "nv-prose");
  for (const para of text.split(/\n{2,}/)) {
    if (!para.trim()) continue;
    const p = el("p");
    const escaped = para
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    p.innerHTML = escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    // Placeholder prose from the scaffolder reads as unwritten, and should
    // look it: the author needs to see at a glance what is still to do.
    if (/^\s*\[da scrivere:/.test(para)) p.classList.add("nv-todo");
    wrap.appendChild(p);
  }
  return wrap;
}

function unresolved(ref: string): HTMLElement {
  const box = el("div", "nv-embed nv-unresolved");
  box.appendChild(el("div", "nv-embed-kind", "reference"));
  box.appendChild(
    el("div", "nv-embed-title", `unresolved reference: ${ref}`),
  );
  box.appendChild(
    el(
      "div",
      "nv-embed-note",
      "the graph has no node with this id — it may have been removed, or the " +
        "narrative may come from another graph",
    ),
  );
  return box;
}

function sourceCard(node: EmNode, kind: string): HTMLElement {
  const box = el("div", "nv-embed nv-source");
  box.appendChild(el("div", "nv-embed-kind", kind));
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  if (node.description)
    box.appendChild(el("div", "nv-embed-note", node.description));
  const data = (node.data ?? {}) as Record<string, unknown>;
  const url = typeof data.url === "string" ? data.url : undefined;
  if (url) {
    const a = document.createElement("a");
    a.className = "nv-embed-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.textContent = url;
    box.appendChild(a);
  }
  return box;
}

function usCard(node: EmNode): HTMLElement {
  // Colour and label from the datamodel, via the same helpers the canvas uses.
  const style = nodeStyle(node.node_type);
  const box = el("div", "nv-embed nv-us");
  box.style.borderLeftColor = style.border;
  const head = el("div", "nv-embed-kind");
  const swatch = el("span", "nv-swatch");
  swatch.style.background = style.fill;
  swatch.style.borderColor = style.border;
  head.appendChild(swatch);
  head.appendChild(document.createTextNode(node.node_type));
  box.appendChild(head);
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  if (node.description)
    box.appendChild(el("div", "nv-embed-note", node.description));
  const description = typeDescription(node.node_type);
  if (description) box.title = description;
  return box;
}

function mapCard(node: EmNode, options: Record<string, unknown>): HTMLElement {
  // No map dependency in phase 1. This bundle is built single-file (vite
  // singlefile) and inlines everything, so a CDN Leaflet cannot load and a
  // bundled one costs ~150 KB for one embed type in a read-only viewer. A card
  // that states the coordinates exactly and opens OSM is honest and instant;
  // the interactive map is an increment, not a compromise.
  const data = (node.data ?? {}) as Record<string, unknown>;
  const lon = Number(data.shift_x ?? 0);
  const lat = Number(data.shift_y ?? 0);
  const epsg = data.epsg ?? 4326;
  const box = el("div", "nv-embed nv-map");
  box.appendChild(el("div", "nv-embed-kind", "map"));
  if (!lat && !lon) {
    box.appendChild(
      el("div", "nv-embed-title", "the position node carries no coordinates"),
    );
    return box;
  }
  const zoom = Number(options.zoom ?? 16);
  box.appendChild(
    el("div", "nv-embed-title", `${lat.toFixed(6)}, ${lon.toFixed(6)}`),
  );
  box.appendChild(el("div", "nv-embed-note", `EPSG:${epsg}`));
  const a = document.createElement("a");
  a.className = "nv-embed-link";
  a.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  a.textContent = "open in OpenStreetMap";
  box.appendChild(a);
  return box;
}

function notYetRendered(viewType: string, node: EmNode | null,
                        ref: string): HTMLElement {
  const box = el("div", "nv-embed nv-pending");
  box.appendChild(el("div", "nv-embed-kind", viewType));
  box.appendChild(
    el("div", "nv-embed-title", node ? String(node.name || node.id) : ref),
  );
  box.appendChild(
    el("div", "nv-embed-note",
      `the “${viewType}” view is not rendered yet — the reference is valid and ` +
      `will show as soon as it is`),
  );
  return box;
}

function renderEmbed(
  block: NarrativeBlock,
  index: Map<string, EmNode>,
  onReveal?: (nodeId: string) => void,
): HTMLElement {
  const ref = block.ref ?? "";
  const node = index.get(ref) ?? null;
  const viewType = block.view_type ?? "";
  let box: HTMLElement;
  if (!node) {
    box = unresolved(ref);
  } else if (viewType === "source" || viewType === "document") {
    box = sourceCard(node, viewType);
  } else if (viewType === "us") {
    box = usCard(node);
  } else if (viewType === "map") {
    box = mapCard(node, block.options ?? {});
  } else {
    box = notYetRendered(viewType || "embed", node, ref);
  }
  if (node && onReveal) {
    box.classList.add("nv-clickable");
    box.tabIndex = 0;
    box.setAttribute("role", "button");
    const reveal = () => onReveal(node.id);
    box.addEventListener("click", reveal);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        reveal();
      }
    });
  }
  return box;
}

/**
 * Render the narratives of `doc` into `container`.
 *
 * `onReveal` — when given, an embed that resolves becomes a way into the graph:
 * the same select-and-centre gesture the Log tab uses.
 */
/** The authoring hooks (N3). Absent → the view is read-only, which is what N2
 *  was and what a published render should stay. */
export interface NarrativeEditor {
  narrativeId: string;
  addChapter(): void;
  renameChapter(index: number, title: string): void;
  moveChapter(index: number, delta: number): void;
  deleteChapter(index: number): void;
  toggleCanonical(index: number): void;
  setAnchor(index: number, anchor: string | null): void;
  addProse(chapter: number): void;
  setProse(chapter: number, block: number, text: string): void;
  addEmbed(chapter: number, ref: string, at?: number): void;
  setViewType(chapter: number, block: number, viewType: string): void;
  moveBlock(chapter: number, block: number, delta: number): void;
  deleteBlock(chapter: number, block: number): void;
  /** Lanes a chapter may be anchored to: epochs and activities. */
  lanes(): { id: string; label: string }[];
}

function iconButton(label: string, title: string,
                    onClick: () => void): HTMLButtonElement {
  const b = el("button", "nv-mini", label) as HTMLButtonElement;
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function renderNarrativeView(
  container: HTMLElement,
  doc: EmDocument | null,
  selectedId: string | null,
  onSelect: (id: string) => void,
  onReveal?: (nodeId: string) => void,
  editor?: NarrativeEditor,
): void {
  container.textContent = "";
  const narratives = narrativesIn(doc);

  if (!narratives.length) {
    const empty = el("div", "nv-empty");
    empty.appendChild(
      el("p", undefined,
        doc ? "This document contains no narrative."
            : "No document loaded."),
    );
    if (doc)
      empty.appendChild(
        el("p", "nv-empty-hint",
          "A narrative is a NarrativeNode in the em.json: chapters over the " +
          "graph's lanes, with prose and embeds. The s3Dgraphy `site_story` " +
          "template generates a first draft from an existing graph."),
      );
    container.appendChild(empty);
    return;
  }

  const current =
    narratives.find((n) => n.id === selectedId) ?? narratives[0];

  if (narratives.length > 1) {
    const bar = el("div", "nv-picker");
    for (const n of narratives) {
      const b = el("button", "nv-picker-btn", n.name) as HTMLButtonElement;
      b.classList.toggle("active", n.id === current.id);
      b.addEventListener("click", () => onSelect(n.id));
      bar.appendChild(b);
    }
    container.appendChild(bar);
  }

  const head = el("header", "nv-head");
  head.appendChild(el("h1", "nv-title", current.name));
  const meta: string[] = [];
  if (current.lang) meta.push(current.lang);
  if (current.templateId) meta.push(`template: ${current.templateId}`);
  meta.push(`${current.chapters.length} chapters`);
  head.appendChild(el("div", "nv-meta", meta.join(" · ")));
  if (current.description)
    head.appendChild(el("p", "nv-lede", current.description));
  container.appendChild(head);

  const index = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));

  current.chapters.forEach((chapter, ci) => {
    const section = el("section", "nv-chapter");
    const h = el("div", "nv-chapter-head");
    h.appendChild(el("h2", "nv-chapter-title", chapter.title || "(untitled)"));
    if (chapter.canonical) {
      const badge = el("span", "nv-badge", "canonical");
      badge.title =
        "Settled by the author: regenerating the template leaves this chapter " +
        "untouched.";
      h.appendChild(badge);
    }
    if (chapter.anchor) {
      // The chapter usually takes its title FROM the lane, so echoing the lane's
      // name beside it just says the same word twice. Show the id in that case:
      // it is the part the reader cannot already see.
      const anchorNode = index.get(chapter.anchor);
      const laneName = anchorNode ? String(anchorNode.name || "") : "";
      const label = laneName && laneName !== chapter.title
        ? laneName
        : chapter.anchor;
      const chip = el("span", "nv-anchor", label);
      chip.title = laneName
        ? `This chapter narrates the lane “${laneName}” (${chapter.anchor})`
        : `This chapter narrates the lane “${chapter.anchor}”, which is not in this graph`;
      if (!anchorNode) chip.classList.add("nv-anchor-missing");
      h.appendChild(chip);
    }
    if (editor) {
      const tools = el("div", "nv-chapter-tools");
      const canon = iconButton(
        chapter.canonical ? "★" : "☆",
        chapter.canonical
          ? "Settled: the template regeneration leaves this chapter alone. Click to un-settle."
          : "Mark as settled, so regenerating the template does not touch it.",
        () => editor.toggleCanonical(ci));
      tools.appendChild(canon);
      const laneSel = document.createElement("select");
      laneSel.className = "nv-lane-select";
      laneSel.title = "The lane this chapter narrates";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "(no lane)";
      none.selected = !chapter.anchor;
      laneSel.appendChild(none);
      for (const lane of editor.lanes()) {
        const o = document.createElement("option");
        o.value = lane.id;
        o.textContent = lane.label;
        o.selected = lane.id === chapter.anchor;
        laneSel.appendChild(o);
      }
      laneSel.addEventListener("change", () =>
        editor.setAnchor(ci, laneSel.value || null));
      tools.appendChild(laneSel);
      tools.appendChild(iconButton("▲", "Move chapter up",
        () => editor.moveChapter(ci, -1)));
      tools.appendChild(iconButton("▼", "Move chapter down",
        () => editor.moveChapter(ci, 1)));
      tools.appendChild(iconButton("✕", "Delete this chapter",
        () => editor.deleteChapter(ci)));
      h.appendChild(tools);

      const titleEl = h.querySelector(".nv-chapter-title") as HTMLElement;
      titleEl.contentEditable = "true";
      titleEl.spellcheck = false;
      titleEl.classList.add("nv-editable");
      titleEl.title = "Click to rename";
      titleEl.addEventListener("blur", () => {
        const next = (titleEl.textContent || "").trim();
        if (next && next !== chapter.title) editor.renameChapter(ci, next);
      });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          titleEl.blur();
        }
      });
    }
    section.appendChild(h);

    const blocks = chapter.blocks ?? [];
    blocks.forEach((block, bi) => {
      const body = block.block_type === "prose"
        ? (editor ? editableProse(block.text ?? "", (t) =>
            editor.setProse(ci, bi, t))
          : renderProse(block.text ?? ""))
        : renderEmbed(block, index, onReveal);
      if (!editor) {
        section.appendChild(body);
        return;
      }
      const row = el("div", "nv-block-row");
      body.classList.add("nv-block-body");
      row.appendChild(body);
      const tools = el("div", "nv-block-tools");
      if (block.block_type === "embed") {
        const sel = document.createElement("select");
        sel.className = "nv-viewtype";
        sel.title = "How this reference is shown";
        for (const vt of VIEW_TYPES) {
          const o = document.createElement("option");
          o.value = vt;
          o.textContent = vt;
          o.selected = vt === block.view_type;
          sel.appendChild(o);
        }
        sel.addEventListener("change", () =>
          editor.setViewType(ci, bi, sel.value));
        tools.appendChild(sel);
      }
      tools.appendChild(iconButton("▲", "Move up",
        () => editor.moveBlock(ci, bi, -1)));
      tools.appendChild(iconButton("▼", "Move down",
        () => editor.moveBlock(ci, bi, 1)));
      tools.appendChild(iconButton("✕", "Remove this block",
        () => editor.deleteBlock(ci, bi)));
      row.appendChild(tools);
      section.appendChild(row);
    });

    if (editor) {
      const add = el("div", "nv-add-row");
      add.appendChild(iconButton("+ prose", "Add a paragraph",
        () => editor.addProse(ci)));
      const hint = el("span", "nv-drop-hint",
        "…or drag a node from the Nodes tab into this chapter");
      add.appendChild(hint);
      section.appendChild(add);

      // Drag-to-embed. The drop target is the whole chapter, so the gesture is
      // "put this in that chapter" rather than a hunt for a 4-pixel line.
      section.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes("application/x-em-node-id")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        section.classList.add("nv-drop-over");
      });
      section.addEventListener("dragleave", () =>
        section.classList.remove("nv-drop-over"));
      section.addEventListener("drop", (e) => {
        section.classList.remove("nv-drop-over");
        const ref = e.dataTransfer?.getData("application/x-em-node-id");
        if (!ref) return;
        e.preventDefault();
        editor.addEmbed(ci, ref);
      });
    }
    container.appendChild(section);
  });

  if (editor) {
    const foot = el("div", "nv-chapter");
    foot.appendChild(iconButton("+ capitolo", "Add a chapter at the end",
      () => editor.addChapter()));
    container.appendChild(foot);
  }
}

/** A paragraph that becomes a textarea when you click it. Editing prose should
 *  not need a mode switch or a dialog — the text is the interface. */
function editableProse(text: string,
                       onCommit: (text: string) => void): HTMLElement {
  const wrap = el("div", "nv-prose-edit");
  const view = renderProse(text || "");
  if (!text.trim())
    view.appendChild(el("p", "nv-todo", "(paragrafo vuoto — clicca per scrivere)"));
  wrap.appendChild(view);
  wrap.title = "Click to edit";
  wrap.addEventListener("click", () => {
    if (wrap.querySelector("textarea")) return;
    const ta = document.createElement("textarea");
    ta.className = "nv-textarea";
    ta.value = text;
    ta.rows = Math.max(3, text.split("\n").length + 1);
    wrap.textContent = "";
    wrap.appendChild(ta);
    ta.focus();
    const commit = () => {
      if (ta.value !== text) onCommit(ta.value);
      else wrap.replaceChildren(renderProse(text));
    };
    ta.addEventListener("blur", commit);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        wrap.replaceChildren(renderProse(text));
      }
    });
  });
  return wrap;
}

/** Which view types this build actually draws — used by the tests and worth
 *  stating out loud so the gap between the enum and the implementation stays
 *  visible. */
export function renderedViewTypes(): string[] {
  return [...RENDERED_VIEW_TYPES];
}
