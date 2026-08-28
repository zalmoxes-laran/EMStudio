/**
 * DP-79 · P3 — the dissemination viewer (T6.3), standalone and LIVE.
 *
 * The reader's end of the ecosystem. EMStudio is where a study is authored; this
 * is where somebody who was handed a link reads it — no shell, no palette, no
 * canvas, and no way to change anything. Read-only is a decision, not a missing
 * feature: a page that could edit would need identity, saving and conflict
 * handling, and would stop being something you can put behind a public URL.
 *
 * **One rendering engine.** It calls `renderNarrativeView` — the same function
 * the editor calls, with the editor argument left out. Nothing about embeds is
 * reimplemented here; the moment it were, a story would look different depending
 * on who opened it, which is the failure this whole design avoids.
 *
 * **Live, and that is the difference from the export.** The HTML export (P1) is
 * a snapshot: one reading, frozen, portable, e-mailable. This fetches the
 * document and resolves every embed at render time — so the 3D is navigable, the
 * matrix says what the graph says today, and a renamed unit is renamed here too.
 * Same NarrativeNode, two renderings, one engine.
 *
 * **What it is pointed at** — in precedence order, and all of it in the URL
 * because a link is the only thing this page is ever given:
 *
 *   ?emjson=<url>     the document to read (the Catalog's own link shape)
 *   ?study=<id>       a study id, resolved against ?catalog= (or the same origin)
 *   ?narrative=<id>   which narrative, when the study holds several
 *   ?token=<jwt>      for a restricted study; a viewer cannot set a header
 *
 * The token is used for the fetch and **not** kept: no localStorage, no cookie.
 * A link that carries a credential is already a compromise; making it durable
 * would be a second one.
 */

import { t } from "./i18n";
import { renderNarrativeView } from "./narrative";
import { mount3dViewer } from "./embed3d-native";
import { applyTheme, storedMode } from "./theme";
import type { EmDocument } from "./types";
import "./style.css";

// The theme is a `data-theme` stamp on <html> that the whole stylesheet keys
// off. The editor applies it at boot; this page has no boot, so without this
// line every token falls back and the result is dark text on a dark page —
// measured in a browser before it was fixed. `storedMode()` means a reader who
// chose dark in EMStudio gets dark here; a fresh visitor follows their system.
applyTheme(storedMode());

const params = new URLSearchParams(location.search);
const container = document.getElementById("viewer") as HTMLElement;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Something went wrong, said in a sentence a reader can act on.
 *
 *  Not a stack trace and not a blank page: the two most likely readers of this
 *  screen are somebody who followed a stale link and somebody who needs to log
 *  in, and both need to be told which. */
function problem(title: string, detail: string, hint = ""): void {
  container.textContent = "";
  const box = el("div", "nv-standalone-problem");
  box.appendChild(el("h1", undefined, title));
  box.appendChild(el("p", undefined, detail));
  if (hint) box.appendChild(el("p", "nv-embed-note", hint));
  container.appendChild(box);
}

/** Where the document is. `?emjson=` wins because it is what the Catalog's
 *  "open in…" hands out; `?study=` is the friendlier form of the same thing. */
function documentUrl(): string | null {
  const direct = params.get("emjson");
  if (direct) return direct;
  const study = params.get("study");
  if (!study) return null;
  const catalog = (params.get("catalog") ?? "").replace(/\/+$/, "");
  return `${catalog}/catalog/study/${encodeURIComponent(study)}/emjson`;
}

async function load(): Promise<void> {
  const url = documentUrl();
  if (!url) {
    problem(t("read.noStudy"), t("read.noStudyWhy"), t("read.noStudyHow"));
    return;
  }

  container.appendChild(el("p", "nv-embed-note", t("read.loading")));

  const token = params.get("token");
  let res: Response;
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (exc) {
    problem(t("read.unreachable"), t("read.couldNotFetch", { url }),
            String(exc));
    return;
  }

  if (res.status === 401 || res.status === 403) {
    // The visibility rule, from the reader's side: a restricted study is not
    // "broken", it is not published. Saying so is the difference between a
    // reader who logs in and a reader who reports a bug.
    problem(t("read.restricted"), t("read.restrictedWhy"),
            t("read.restrictedHow"));
    return;
  }
  if (!res.ok) {
    problem(t("read.notFound"),
            t("read.catalogAnswered", { status: String(res.status) }), url);
    return;
  }

  let doc: EmDocument;
  try {
    const raw = await res.json();
    doc = asDocument(raw);
  } catch (exc) {
    problem(t("read.unreadable"), t("read.unreadableWhy"), String(exc));
    return;
  }

  render(doc);
}

/**
 * A container (`{graphs: {...}}`) or a single-graph document — both are em.json,
 * and the reader should not have to know which one they were sent.
 *
 * `?graph=` picks a member when a container holds several; otherwise the active
 * one, otherwise the first. Guessing a member is fine here in a way it would not
 * be in an editor: nothing is written, and the choice is visible on screen.
 */
function asDocument(raw: unknown): EmDocument {
  const doc = raw as Record<string, unknown>;
  const graphs = doc["graphs"] as Record<string, unknown> | undefined;
  if (graphs && typeof graphs === "object") {
    const wanted = params.get("graph");
    const active = String(doc["active_graph_id"] ?? "");
    const id = (wanted && wanted in graphs) ? wanted
      : (active && active in graphs) ? active
      : Object.keys(graphs)[0];
    if (!id) throw new Error(t("read.emptyContainer"));
    return { header: doc["header"] as EmDocument["header"],
             graph: graphs[id] as EmDocument["graph"] };
  }
  if (!doc["graph"]) throw new Error(t("read.noGraph"));
  return raw as EmDocument;
}

function render(doc: EmDocument): void {
  const narrativeId = params.get("narrative");
  container.textContent = "";

  // read-only: the `editor` argument is deliberately not passed. That single
  // omission is what makes this page a viewer — there is no second code path,
  // and therefore no way for the two to drift.
  //
  // The 3D, on the other hand, is passed IN — and this is the only page that
  // does. Measured in P5b: three.js inlined into the editor's single-file build
  // cost +41% (1.96 → 2.76 MB), and the editor is a desk tool that reaches ATON
  // when it is online. This page is SERVED (by StratiGraph Catalog, by the field node),
  // so it is not bound by the one-file rule, and it is where a reader who was
  // handed a link should be able to turn the model with no ATON deployed
  // anywhere. Same reference, same contract, the engine only where it earns its
  // weight.
  renderNarrativeView(container, doc, narrativeId, () => { /* no selection UI */ },
                      undefined, undefined, undefined,
                      (host, spec) => {
                        mount3dViewer(host, spec.url, { label: spec.label });
                      });

  if (!container.textContent?.trim()) {
    problem(t("read.noNarrative"), t("read.noNarrativeWhy"));
    return;
  }

  const footer = el("footer", "nv-standalone-footer");
  footer.appendChild(el("span", undefined, t("read.footer")));
  // The claim this page can make and the export cannot, said out loud: a reader
  // deserves to know whether what they see is current or a frozen copy.
  footer.appendChild(el("span", "nv-embed-note", t("read.liveNote")));
  container.appendChild(footer);
}

void load();
