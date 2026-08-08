import type { DocumentStore, HdtoFields } from "./model";
import { edgeStyle, nodeStyle } from "./palette";
import { isGroupType, isStratigraphicType } from "./rules";
import { BADGE_RULES, resolveEffective, sourceLabel } from "./funnel";
import type { AuthorityCandidate, AuthorityRef, EmEdge, EmNode } from "./types";
import { qualiaList } from "./vocab";
import { getSettings } from "./settings";
import { createOsmMap } from "./osm-map";

export interface InspectorCallbacks {
  onJump: (nodeId: string) => void;
  onClose: () => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edge: EmEdge) => void;
  onToggleFold: (groupId: string) => void;
  onEnterGroup: (groupId: string) => void;
  /** create a phase (sub-epoch) inside this epoch */
  onAddPhase: (epochId: string) => void;
  /** toggle this epoch's phases between hidden (one lane) and shown (sub-bands) */
  onTogglePhases: (epochId: string) => void;
  /** whether this epoch's phases are currently shown as lane sub-bands */
  isPhasesVisible: (epochId: string) => boolean;
  /** delete a phase, prompting where to re-home its orphaned units */
  onDeletePhase: (phaseId: string) => void;
  /** delete a top-level epoch (cascades sub-phases, un-attributes its units) */
  onDeleteEpoch: (epochId: string) => void;
  /** move an (empty) epoch's swimlane up (-1) / down (+1), then relayout */
  onReorderEpoch: (epochId: string, dir: -1 | 1) => void;
  onReorderPhase: (phaseId: string, dir: -1 | 1) => void;
  /** attribute a unit to an epoch or one of its phases (retargets has_first_epoch) */
  onAssignEpoch: (nodeId: string, epochId: string) => void;
  /** pin/unpin a node's position (layout engine keeps pinned nodes in place) */
  onTogglePin: (nodeId: string) => void;
  isPinned: (nodeId: string) => boolean;
  /** Query em-bridge /resolve-authority for ranked offline candidates. Optional:
   *  when absent or on any failure the HDT-O authority field is plain free-text. */
  resolveAuthority?: (term: string, facet: string) => Promise<AuthorityCandidate[]>;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Coerce a stored colour to the #rrggbb an <input type=color> requires, or
 *  null if it isn't a recognisable hex (so the swatch can fall back). */
function toHexColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s))
    return (
      "#" +
      s
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    ).toLowerCase();
  return null;
}

// Authority facets (the P1-D resolver enum WHEN/WHAT/WHERE/WHO). Not EM node/
// edge types — a small resolver-side vocabulary, so it's fine to list here.
const AUTHORITY_FACETS = ["WHAT", "WHERE", "WHEN", "WHO"] as const;

/** The HC1 "Authority" sub-field: a facet selector + a URI/search input backed
 *  by em-bridge /resolve-authority (via cb.resolveAuthority). Typing a term
 *  shows ranked candidates; picking one stores the full P1-D ref. Fully offline
 *  and graceful: no resolver / any failure → plain free-text URI entry. */
function buildAuthorityField(
  panel: HTMLElement,
  inputs: Record<string, HTMLInputElement>,
  hdto: HdtoFields,
  cb: InspectorCallbacks,
  ref: {
    get: () => AuthorityRef | undefined;
    set: (r: AuthorityRef | undefined) => void;
    commit: () => void;
  },
): void {
  panel.appendChild(el("label", "insp-field-label", "Authority"));

  const facetSel = document.createElement("select");
  facetSel.className = "insp-name-input insp-facet-select";
  for (const f of AUTHORITY_FACETS) {
    const o = document.createElement("option");
    o.value = f;
    o.textContent = f;
    facetSel.appendChild(o);
  }
  // Default facet inferred from the node type this field annotates: this is the
  // HC1 Heritage Entity → WHERE (place). (Epoch→WHEN, qualia→WHAT elsewhere.)
  // User-overridable via the selector.
  facetSel.value = "WHERE";
  panel.appendChild(facetSel);

  const inp = document.createElement("input");
  inp.className = "insp-name-input";
  inp.value = hdto.heritageUri;
  inp.placeholder = "type to search an authority, or paste a URI";
  panel.appendChild(inp);
  inputs["heritageUri"] = inp;

  const badge = el("div", "insp-hint");
  const paintBadge = (): void => {
    const r = ref.get();
    if (r?.authority)
      badge.textContent = `✓ ${r.label ?? r.uri} — ${r.authority}${r.match ? ` (${r.match})` : ""}`;
    else if (cb.resolveAuthority)
      badge.textContent = "Offline resolver: type a term, pick a match, or paste a URI.";
    else badge.textContent = "Paste an authority URI (resolver unavailable).";
  };
  paintBadge();
  panel.appendChild(badge);

  const menu = el("div", "insp-auth-menu") as HTMLElement;
  menu.style.display = "none";
  panel.appendChild(menu);
  const closeMenu = (): void => {
    menu.innerHTML = "";
    menu.style.display = "none";
  };

  const renderCandidates = (cands: AuthorityCandidate[]): void => {
    menu.innerHTML = "";
    if (!cands.length) {
      menu.style.display = "none";
      return;
    }
    for (const c of cands) {
      const row = el("button", "insp-auth-item") as HTMLButtonElement;
      row.textContent = `${c.label ?? c.uri} — ${c.authority}${c.match ? ` (${c.match})` : ""}`;
      row.title = String(c.uri);
      row.addEventListener("click", () => {
        const picked: AuthorityRef = {
          uri: c.uri,
          authority: c.authority,
          label: c.label,
          rank: c.rank,
          match: c.match,
        };
        if (c.broader) picked.broader = c.broader;
        ref.set(picked);
        inp.value = c.uri;
        closeMenu();
        paintBadge();
        ref.commit();
      });
      menu.appendChild(row);
    }
    menu.style.display = "";
  };

  let timer: number | undefined;
  const queryNow = (): void => {
    const term = inp.value.trim();
    // a pasted URL is used verbatim (no search); empty / no resolver → nothing
    if (!cb.resolveAuthority || !term || /^https?:\/\//i.test(term)) {
      closeMenu();
      return;
    }
    void cb
      .resolveAuthority(term, facetSel.value)
      .then(renderCandidates)
      .catch(closeMenu);
  };

  inp.addEventListener("input", () => {
    ref.set(undefined); // manual edit → no longer a resolved pick
    paintBadge();
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(queryNow, 250);
  });
  inp.addEventListener("change", ref.commit); // blur/Enter → persist
  facetSel.addEventListener("change", queryNow);
}

export function renderInspector(
  root: HTMLElement,
  store: DocumentStore,
  nodeId: string | null,
  cb: InspectorCallbacks,
  selEdge: EmEdge | null = null,
): void {
  root.innerHTML = "";
  const node = nodeId ? store.node(nodeId) : undefined;
  if (selEdge && !nodeId) {
    // A connector is selected (no node): show its type + endpoints and a
    // Delete action, mirroring the per-node "Connections" rows.
    const es = edgeStyle(selEdge.edge_type);
    const nodeById = new Map(store.doc.graph.nodes.map((n) => [n.id, n]));
    const showId = getSettings().developer.showNodeIds;
    const nm = (id: string): string =>
      String(nodeById.get(id)?.name || (showId ? id : (nodeById.get(id)?.node_type ?? id)));
    const panel = el("div", "insp-canvas");
    panel.appendChild(el("div", "insp-section-title", "Connector"));
    const t = el("div", "insp-group-title", es.label);
    t.style.color = es.color;
    panel.appendChild(t);
    panel.appendChild(el("label", "insp-field-label", "From"));
    const from = el("button", "insp-link", `→ ${nm(selEdge.source)}`);
    from.addEventListener("click", () => cb.onJump(selEdge.source));
    panel.appendChild(from);
    panel.appendChild(el("label", "insp-field-label", "To"));
    const to = el("button", "insp-link", `→ ${nm(selEdge.target)}`);
    to.addEventListener("click", () => cb.onJump(selEdge.target));
    panel.appendChild(to);
    root.appendChild(panel);
    const danger = el("div", "insp-actions");
    const delE = el("button", "insp-btn danger", "Delete connector");
    delE.addEventListener("click", () => cb.onDeleteEdge(selEdge));
    danger.appendChild(delE);
    root.appendChild(danger);
    return;
  }
  if (!nodeId || !node) {
    // No node selected → show the canvas header metadata (name + id),
    // editable. These are what the GraphML/em.json header carries; the
    // richer base paradata (authors, license, …) become real nodes later.
    const g = store.doc.graph as Record<string, unknown> & {
      graph_id: string;
    };
    const panel = el("div", "insp-canvas");
    panel.appendChild(el("div", "insp-section-title", "Graph · dataset info"));

    panel.appendChild(el("label", "insp-field-label", "Name"));
    const nameIn = document.createElement("input");
    nameIn.className = "insp-name-input";
    nameIn.value = String((g["name"] as string | undefined) ?? "");
    nameIn.placeholder = "untitled graph";
    nameIn.addEventListener("change", () =>
      store.updateGraphMeta({ name: nameIn.value }),
    );
    panel.appendChild(nameIn);

    panel.appendChild(el("label", "insp-field-label", "ID"));
    const idIn = document.createElement("input");
    idIn.className = "insp-name-input insp-id-input";
    idIn.value = g.graph_id ?? "";
    idIn.addEventListener("change", () => {
      const v = idIn.value.trim();
      if (v) store.updateGraphMeta({ graph_id: v });
      else idIn.value = g.graph_id ?? "";
    });
    panel.appendChild(idIn);

    // ── CANVAS1 · graph-scope metadata (Data Funnel · DP-65) ───────────────
    // MIG1-A: author / licence / embargo are now first-class MEMBER nodes of a
    // graph-scope ParadataNodeGroup owned by the graph-self node — the GLOBAL
    // default of the funnel pyramid. A node with no more-specific value (its
    // own, its activity's, its epoch's) INHERITS these; the badge shows it
    // attenuated ("da Canvas") and the "Propagative metadata" row names the
    // source. DISTINCT from HDT-O "Author(s)" below (the Study's documentary
    // authorship) — this is the propagative default. The EM-ID is the graph's
    // human-readable site id, stored on the graph-self node (import-key detail
    // in IMP1). Editing writes REAL nodes via store.setGraphScope.
    panel.appendChild(
      el("h3", "insp-sect", "Graph metadata (global default)"),
    );
    const gscope = store.readGraphScope();
    const gfield = (
      key: "author" | "license" | "embargo" | "em_id",
      label: string,
      placeholder: string,
      hint: string,
    ): void => {
      panel.appendChild(el("label", "insp-field-label", label));
      const inp = document.createElement("input");
      inp.className = "insp-name-input";
      inp.value = gscope[key];
      inp.placeholder = placeholder;
      inp.addEventListener("change", () =>
        store.setGraphScope({ [key]: inp.value }),
      );
      panel.appendChild(inp);
      panel.appendChild(el("div", "insp-hint", hint));
    };
    gfield(
      "em_id",
      "EM-ID (site id)",
      "e.g. TM (Templu Mare)",
      "Human-readable identifier of this graph / site — the key used across the EM ecosystem (EMtools). Stored on the graph-self node.",
    );
    gfield(
      "author",
      "Author (default)",
      "e.g. M. Rossi",
      "Propagative default (graph-scope AuthorNode): nodes with no author of their own / their epoch / their activity inherit this. Distinct from the Study Author(s) below.",
    );
    gfield(
      "license",
      "Licence (default)",
      "e.g. CC-BY-NC",
      "Graph-scope LicenseNode. Inherited by nodes with no more-specific licence.",
    );
    gfield(
      "embargo",
      "Embargo (default)",
      "e.g. 24 (months)",
      "Graph-scope EmbargoNode. Inherited by nodes with no more-specific embargo.",
    );

    // ── GEO1 · site position (symbolic lon/lat) — DISTINCT from the shift ────
    // "Where the site is on the map": a graph-scope point (GraphNode.data.
    // site_position), separate from the GeoPositionNode SHIFT (the 3D anchor,
    // edited elsewhere). Pick on a mini-map or type lon/lat; empty = not
    // positioned (no fabricated 0/0). Read by the narrative mini-map / overview.
    panel.appendChild(el("h3", "insp-sect", "Site position (map)"));
    const sp0 = store.readSitePosition();
    const spStatus = el(
      "div",
      "insp-hint",
      sp0
        ? `Positioned · ${sp0.lat.toFixed(5)}, ${sp0.lon.toFixed(5)} (${sp0.crs})`
        : "Not positioned — pick a point on the map or type coordinates. Distinct from the 3D shift (GeoPositionNode).",
    );
    panel.appendChild(spStatus);

    const coordRow = el("div", "insp-geo-row");
    const latIn = document.createElement("input");
    latIn.className = "insp-name-input insp-geo-coord";
    latIn.placeholder = "lat";
    latIn.value = sp0 ? String(sp0.lat) : "";
    const lonIn = document.createElement("input");
    lonIn.className = "insp-name-input insp-geo-coord";
    lonIn.placeholder = "lon";
    lonIn.value = sp0 ? String(sp0.lon) : "";
    const commitCoords = (): void => {
      const lat = Number(latIn.value.trim());
      const lon = Number(lonIn.value.trim());
      if (latIn.value.trim() === "" && lonIn.value.trim() === "") {
        store.clearSitePosition();
        return;
      }
      if (Number.isFinite(lat) && Number.isFinite(lon))
        store.setSitePosition(lon, lat);
    };
    latIn.addEventListener("change", commitCoords);
    lonIn.addEventListener("change", commitCoords);
    coordRow.appendChild(latIn);
    coordRow.appendChild(lonIn);
    panel.appendChild(coordRow);

    const geoBtns = el("div", "insp-geo-row");
    const pickBtn = document.createElement("button");
    pickBtn.className = "insp-btn";
    pickBtn.type = "button";
    pickBtn.textContent = sp0 ? "Pick again on map" : "Pick on map";
    geoBtns.appendChild(pickBtn);
    if (sp0) {
      const clearBtn = document.createElement("button");
      clearBtn.className = "insp-btn";
      clearBtn.type = "button";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", () => store.clearSitePosition());
      geoBtns.appendChild(clearBtn);
    }
    panel.appendChild(geoBtns);

    // The picker mounts inline on demand — a click on the map drops the point
    // (setSitePosition), which re-renders this panel showing the coordinates.
    const mapHost = el("div", "insp-geo-map");
    panel.appendChild(mapHost);
    pickBtn.addEventListener("click", () => {
      if (mapHost.firstChild) {
        mapHost.textContent = "";
        return;
      }
      const map = createOsmMap({
        lat: sp0?.lat ?? 41.9,
        lon: sp0?.lon ?? 12.5,
        zoom: sp0 ? 15 : 4,
        markerLabel: "site",
        onPick: (lat, lon) => store.setSitePosition(lon, lat),
      });
      mapHost.appendChild(map.el);
      map.activate();
    });

    // ── HDT-O (ECHOES D7.1) per-graph panel ────────────────────────────────
    // This graph = a Study (HC9) whose proposition set (HC16) is about a
    // Heritage Entity (HC1, with its digital twin HC2), optionally under a
    // Project (HC13). Editing a field writes/updates REAL gated HDT-O nodes +
    // edges in the em.json (via store.applyHdto) — they are not in the
    // stratigrapher palette; this panel is their authoring surface.
    const hdto = store.readHdto();
    // text-valued fields only (heritageAuthorityRef is an object, handled below)
    type HdtoTextKey = Exclude<keyof HdtoFields, "heritageAuthorityRef">;
    const inputs = {} as Record<HdtoTextKey, HTMLInputElement>;
    // the authority candidate the user picked (verbatim uri/authority/label/
    // rank/match); cleared to free-text when the URI field is edited by hand.
    let pickedRef: AuthorityRef | undefined = hdto.heritageAuthorityRef;
    function commit(): void {
      store.applyHdto({
        studyTitle: inputs.studyTitle.value,
        studyAuthors: inputs.studyAuthors.value,
        studyDate: inputs.studyDate.value,
        heritageName: inputs.heritageName.value,
        heritageUri: inputs.heritageUri.value,
        heritageAuthorityRef: pickedRef,
        parentName: inputs.parentName.value,
        projectName: inputs.projectName.value,
      });
    }
    const hfield = (
      key: HdtoTextKey,
      label: string,
      placeholder: string,
      hint?: string,
    ): void => {
      panel.appendChild(el("label", "insp-field-label", label));
      const inp = document.createElement("input");
      inp.className = "insp-name-input";
      inp.value = hdto[key];
      inp.placeholder = placeholder;
      inp.addEventListener("change", commit);
      panel.appendChild(inp);
      if (hint) panel.appendChild(el("div", "insp-hint", hint));
      inputs[key] = inp;
    };

    panel.appendChild(el("h3", "insp-sect", "Heritage Digital Twin (HDT-O)"));
    panel.appendChild(
      el(
        "div",
        "insp-hint",
        "Optional — links this graph to its Heritage Digital Twin (enables the collaborative cloud + RDF projection). Stored as graph metadata, not on the canvas.",
      ),
    );

    const study = el("div", "insp-group-title", "Study (HC9)");
    panel.appendChild(study);
    hfield("studyTitle", "Title", "study title");
    hfield("studyAuthors", "Author(s)", "e.g. Rossi, Bianchi");
    hfield("studyDate", "Date", "e.g. 2026");

    panel.appendChild(el("div", "insp-group-title", "Heritage entity (HC1)"));
    hfield("heritageName", "Name", "e.g. Colosseo");
    buildAuthorityField(panel, inputs, hdto, cb, {
      get: () => pickedRef,
      set: (r) => (pickedRef = r),
      commit,
    });
    hfield("parentName", "Part of (parent entity)", "optional whole, e.g. Roma");

    panel.appendChild(el("div", "insp-group-title", "Project (HC13)"));
    hfield("projectName", "Name", "optional project");

    panel.appendChild(
      el("div", "insp-empty", "Select a node to inspect it"),
    );
    root.appendChild(panel);
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
  const nameRow = el("div", "insp-name-row");
  const nameInput = document.createElement("input");
  nameInput.className = "insp-name-input";
  nameInput.value = String(node.name || "");
  nameInput.placeholder = node.id;
  nameInput.addEventListener("change", () =>
    store.updateNode(nodeId, { name: nameInput.value }),
  );

  // Colour swatch next to the name: a round colour-picker + a hex field you can
  // paste into. Shown for epochs (always) and any node that already carries a
  // colour (node.data.color — lifted from the s3dgraphy node attributes). Both
  // controls write node.data.color and stay in sync.
  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const hasColor =
    node.node_type === "EpochNode" || typeof nodeData.color === "string";
  if (hasColor) {
    const stored = typeof nodeData.color === "string" ? nodeData.color : "";
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.className = "insp-color-swatch";
    swatch.value = toHexColor(stored) ?? "#cccccc";
    swatch.title = "Colour — click to pick";
    const hex = document.createElement("input");
    hex.type = "text";
    hex.className = "insp-color-hex";
    hex.value = stored;
    hex.placeholder = "#RRGGBB";
    hex.title = "Paste or type a hex colour (#RRGGBB)";
    const apply = (v: string): void => {
      const d = {
        ...((store.node(nodeId)?.data ?? {}) as Record<string, unknown>),
      };
      const val = v.trim();
      if (val === "") delete d.color;
      else d.color = val;
      store.updateNode(nodeId, { data: d });
    };
    swatch.addEventListener("input", () => {
      hex.value = swatch.value;
      apply(swatch.value);
    });
    hex.addEventListener("change", () => {
      const nm = toHexColor(hex.value);
      if (nm) swatch.value = nm;
      apply(hex.value);
    });
    nameRow.appendChild(swatch);
    nameRow.appendChild(nameInput);
    nameRow.appendChild(hex);
  } else {
    nameRow.appendChild(nameInput);
  }
  root.appendChild(nameRow);
  // node UUID is developer-only noise — hidden unless the Developer setting is on
  if (getSettings().developer.showNodeIds)
    root.appendChild(el("div", "insp-id", node.id));

  // editable description — for a PropertyNode the value IS the description (EM
  // convention), so we skip the generic box and show a dedicated "Value" field
  // below instead (avoids two inputs bound to the same field).
  if (node.node_type !== "property") {
    const desc = document.createElement("textarea");
    desc.className = "insp-desc-input";
    desc.rows = 3;
    desc.placeholder = "description…";
    desc.value = String(node.description ?? "");
    desc.addEventListener("change", () =>
      store.updateNode(nodeId, { description: desc.value }),
    );
    root.appendChild(desc);
  }

  // PropertyNode value: the property's measured/asserted value, stored in
  // `description` (uniform with real EM data). For an epoch's absolute_time_*
  // property this mirrors back to the epoch's start_time/end_time, so editing
  // it here updates the Temporal bounds.
  if (node.node_type === "property") {
    const pdata = (node.data ?? {}) as Record<string, unknown>;
    root.appendChild(el("label", "insp-field-label", "Value"));
    const valIn = document.createElement("input");
    valIn.className = "insp-name-input";
    valIn.value = String(node.description ?? "");
    const ptype = String(pdata.property_type ?? "");
    valIn.placeholder =
      ptype.startsWith("absolute_time") ? "e.g. -27  (negative = BCE)" : "value…";
    valIn.addEventListener("change", () =>
      store.setPropertyValue(nodeId, valIn.value),
    );
    root.appendChild(valIn);
  }

  // position lock: pin/unpin so the layout engine can't move this node.
  {
    const pinned = cb.isPinned(nodeId);
    const bar = el("div", "insp-actions");
    const lock = el(
      "button",
      "insp-btn",
      pinned ? "🔒 Unlock position" : "🔓 Lock position",
    ) as HTMLButtonElement;
    lock.title = pinned
      ? "Let the layout engine move this node again"
      : "Freeze this node's position (immovable by Layout)";
    lock.addEventListener("click", () => cb.onTogglePin(nodeId));
    bar.appendChild(lock);
    root.appendChild(bar);
  }

  // epoch controls: reorder its swimlane + temporal bounds (start/end).
  // Bounds are EpochNode attributes (CIDOC P82a/P82b); the labels borrow the
  // qualia vocabulary's rationale/example so the meaning is explicit.
  if (node.node_type === "EpochNode") {
    const parentEpoch = store.parentEpoch(nodeId);
    const isPhase = parentEpoch != null;
    if (isPhase) {
      // a phase (sub-epoch) — show its parent, no swimlane reorder
      root.appendChild(el("div", "insp-field-label", "Phase of"));
      const row = el("div", "insp-link-row");
      const pb = el(
        "button",
        "insp-link",
        `→ ${store.node(parentEpoch)?.name || parentEpoch}`,
      );
      pb.addEventListener("click", () => cb.onJump(parentEpoch));
      row.appendChild(pb);
      root.appendChild(row);
      // POL1: phases move like epochs. They did not, which made the sub-band
      // stack feel frozen — the only way to change it was to date the phases.
      //
      // Disabled when the phase (or the sibling it would swap with) HAS a date:
      // the band stack is sorted on `start_time`, so the move would be undone
      // immediately. `store.canReorderPhase` owns that rule, so the button and
      // the action cannot disagree about when it is possible.
      const phBar = el("div", "insp-actions");
      const phUp = el("button", "insp-btn", "▲ Move up") as HTMLButtonElement;
      const phDown = el("button", "insp-btn", "▼ Move down") as HTMLButtonElement;
      for (const [b, dir] of [
        [phUp, -1],
        [phDown, 1],
      ] as const) {
        const can = store.canReorderPhase(nodeId, dir);
        b.disabled = !can;
        b.title = can
          ? `Move this phase ${dir < 0 ? "up (newer)" : "down (older)"}`
          : store.isDated(nodeId)
            ? "This phase is dated — its position follows its date. Change the " +
              "date to move it."
            : "No sibling phase in that direction";
        b.addEventListener("click", () => cb.onReorderPhase(nodeId, dir));
      }
      phBar.appendChild(phUp);
      phBar.appendChild(phDown);
      root.appendChild(phBar);

      const delBar = el("div", "insp-actions");
      const delPh = el("button", "insp-btn danger", "Delete phase") as HTMLButtonElement;
      delPh.title = "Remove this phase; its units move to a chosen epoch";
      delPh.addEventListener("click", () => cb.onDeletePhase(nodeId));
      delBar.appendChild(delPh);
      root.appendChild(delBar);
    } else {
      // top-level epoch: reorder its swimlane — only allowed while empty (a
      // populated epoch can't move without risking upward-connection errors)
      const empty = store.isEpochEmpty(nodeId);
      const bar = el("div", "insp-actions");
      const up = el("button", "insp-btn", "▲ Move up") as HTMLButtonElement;
      const down = el("button", "insp-btn", "▼ Move down") as HTMLButtonElement;
      for (const [b, dir] of [
        [up, -1],
        [down, 1],
      ] as const) {
        b.disabled = !empty;
        b.title = empty
          ? `Move this epoch's swimlane ${dir < 0 ? "up (newer)" : "down (older)"}`
          : "Can't reorder a populated epoch (would risk upward connections)";
        b.addEventListener("click", () => cb.onReorderEpoch(nodeId, dir));
      }
      bar.appendChild(up);
      bar.appendChild(down);
      root.appendChild(bar);
    }

    root.appendChild(el("h3", "insp-sect", "Temporal bounds"));
    const qs = qualiaList();
    const mkField = (
      label: string,
      which: "start" | "end",
      key: string,
      qid: string,
    ): void => {
      root.appendChild(el("label", "insp-field-label", label));
      const inp = document.createElement("input");
      inp.className = "insp-name-input";
      const cur = ((node as EmNode).data ?? {}) as Record<string, unknown>;
      inp.value = cur[key] != null ? String(cur[key]) : "";
      inp.placeholder = "e.g. -27  (negative = BCE)";
      inp.addEventListener("change", () => {
        // authoring a bound sets up the temporal paradata so the value also
        // lives on its absolute_time_* PropertyNode (two-way synced)
        store.ensureEpochTemporalParadata(nodeId);
        store.setEpochBound(nodeId, which, inp.value);
      });
      root.appendChild(inp);
      const q = qs.find((x) => x.id === qid);
      if (q?.rationale)
        root.appendChild(
          el("div", "insp-hint", q.example ? `${q.rationale} e.g. ${q.example}` : q.rationale),
        );
    };
    mkField("Start", "start", "start_time", "absolute_time_start");
    mkField("End", "end", "end_time", "absolute_time_end");

    // Temporal paradata: the absolute_time_start / absolute_time_end
    // PropertyNodes live in the epoch's ParadataNodeGroup (created by default —
    // ensured on epoch creation / load). Double-click the box in the lane to
    // open the group and attach a provenance chain to either bound.
    root.appendChild(el("h3", "insp-sect", "Temporal paradata"));
    const pdgId = store.epochParadataGroup(nodeId);
    if (pdgId) {
      const props = store.doc.graph.edges
        .filter(
          (e) => e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId,
        )
        .map((e) => store.node(e.source))
        .filter((n): n is EmNode => !!n && n.node_type === "property");
      for (const p of props) {
        const v = p.description; // property value lives in description
        const row = el("div", "insp-link-row");
        const b = el(
          "button",
          "insp-link",
          `→ ${p.name || p.id}${v != null && v !== "" ? ` = ${v}` : ""}`,
        );
        b.addEventListener("click", () => cb.onJump(p.id));
        row.appendChild(b);
        root.appendChild(row);
      }
      root.appendChild(
        el("div", "insp-hint", "Double-click the box in the lane to open it."),
      );
    }

    // Phases (sub-epochs): ONLY a top-level epoch manages phases. A phase gets
    // no sub-epochs (E.D.: keep periodisation one level deep for now) — so the
    // whole section (list + "Add phase") is hidden on a phase; "Delete phase"
    // (above) stays.
    if (!isPhase) {
      root.appendChild(el("h3", "insp-sect", "Phases"));
      const phases = store.epochPhases(nodeId);
      for (const ph of phases) {
        const pn = store.node(ph);
        const pd = (pn?.data ?? {}) as Record<string, unknown>;
        const span =
          pd.start_time != null || pd.end_time != null
            ? `  (${pd.start_time ?? "?"}–${pd.end_time ?? "?"})`
            : "";
        const row = el("div", "insp-link-row");
        const b = el("button", "insp-link", `→ ${pn?.name || ph}${span}`);
        b.addEventListener("click", () => cb.onJump(ph));
        row.appendChild(b);
        const col =
          typeof pd.color === "string" && toHexColor(pd.color) ? pd.color : null;
        if (col) {
          const dot = el("span", "insp-phase-dot");
          (dot as HTMLElement).style.background = col as string;
          row.insertBefore(dot, b);
        }
        root.appendChild(row);
      }
      const pbar = el("div", "insp-actions");
      const addPh = el("button", "insp-btn", "+ Add phase") as HTMLButtonElement;
      addPh.title = "Create a phase (sub-epoch) inside this epoch";
      addPh.addEventListener("click", () => cb.onAddPhase(nodeId));
      pbar.appendChild(addPh);
      root.appendChild(pbar);
    }

    // coherence warnings (start/end order, phases within the parent span, …)
    const warns = store.epochCoherenceWarnings(nodeId);
    if (warns.length) {
      const box = el("div", "insp-warn");
      box.appendChild(el("div", "insp-warn-title", "⚠ Coherence"));
      for (const w of warns) box.appendChild(el("div", "insp-warn-item", w));
      root.appendChild(box);
    }

    // Phase bands (view state): its own section at the end. Bands show by
    // DEFAULT; this collapses/expands ALL of THIS epoch's phases at once, and
    // is reachable from the epoch OR any of its phases (always targets the
    // top-level epoch = the lane).
    let topEpoch = nodeId;
    const seenTop = new Set<string>();
    while (store.parentEpoch(topEpoch) && !seenTop.has(topEpoch)) {
      seenTop.add(topEpoch);
      topEpoch = store.parentEpoch(topEpoch)!;
    }
    if (store.epochPhases(topEpoch).length) {
      root.appendChild(el("h3", "insp-sect", "Phase bands"));
      const shown = cb.isPhasesVisible(topEpoch);
      const tog = el(
        "button",
        "insp-btn",
        shown ? "▾ Hide phase bands" : "▸ Show phase bands",
      ) as HTMLButtonElement;
      tog.title = shown
        ? "Collapse this epoch's phases back into a single lane"
        : "Split this epoch's lane into one sub-band per phase";
      tog.addEventListener("click", () => cb.onTogglePhases(topEpoch));
      const bar = el("div", "insp-actions");
      bar.appendChild(tog);
      root.appendChild(bar);
    }
  }

  // Phase attribution: for a unit whose epoch has phases, offer to move it to a
  // phase (or back to the epoch itself). Retargets its has_first_epoch. Shown
  // for any node that carries a has_first_epoch (stratigraphic / representation
  // units) whose epoch is phased.
  if (node.node_type !== "EpochNode") {
    const hfe = store.doc.graph.edges.find(
      (e) => e.edge_type === "has_first_epoch" && e.source === nodeId,
    );
    if (hfe) {
      const cur = hfe.target;
      const topEpoch = store.parentEpoch(cur) ?? cur;
      const phases = store.epochPhases(topEpoch);
      if (phases.length) {
        root.appendChild(el("h3", "insp-sect", "Phase"));
        const bar = el("div", "insp-actions");
        const mk = (id: string, label: string): void => {
          const b = el("button", "insp-btn", label) as HTMLButtonElement;
          if (id === cur) {
            b.disabled = true;
            b.textContent = `✓ ${label}`;
          }
          b.addEventListener("click", () => cb.onAssignEpoch(nodeId, id));
          bar.appendChild(b);
        };
        mk(topEpoch, `${store.node(topEpoch)?.name ?? "epoch"} (none)`);
        for (const ph of phases) mk(ph, store.node(ph)?.name ?? ph);
        root.appendChild(bar);
      }
    }
  }

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

  // FUNNEL1 · "Propagative metadata" — the value + provenance of each propagative
  // property (author/license/embargo), resolved Node → Activity → Epoch → Canvas
  // (first non-null, substitutive). Mirrors EMtools' draw_propagative_metadata:
  // it is a PRESENTATION of the resolver — nothing is written to em.json. Shown
  // for stratigraphic referents (the nodes that inherit down the funnel).
  if (nodeId && isStratigraphicType(node.node_type)) {
    const rows: { rule: string; value: string; src: string; own: boolean }[] = [];
    for (const rule of BADGE_RULES) {
      const eff = resolveEffective(store.doc, nodeId, rule);
      if (eff.value == null) continue;
      rows.push({
        rule,
        value: eff.value,
        src: sourceLabel(eff.source),
        own: eff.explicit,
      });
    }
    if (rows.length) {
      const details = el("details", "insp-propagative") as HTMLDetailsElement;
      details.open = true;
      const sum = el("summary", "insp-sect-summary", "Propagative metadata");
      details.appendChild(sum);
      for (const r of rows) {
        const row = el("div", `insp-prop-row${r.own ? " insp-prop-own" : " insp-prop-inherited"}`);
        row.appendChild(el("span", "insp-prop-rule", r.rule));
        row.appendChild(el("span", "insp-prop-value", r.value));
        // provenance: "proprio" when declared on the node, else "da Epoca …"
        const from = el("span", "insp-prop-source", r.own ? "proprio" : r.src);
        from.title = r.own
          ? "Dichiarato su questo nodo"
          : `Ereditato (${r.src}) — override dichiarandolo sul nodo`;
        row.appendChild(from);
        details.appendChild(row);
      }
      root.appendChild(details);
    }
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

  // Delete affordance is node-kind specific so nothing is ever orphaned:
  //  - a PHASE has "Delete phase" (re-homes its units/sub-phases) — added above.
  //  - a top-level EPOCH has "Delete epoch" (cascades sub-phases + swimlane +
  //    temporal PDG, un-attributes its units) — the generic "Delete node" would
  //    leave a phantom lane and orphan PDG.
  //  - anything else uses the generic "Delete node".
  const isPhaseNode =
    node.node_type === "EpochNode" && store.parentEpoch(nodeId) != null;
  const isTopEpoch = node.node_type === "EpochNode" && !isPhaseNode;
  if (isTopEpoch) {
    const danger = el("div", "insp-actions");
    const delEp = el("button", "insp-btn danger", "Delete epoch");
    delEp.addEventListener("click", () => cb.onDeleteEpoch(nodeId));
    danger.appendChild(delEp);
    root.appendChild(danger);
  } else if (!isPhaseNode) {
    const danger = el("div", "insp-actions");
    const delNode = el("button", "insp-btn danger", "Delete node");
    delNode.addEventListener("click", () => cb.onDeleteNode(nodeId));
    danger.appendChild(delNode);
    root.appendChild(danger);
  }
}
