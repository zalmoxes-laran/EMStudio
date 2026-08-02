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

import { blockStatus, bylineOf, narrativeAuthors } from "./narrative-authorship";
import type { AuthorRef, BlockStatus } from "./narrative-authorship";
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
  // N4/N6 — who wrote it, what they were asked, who vouches for it.
  authored_by?: string;
  prompt_ref?: string;
  validated_by?: string;
  ai_generated?: boolean;
}

interface NarrativeChapter {
  title: string;
  anchor?: string;
  canonical?: boolean;
  blocks?: NarrativeBlock[];
  authored_by?: string;
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

// ── provenance of a paragraph (N6) ─────────────────────────────────
//
// The badge is not decoration. A reader of an archaeological narrative has to
// be able to tell, without asking, whether the sentence in front of them was
// written by a person, produced by a model and left unchecked, or produced by a
// model and signed off by somebody who can be asked about it.
//
// Colours come from the vendored visual rules — the AI badge takes the AUTH_AI
// node style, the endorsement badge takes AUTH — so the story and the canvas
// say "author" in the same colour. Nothing here is a second palette.

const STATUS_LABEL: Record<BlockStatus, string> = {
  human: "",                     // a person wrote it; nothing to announce
  ai_draft: "bozza AI",
  ai_endorsed: "avallata",
};

/**
 * The strip under a generated paragraph: what wrote it, what it was asked, who
 * (if anyone) has vouched for it, and the gesture to vouch.
 *
 * `onReveal` makes the prompt reachable in ONE click, exactly like any other
 * source embed — "how do I know this" has to hold for "how did the machine come
 * to write it" too, or the transparency is decorative.
 */
function provenanceStrip(
  block: NarrativeBlock,
  index: Map<string, EmNode>,
  onReveal?: (nodeId: string) => void,
  endorse?: () => void,
  retract?: () => void,
  signer?: AuthorRef | null,
): HTMLElement | null {
  const status = blockStatus(block);
  if (status === "human") return null;
  const ai = nodeStyle("author_ai");
  const human = nodeStyle("author");
  const strip = el("div", "nv-prov");

  const badge = el("span", "nv-prov-badge", STATUS_LABEL[status]);
  const style = status === "ai_endorsed" ? human : ai;
  badge.style.background = style.fill;
  badge.style.borderColor = style.border;
  badge.style.color = style.textColor;
  strip.appendChild(badge);

  const model = index.get(block.authored_by ?? "");
  if (block.authored_by) {
    const who = el("span", "nv-prov-who",
      model ? String(model.name || model.id) : block.authored_by);
    who.title = "Il modello che ha scritto questo paragrafo";
    strip.appendChild(who);
  }
  const opts = block.options ?? {};
  for (const key of ["model_version", "generated_at"]) {
    const v = opts[key];
    if (typeof v === "string" && v) {
      const chip = el("span", "nv-prov-dim", v);
      chip.title = key === "generated_at"
        ? "Quando è stata generata"
        : "Versione del modello";
      strip.appendChild(chip);
    }
  }

  if (block.prompt_ref) {
    const prompt = index.get(block.prompt_ref);
    const link = el("button", "nv-prov-link", "prompt") as HTMLButtonElement;
    link.title = prompt?.description
      ? `Cosa è stato chiesto:\n\n${prompt.description}`
      : `La fonte-prompt «${block.prompt_ref}» non è in questo grafo`;
    if (!prompt) link.classList.add("nv-prov-missing");
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      if (prompt && onReveal) onReveal(prompt.id);
    });
    link.disabled = !prompt || !onReveal;
    strip.appendChild(link);
  } else {
    const none = el("span", "nv-prov-dim nv-prov-missing", "nessun prompt");
    none.title =
      "Questa bozza non registra cosa è stato chiesto al modello: il «come lo " +
      "so» resta incompleto.";
    strip.appendChild(none);
  }

  if (status === "ai_endorsed") {
    const by = index.get(block.validated_by ?? "");
    const sig = el("span", "nv-prov-signed",
      `✓ ${by ? String(by.name || by.id) : block.validated_by}`);
    sig.title = "Chi ha messo il proprio nome su questo testo";
    strip.appendChild(sig);
    if (retract) {
      const b = el("button", "nv-mini", "ritira") as HTMLButtonElement;
      b.title = "Ritira l'avallo: il paragrafo torna a leggersi come bozza.";
      b.addEventListener("click", (e) => { e.stopPropagation(); retract(); });
      strip.appendChild(b);
    }
  } else if (endorse) {
    // Never disabled for lack of a signer. A disabled button with an
    // explanation of where the missing control lives makes the user hunt; this
    // one always acts — it signs, or it brings the picker to them.
    const b = el("button", "nv-endorse", "Valida") as HTMLButtonElement;
    b.title = signer
      ? `Metti il nome di ${signer.label} su questo paragrafo. ` +
        `Solo una persona può avallare: un modello che garantisce per un ` +
        `modello non è una validazione.`
      : "Scegli con quale nome firmi — premi e ti porto al selettore.";
    b.classList.toggle("nv-endorse-unsigned", !signer);
    b.addEventListener("click", (e) => { e.stopPropagation(); endorse(); });
    strip.appendChild(b);
  }
  return strip;
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

  // — authorship, generation, endorsement (N6) —
  /** Everyone the graph knows as an author, models included. */
  authors(): AuthorRef[];
  /** Only people. A model may not sign — see `endorse`. */
  humanAuthors(): AuthorRef[];
  addAuthor(authorId: string): void;
  removeAuthor(authorId: string): void;
  setChapterAuthor(index: number, authorId: string | null): void;
  /** Who is signing, right now. One place says it; every Valida uses it. */
  signer(): AuthorRef | null;
  setSigner(authorId: string | null): void;
  endorse(chapter: number, block: number): void;
  /** Vouch for every unendorsed AI paragraph in one chapter, one act each. */
  endorseChapter(chapter: number): void;
  /** How many paragraphs `endorseChapter` would sign right now. */
  pendingIn(chapter: number): number;
  retract(chapter: number, block: number): void;
  /** True where a draft can be generated: the chapter narrates an ACTIVITY,
   *  which is where the actions — and so the story — are. */
  canGenerate(index: number): boolean;
  generate(index: number): void;
  /** A request is in flight for this chapter. */
  generating(index: number): boolean;
}

function authorChip(a: AuthorRef, ai: boolean): HTMLElement {
  const style = nodeStyle(ai ? "author_ai" : "author");
  const chip = el("span", "nv-author-chip", a.label);
  chip.style.background = style.fill;
  chip.style.borderColor = style.border;
  chip.style.color = style.textColor;
  return chip;
}

function chipRemove(a: AuthorRef, onClick: () => void): HTMLButtonElement {
  const x = el("button", "nv-chip-x", "✕") as HTMLButtonElement;
  x.title = `Togli ${a.label} dagli autori di questa narrativa`;
  x.addEventListener("click", onClick);
  return x;
}

/** A `<select>` over authors. Resets to its placeholder after a pick when the
 *  chosen value is an action rather than a state ("+ autore"). */
function authorSelect(options: AuthorRef[], selected: string | null,
                      placeholder: string, title: string,
                      onPick: (id: string | null) => void): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = "nv-author-select";
  sel.title = title;
  const none = document.createElement("option");
  none.value = "";
  none.textContent = placeholder;
  none.selected = !selected;
  sel.appendChild(none);
  for (const a of options) {
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.ai ? `${a.label} (AI)` : a.label;
    o.selected = a.id === selected;
    sel.appendChild(o);
  }
  sel.disabled = options.length === 0;
  sel.addEventListener("change", () => onPick(sel.value || null));
  return sel;
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

  // The byline is TWO lines, and the split is the point (N8). People who can be
  // asked about a claim go first, as responsible; models follow as assistance.
  // One line listing them as equal co-authors would state something false.
  const { responsible, assisted } = bylineOf(doc, current.id, current.chapters);
  const declared = narrativeAuthors(doc, current.id);

  const byline = el("div", "nv-authors");
  byline.appendChild(el("span", "nv-authors-label", "a cura di"));
  if (!responsible.length)
    byline.appendChild(el("span", "nv-prov-dim nv-prov-missing",
      "nessuna persona responsabile"));
  for (const a of responsible) {
    const chip = authorChip(a, false);
    chip.title = declared.some((d) => d.id === a.id)
      ? "Autore umano: risponde di questo racconto"
      : "Ha avallato del testo generato — e quindi ne risponde";
    if (editor && declared.some((d) => d.id === a.id))
      chip.appendChild(chipRemove(a, () => editor.removeAuthor(a.id)));
    byline.appendChild(chip);
  }
  if (editor) {
    const add = authorSelect(
      editor.authors().filter(
        (a) => !a.ai && !responsible.some((x) => x.id === a.id)),
      null, "+ autore", "Aggiungi una persona fra gli autori di questa narrativa",
      (id) => { if (id) editor.addAuthor(id); });
    byline.appendChild(add);

    // "Signing as" lives once, at the top: an endorsement is the same act
    // whichever paragraph it lands on, and asking who you are on every click
    // would turn a signature into a form.
    const signing = el("span", "nv-signing");
    signing.appendChild(el("span", "nv-authors-label", "firmo come"));
    const humans = editor.humanAuthors();
    signing.appendChild(authorSelect(
      humans, editor.signer()?.id ?? null,
      humans.length ? "(nessuno)" : "(nessun autore umano nel grafo)",
      "Chi mette il proprio nome quando premi Valida. Solo persone: " +
      "un modello non può avallare.",
      (id) => editor.setSigner(id)));
    byline.appendChild(signing);
  }
  head.appendChild(byline);

  // «con l'assistenza di …» — declared, attributed, and subordinate. A model is
  // never a co-author here: nothing it wrote counts until a person endorses it.
  if (assisted.length) {
    const help = el("div", "nv-authors nv-assist");
    help.appendChild(el("span", "nv-authors-label", "con l'assistenza di"));
    for (const a of assisted) {
      const chip = authorChip(a, true);
      chip.title =
        "Modello che ha scritto del testo. Non può avallarlo: " +
        "un modello che garantisce per un modello non è una validazione.";
      if (editor && declared.some((d) => d.id === a.id))
        chip.appendChild(chipRemove(a, () => editor.removeAuthor(a.id)));
      help.appendChild(chip);
    }
    head.appendChild(help);
  }
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
    if (chapter.authored_by && !editor) {
      const node = index.get(chapter.authored_by);
      const who = node ? String(node.name || node.id) : chapter.authored_by;
      const chip = el("span", "nv-author-chip nv-author-inline", who);
      const style = nodeStyle(node?.node_type ?? "author");
      chip.style.background = style.fill;
      chip.style.borderColor = style.border;
      chip.style.color = style.textColor;
      chip.title = "Chi firma questo capitolo";
      h.appendChild(chip);
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
      // The chapter toolbar already carries an author select; without a label
      // the two reads as one, and the user looks for "firmo come" here.
      tools.appendChild(el("span", "nv-tool-label", "autore cap."));
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
      tools.appendChild(authorSelect(
        editor.authors(), chapter.authored_by ?? null, "(nessun autore)",
        "Chi firma questo capitolo",
        (id) => editor.setChapterAuthor(ci, id)));
      // Generation is anchored to an ACTIVITY: that is where the actions are,
      // and a briefing built from anything else would be empty. The button is
      // simply absent elsewhere rather than present and disabled — a control
      // that can never apply is noise.
      if (editor.canGenerate(ci)) {
        const busy = editor.generating(ci);
        const gen = el("button", "nv-generate",
          busy ? "genero…" : "Genera bozza (AI)") as HTMLButtonElement;
        gen.disabled = busy;
        gen.title =
          "Manda al modello un briefing di QUESTA attività — le sue azioni in " +
          "ordine stratigrafico, le epoche e le evidenze già registrate — e " +
          "inserisce la prosa come bozza non avallata, attribuita al modello, " +
          "col prompt registrato come fonte. Nient'altro del grafo viene " +
          "inviato.";
        gen.addEventListener("click", (e) => {
          e.stopPropagation();
          editor.generate(ci);
        });
        tools.appendChild(gen);
      }
      // "Valida capitolo" states the count in its own label: an endorsement is
      // a signature, and a button that doesn't say how much it is signing
      // invites an absent-minded stamp.
      const pending = editor.pendingIn(ci);
      if (pending > 0) {
        const signer = editor.signer();
        const all = el("button", "nv-endorse nv-endorse-all",
          `Valida capitolo (${pending})`) as HTMLButtonElement;
        all.classList.toggle("nv-endorse-unsigned", !signer);
        all.title = signer
          ? `Metti il nome di ${signer.label} su ${pending} ` +
            `paragraf${pending === 1 ? "o" : "i"} di questo capitolo. ` +
            `Resta un atto per paragrafo: nel grafo si vedrà a quali frasi ` +
            `ha messo la firma, non solo che ha firmato il capitolo.`
          : "Scegli con quale nome firmi — premi e ti porto al selettore.";
        all.addEventListener("click", (e) => {
          e.stopPropagation();
          editor.endorseChapter(ci);
        });
        tools.appendChild(all);
      }
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
      let body = block.block_type === "prose"
        ? (editor ? editableProse(block.text ?? "", (t) =>
            editor.setProse(ci, bi, t))
          : renderProse(block.text ?? ""))
        : renderEmbed(block, index, onReveal);
      // Provenance rides with the paragraph in BOTH modes: knowing a machine
      // wrote this is not an authoring convenience, it is what the reader needs.
      const strip = block.block_type === "prose"
        ? provenanceStrip(block, index, onReveal,
            editor ? () => editor.endorse(ci, bi) : undefined,
            editor ? () => editor.retract(ci, bi) : undefined,
            editor ? editor.signer() : null)
        : null;
      if (strip) {
        const wrap = el("div", `nv-prose-wrap nv-${blockStatus(block)}`);
        wrap.appendChild(body);
        wrap.appendChild(strip);
        body = wrap;
      }
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
