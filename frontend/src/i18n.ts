/**
 * i18n for EMStudio's **chrome** — buttons, tabs, panel labels, Settings.
 *
 * Three things are translated in this project and they are on separate tracks;
 * this module is only the first:
 *
 * 1. **the UI chrome** — here.
 * 2. **node labels** (the EM vocabulary) — DP-63, in the s3Dgraphy datamodel with
 *    `@lang`. Never hardcoded here: invariant 1 says the datamodel is the single
 *    source of truth for the language, and a translated node type living in the
 *    frontend would be a second vocabulary.
 * 3. **narrative content** — marked with its language of ingest, translated by a
 *    model and then validated by a person. A different problem entirely: chrome
 *    is written once by us, content is authored by archaeologists.
 *
 * **No framework.** A dictionary and a lookup, in a leaf module that imports
 * nothing — which is what keeps it compatible with the single-file bundle and
 * free of any import cycle with `settings.ts`.
 *
 * **Missing translations fall back to English**, and what is missing is stated
 * rather than implied. Two different facts are tracked, because after the six
 * other languages were drafted they stopped being the same fact:
 *
 * * `coverage(locale)` — how many keys the dictionary answers. 100% for all eight.
 * * `isValidated(locale)` — whether a **person** has read it. True for `en` and
 *   `it` only; the other six are AI drafts (2026-08-04) awaiting E.D.
 *
 * Keeping them apart is the same discipline the narrative track applies to
 * generated prose: a machine translation that presents itself as finished is the
 * failure, not the translation. An archaeologist reading the Greek chrome cannot
 * tell a guessed term from a checked one, so the selector says which it is.
 */

export type Locale = "en" | "it" | "el" | "he" | "es" | "pl" | "ro" | "fr";

export interface LocaleInfo {
  code: Locale;
  /** In the language itself: a list of languages is for people who read them. */
  label: string;
  rtl?: boolean;
}

/** The eight project languages. `he` is right-to-left. */
export const LOCALES: LocaleInfo[] = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "el", label: "Ελληνικά" },
  { code: "he", label: "עברית", rtl: true },
  { code: "es", label: "Español" },
  { code: "pl", label: "Polski" },
  { code: "ro", label: "Română" },
  { code: "fr", label: "Français" },
];

type Dict = Record<string, string>;

// ── English: the reference dictionary, and the fallback for every other ───────
//
// Keys are namespaced by where they appear (`toolbar.`, `tab.`, `settings.`,
// `emtree.`, `empty.`, `toast.`) so a translator can work a screen at a time and
// an unused key is findable.
const EN: Dict = {
  // toolbar
  "toolbar.file": "File",
  "toolbar.new": "New",
  "toolbar.open": "Open…",
  "toolbar.save": "Save",
  "toolbar.saveAs": "Save As…",
  "toolbar.export": "Export",
  "ws.canvas": "Canvas",
  "ws.graphEditing": "Graph editing",
  "ws.ide": "IDE",
  "ws.addTitle": "New workspace from this arrangement",
  "ws.addPrompt": "Name for the new workspace",
  "ws.addDefault": "My workspace",
  "ws.renamePrompt": "Rename this workspace",
  "ws.close": "Close this workspace",
  "win.typeTitle": "Window type — transform this window",
  "win.modeTitle": "Mode — what THIS window is showing",
  "win.fitTitle": "Fit to this window (0)",
  "win.zoom1Title": "Actual size (zoom 100%)",
  "win.editTitle": "Write in this narrative (prose, order, blocks)",
  "win.aiTitle": "Data for the AI draft: provider, model, key",
  "win.geoTitle": "Site position: the point the chapter map reads",
  "mode.label": "{mode} Mode",
  "win.searchGraph": "Search this graph…",
  "win.searchTable": "Filter these rows…",
  "win.searchNarrative": "Search this narrative…",
  "win.splitDownIcon": "Split: a new area below",
  "ws.narrative": "Narrative",
  "ws.table": "Table",
  "ws.dtc": "DTC",
  "win.graph": "Graph",
  "win.narrative": "Narrative",
  "win.table": "Tabular",
  "win.tabular": "Tabular",
  "win.doc": "Doc",
  "win.emtree": "EMtree",
  "win.inspector": "Inspector",
  "win.viewer": "Viewer",
  "viewer.noSelection": "Select a node to preview what it points at.",
  "viewer.notPreviewable": "{name} has nothing this window can show.",
  "viewer.localPath": "This resource is a path on disk, which a page served over http cannot read. Previews work for resources with a URL (http/https, and MinIO when it arrives).",
  "viewer.unreachable": "The resource did not load — the URL is there, but nothing answered.",
  "viewer.openExternally": "Open in a new tab ↗",
  "win.storage": "Storage",
  "identity.none": "no author",
  "identity.noneTitle": "Nobody is authoring yet — declare your ORCID iD (Settings ▸ Identity). It works offline.",
  "identity.chipClaimed": "Author {orcid} — DECLARED, not verified. You can work and save; publishing as this person needs a verification.",
  "identity.chipVerified": "Author {orcid} — verified through ORCID. Publishing is unlocked.",
  "identity.stateNone": "No identity declared on this machine.",
  "identity.stateClaimed": "{orcid} — declared, not verified. Everything about preparing data works; publishing as this person does not.",
  "identity.stateVerified": "{orcid} — verified through ORCID.",
  "identity.knownOnThisMachine": "Identities known on this machine (several people, one field laptop):",
  "identity.use": "Use",
  "identity.forget": "Forget",
  "identity.switched": "now authoring as {orcid}",
  "identity.declared": "identity declared: {orcid} — you can work offline; verify when you have a connection",
  "identity.problem.empty": "type an ORCID iD (0000-0000-0000-0000).",
  "identity.problem.shape": "that is not the shape of an ORCID iD: 16 digits, the last one may be an X.",
  "identity.problem.checksum": "that iD fails its check digit — one digit is wrong or two are swapped. An iD with a valid shape but a bad checksum usually belongs to somebody else.",
  "identity.verifiedMock": "{orcid} verified — SIMULATED (mock provider): the real ORCID flow through Keycloak is not connected yet.",
  "identity.mismatch": "you declared {declared} but ORCID verified {verified}. Nothing was changed: only you know which is the mistake.",
  "identity.verifyFailed": "verification did not complete: {detail}",
  "identity.gateNoIdentity": "declare your ORCID iD to publish — it takes a moment and works offline.",
  "identity.gateNotVerified": "verify your ORCID to publish as {orcid}. Your work and your local saves are unaffected.",
  "identity.documentHasAnotherAuthor": "this document is authored by {orcid} — it was not re-attributed. Change the author in the Inspector if that is what you mean.",
  "identity.publishNotConnected": "identity verified — but the StratiGraph delivery is phase 2: there is nowhere to publish to yet.",
  "container.opened": "project opened — {n} graphs in the workspace",
  // MODES1 · the three operating modes, and what governs the live channel
  "mode.standalone": "Standalone",
  "mode.standaloneTitle": "On your own, on a local .em.json. No live connection: nothing you do leaves this window.",
  "mode.sidecar": "Sidecar",
  "mode.sidecarTitle": "Connected to a HOST that owns the graph (Blender/EMtools). The truth is still the em.json; the live channel is a convenience.",
  "mode.hub": "Hub",
  "mode.hubTitle": "Connected to an em-server (multi-user). NOT WIRED YET — the mode has a name, not a connection.",
  "mode.hubUnavailable": "Hub mode needs an em-server, which is not wired yet. Nothing was connected.",
  "sync.label": "Sync",
  "sync.hint": "On your own across two screens → both. More than one person working at once → off, or one direction. Nobody should have somebody else's selection imposed on them without choosing it.",
  "sync.dir.off": "Off",
  "sync.dir.send": "Send",
  "sync.dir.receive": "Receive",
  "sync.dir.both": "Both ways",
  "sync.dirTitle.off": "no echo: your selection does not leave, the host's does not arrive",
  "sync.dirTitle.send": "your selection shows up in the host; the host's does not come here",
  "sync.dirTitle.receive": "the host's selection shows up here; yours does not leave",
  "sync.dirTitle.both": "the two screens follow each other",
  "sync.dirLogged": "sync channel: {dir}",
  // CMD1 · the command channel (EMStudio conducts, Blender is the 3D arm)
  "cmd.blocked.disconnected": "Not connected to a host: there is no 3D scene to ask.",
  "cmd.blocked.noConsent": "The host does not accept commands. In Blender: EM Server ▸ Accept commands from EMStudio.",
  "cmd.sent": "asked the host: {verb} on {target}",
  "cmd.done": "{what} — done: {nodes} nodes and {edges} connections came back into the graph",
  "cmd.doneRepeat": "{what} — already done (same command): nothing was built twice",
  "cmd.failed": "{what} — refused: {error}",
  // P4.3 · the room client
  "hub.needsConfig": "Set the em-server URL and the room in Settings ▸ Live sync.",
  "hub.tokenPrompt": "Access token for the em-server (leave empty for a local server without auth). It is kept for this session only and never saved.",
  "hub.joined": "joined the room {room}",
  "hub.connected": "live in the room {room}",
  "hub.reconnecting": "connection lost — retry {n} in {s}s",
  "hub.resynced": "your local history was older than what the room still remembers: re-synced from the room's state, and {n} unconfirmed changes were re-sent as new ones",
  "sync.wireMismatch": "this host speaks another version of the sync protocol — see the log",
  "hub.somebody": "somebody",
  "hub.op.add_node": "created {subject}",
  "hub.op.remove_node": "deleted {subject}",
  "hub.op.add_edge": "connected {subject}",
  "hub.op.remove_edge": "disconnected {subject}",
  "annotator.iiifCopied": "{n} region(s) copied as W3C Web Annotation",
  "annotator.iiifNothing": "nothing to copy: this picture has no image service, or no regions yet",
  "annotator.iiifPastePrompt": "Paste a W3C Web Annotation (or an AnnotationPage):",
  "annotator.iiifBadJson": "that is not JSON",
  "annotator.iiifPasted": "{n} annotation(s) became regions of this graph",
  "annotator.iiifNoRegion": "no region could be read out of that",
  "annotator.importedRegion": "imported region",
  "annotator.miradorNeedsRoom": "Mirador needs a manifest it can fetch: join a room first (the manifest is served by em-server)",
  "hub.resent.structural": "{n} of them were sent to the room but could not be re-applied here: they will come back with the next snapshot",
  "hub.roster": "◍ {n} in the room",
  "hub.room": "room",
  "hub.selected": "selected",
  "hub.alone": "you are the only one here",
  "container.merged": "project integrated — {added} graphs added, {merged} merged, {nodes} shared nodes reconciled by UUID",
  // P3 · the dated merge: the conflicts are a reviewable notice, never an error
  "conflict.title": "{n} contested nodes",
  "conflict.hint": "The merge resolved by date: the more recent edit won. Nothing is lost here — the losing version can be put back, one node at a time.",
  "conflict.sentence": "{winner} ({winnerAt}) overwrote {loser} ({loserAt}) on {node}",
  "conflict.fields": "fields",
  "conflict.reason.newer": "more recent",
  "conflict.reason.tie": "same instant — stable tie-break (smaller iD)",
  "conflict.reason.unstamped": "one side carries no stamp: the date did NOT decide",
  "conflict.noStamp": "no date",
  "conflict.noAuthor": "unsigned",
  "conflict.reveal": "Show",
  "conflict.keepLoser": "Keep {who}'s version",
  "conflict.keepLoserTitle": "Put that node back to the version that lost. The content is theirs, the decision is yours — and the stamp records yours.",
  "conflict.kept": "Put back",
  "conflict.gone": "the node {node} is no longer in the project",
  "conflict.close": "Dismiss (the footer chip brings it back)",
  "conflict.chip": "⚑ {n} conflicts",
  "conflict.chipTitle": "Show the conflicts of the last integration",
  "conflict.logged": "conflict on {node}: {winner} ({winnerAt}) overwrote {loser} ({loserAt}) — {reason}",
  "conflict.revertLogged": "{node} put back to {who}'s version",
  "version.project": "Project",
  "version.digest": "content digest",
  "version.wasRevisionOf": "revision of",
  "version.modifiedAt": "modified",
  "version.hint": "The version advances only when the content changes — not on every save.",
  "version.pin": "Pin version…",
  "version.pinTitle": "Freeze the project as a citable snapshot. The DOI is minted by the Catalog; this is the stable thing it points at.",
  "version.pinned": "version v{v} pinned ({id})",
  "version.pinEmpty": "nothing to pin: the project has no graph yet",
  "container.addToProject": "Add to the project…",
  "container.addToProjectTitle": "Take another emj's graphs into this project (shared nodes merge by UUID — offline, no server)",
  "win.shelf": "Shelf",
  "shelf.count": "{n} resources",
  "shelf.empty": "The shelf is empty. Drag a file here from the Storage window, or paste a URI above. The browser shows every file on the disk; the shelf holds the ones you chose.",
  "shelf.added": "{name} on the shelf",
  "shelf.addedNoChecksum": "{name} on the shelf — WITHOUT a digest (the bridge did not answer): two copies of this file cannot be recognised as one.",
  "shelf.notAUri": "that is not a URI — it should start with http://, https:// or s3://.",
  "shelf.folderIsASource": "a folder is a SOURCE, not a shelf entry: open it in Storage and drag the files you want.",
  "shelf.saved": "shelf saved as a ShelfGraph — it reopens here, in Heriverse, or as a member of the multigraph",
  "shelf.opened": "shelf opened — {n} resources",
  "shelf.notAShelf": "that document is not a shelf (no ShelfGraph marker). Reading a study graph as a shelf would silently turn its documents into shelf entries.",
  "shelf.unreadable": "that file is not readable JSON.",
  "shelf.remove": "Remove from the shelf (the file is not touched)",
  "shelf.annotate": "Annotate",
  "shelf.annotateTitle": "Open this resource in the Annotator window",
  "shelf.sentToAnnotator": "{name} → Annotator",
  "shelf.noAnnotator": "no Annotator window open — transform one of the areas into an Annotator.",
  "shelf.recorded": "recorded on the resource",
  "shelf.inferred": "not recorded — this is the reading, not a claim",
  "shelf.scope.own-study": "own study",
  "shelf.scope.own-HDT": "own HDT",
  "shelf.scope.other-HDT": "comparandum",
  "shelf.residency.reference": "reference",
  "shelf.residency.resident": "resident",
  "annotator.pickFromShelf": "Pick a resource from the Shelf (the ▤▤ window) to annotate it.",
  "storage.addRoot": "Add folder…",
  "storage.addRootTitle": "Serve another folder (a library, a DOSCO, the excavation photos) — the browser sees that folder, not the whole disk.",
  "storage.rootAdded": "folder added: {name}",
  "storage.rootFailed": "the bridge did not add that folder: {detail}",
  "storage.rootPrompt": "Absolute path of the folder to serve:",
  "win.annotator": "Annotator",
  "win.maskPhase2": "Mask arrives in phase 2 — the datamodel declares the shape kind, nothing draws one yet.",
  "mode.view": "View",
  "mode.annotate": "Annotate",
  "mode.mask": "Mask",
  "tool.rect": "Rectangle",
  "tool.polygon": "Polygon",
  "tool.lasso": "Lasso",
  "tool.phase2": "Phase 2 — declared, not built.",
  "annotator.tools": "Tracing tools",
  "annotator.toolsNote": "Regions are recorded in normalised coordinates, so they follow the picture at any size.",
  "annotator.noImage": "Select a document or a resource with an image to annotate it.",
  "annotator.hintView": "View Mode — the picture only. Switch to Annotate to trace.",
  "annotator.hintDraw": "Drag to trace a rectangle; with the polygon tool, click each vertex (Esc clears).",
  "annotator.whatAreYouExtracting": "What are you extracting?",
  "annotator.target": "Unit (the claim is about…)",
  "annotator.noTarget": "— none for now —",
  "annotator.propertyType": "Property type",
  "annotator.choosePropertyType": "— what are you reading out? —",
  "annotator.propertyTypeRequired": "choose what you are extracting: it is part of the annotation, not a default.",
  "annotator.value": "Reading",
  "annotator.valuePlaceholder": "what you read here",
  "annotator.author": "Author",
  "annotator.points": "points",
  "annotator.commit": "Record the annotation",
  "annotator.cancel": "Discard",
  "annotator.committed": "annotation recorded — {n} node(s), {e} edge(s) in the graph",
  "annotator.alreadyThere": "this annotation was already in the graph — nothing added",
  "annotator.valueRequired": "the reading is the annotation: write what you see.",
  "annotator.polygonNeedsThree": "a polygon needs at least 3 points.",
  "viewer.missingFile": "The bridge looked: there is no file at this path any more.",
  "viewer.outsideRoots": "The bridge will not serve this file: it is outside the folders it was started with (--fs-root / EM_BRIDGE_FS_ROOTS).",
  "viewer.notDecodable": "{name} is an image no browser can draw (TIFF). It is part of the collection; the preview is not.",
  "viewer.emptyCollection": "{name} holds nothing this window can show.",
  "viewer.pages": "{n} pages",
  "storage.loading": "Reading…",
  "storage.roots": "Allowed folders",
  "storage.up": "Up one folder",
  "storage.upToRoots": "Back to the allowed folders",
  "storage.emptyFolder": "Empty folder.",
  "storage.bridgeDown": "em-bridge is not answering. A page cannot read the disk on its own: start it with ./dev.sh.",
  "storage.refused": "The bridge refused that path.",
  "storage.outside": "Outside the allowed folders — listed, but it cannot be opened.",
  "storage.minioPhase2": "MinIO arrives in phase 2: resources travel as a treefolder + JSON-LD, the object store comes after. The Mode is here because the decision is made, not because it works yet.",
  // the backends a Storage window can read, and the two readings of a collection
  "mode.filesystem": "Filesystem",
  "mode.minio": "MinIO",
  "mode.single": "Single",
  "mode.gallery": "Gallery",
  "panel.multigraph": "Multigraph",
  "panel.outliner": "Outliner",
  "panel.inspector": "Inspector",
  "panel.log": "Log",
  "panel.stratiminer": "StratiMiner",
  // WIN2 · the canvas projections a graph window can show
  "mode.matrix": "Matrix",
  "mode.graph": "Graph",
  "mode.dtc": "DTC",
  "mode.multigraph": "Multigraph",
  "win.add": "Add a graph window to this workspace",
  "win.splitRight": "Split: a new area to the right",
  "win.splitDown": "Split: a new area below",
  "win.join": "Join: absorb the neighbouring area",
  "win.defaultLayout": "IDE arrangement: editor + Tabular + EMtree/Inspector column",
  "tile.activate": "click to edit here",
  "tile.corner": "Drag inside to split this area, onto a neighbour to join it",
  "tile.tableNote": "Table — click to work here",
  "tile.docNote": "Documents — click to work here",
  "tile.narrativeNote": "Narrative — step in to read and write here",
  "tile.enterNote": "{name} — step in to work here",
  "tab.elsewhere": "This panel is open in a window — work on it there",
  "tile.panelTaken": "This panel is open in another area — step in to bring it here",
  "win.close": "Close this window",
  "win.maximize": "Magnify this window (Ctrl+Space)",
  "win.unmaximize": "Back to the arrangement (Ctrl+Space)",
  "doc.empty":
    "No document in this graph yet. Documents are the SOURCES the paradata chain hangs from — add one from the Documento menu, or from the Documents sheet of the table.",
  "doc.name": "ID (e.g. D.1)",
  "doc.title": "Title",
  "doc.filename": "Filename",
  "doc.year": "Year",
  "doc.description": "Description",
  "doc.extractors": "{n} extraction(s) hang from this document",
  "doc.reveal": "Show on the canvas",
  "dtc.empty":
    "DTC — no digital-twin chain in this graph yet (no dtc_ relation, no linked resource).",
  // the four provenance lanes of the DTC projection
  "dtc.laneInput": "Inputs",
  "dtc.laneProcess": "Processes",
  "dtc.laneOutput": "Products",
  "dtc.laneUse": "Used in the record",
  "toolbar.edit": "Edit",
  "toolbar.undoItem": "Undo",
  "toolbar.redoItem": "Redo",
  "toolbar.settingsItem": "Settings…",
  "toolbar.mode": "Mode",
  "toolbar.modeStandalone": "Standalone",
  "toolbar.modeSidecar": "Sidecar (sync)",
  "toolbar.modeHub": "Hub",
  "toolbar.tools": "Tools",
  "toolbar.palette": "Node palette",
  "palette.open": "Open the node palette",
  "palette.close": "Close the node palette",
  "toolbar.help": "Help",
  "toolbar.about": "About EMStudio",
  "toolbar.updates": "Check for updates…",
  "toolbar.ontologies": "Ontology models…",
  "toolbar.sync": "Sync",
  "toolbar.resources": "Resources",
  "toolbar.settings": "Settings",
  "toolbar.undo": "Undo",
  "toolbar.redo": "Redo",
  "toolbar.matrix": "Matrix",
  "toolbar.graph": "Graph",
  "toolbar.narrative": "Narrative",
  "toolbar.fit": "Fit",
  "toolbar.layout": "Layout",
  "toolbar.search": "Search nodes…",
  "toolbar.filters": "Filters — visible nodes/edges & display",
  "toolbar.importGraphml": "Import GraphML…",
  "matrix.addEpoch": "Add an epoch (the container units go into)",
  "matrix.epoch": "epoch",
  "layout.hideLeft": "Hide the palette",
  "layout.showLeft": "Show the palette",
  "layout.hideRight": "Hide the side panel",
  "layout.showRight": "Show the side panel",
  "stratiminer.browserPathHint":
    "In the browser a picker cannot reveal a full path — it fills in the name, " +
    "and you complete the path the bridge should read. The desktop app gives " +
    "the real path.",

  // right-hand panel tabs
  "tab.inspector": "Inspector",
  "tab.nodes": "Nodes",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "Log",
  "tab.emtreeTitle":
    "EMTree: the graphs open in this workspace, and their auxiliary files",
  "tab.logTitle": "Document warnings and activity log",

  // empty state
  "empty.drop": "Drop an {file} file here",
  "empty.or": "or",
  "empty.stratiminer": "build one from your sources",
  "empty.emtree": "open the workspace",

  // EMTree panel
  "emtree.intro":
    "The graphs open in this workspace. Click one to work on it — the canvas, " +
    "the Inspector and the narrative always show the active graph.",
  "emtree.new": "New graph",
  "emtree.open": "Open…",
  "emtree.empty": "No graph open yet.",
  "emtree.close": "Close this graph",
  "emtree.viewList": "List",
  "emtree.viewOverview": "Overview",
  "emtree.recent": "Recent files",
  "emtree.nodes": "nodes",
  "emtree.edges": "edges",
  "emtree.noFile": "not saved to a file yet",
  "emtree.noAux": "no auxiliary files",
  "emtree.auxFiles": "auxiliary file(s)",
  "emtree.auxNote":
    "Auxiliary sources (xlsx, pyArchInit, XML) attach to a graph and are " +
    "VOLATILE: they never enter the em.json unless you bake them. Mapping, " +
    "baking and the remote catalogues are still to come.",
  "emtree.unsaved": "\"{name}\" has unsaved changes. Close it anyway?",

  // settings
  "room.readOnly": "read-only",
  "room.readOnlyHint": "This room gives you the role “{role}”: you can read and "
    + "be seen, and the server refuses edits from here.",
  "room.roleUnknown": "viewer",
  "settings.title": "Settings",
  "settings.close": "Close",
  // The tab strip. One word each, because the strip is as wide as the dialog
  // and a label that wraps turns a row of tabs into a paragraph.
  "settings.tab.general": "General",
  "settings.tab.identity": "Identity",
  "settings.tab.sync": "Sync",
  "settings.tab.viewers": "Viewers",
  "settings.tab.advanced": "Advanced",
  "settings.language": "Language",
  "settings.languageHint":
    "The language of this interface. Node labels and narrative text are " +
    "separate: they travel with the document, not with the app.",
  "settings.translated": "translated",
  "settings.aiDraft": "AI draft, not yet validated",
  "settings.markValidated": "I have read this translation — mark it validated",
  "settings.markValidatedHint":
    "Turns off the “AI draft” badge on this computer. Fixing a wrong term is " +
    "still an edit to the dictionaries, and validating it for everyone is a " +
    "change in the source.",
  "settings.liveSync": "Live sync",
  "settings.hub": "Hub (em-server)",
  "settings.hubHint": "A room on an em-server: several people on the same study, live. The access token is asked for when you connect and is never saved.",
  "settings.developer": "Developer",
  "settings.interaction": "Interaction",
  "settings.aiProvider": "AI provider",
  "settings.viewer": "Viewer",
  "settings.iiif": "Images (IIIF)",
  "settings.save": "Save",
  "settings.cancel": "Cancel",

  // toasts / status
  "toast.activeGraph": "active graph: \"{name}\"",
  "toast.workspaceEmpty": "workspace empty — no graph open",
  "toast.openOrDrop": "open or drop an .em.json file",
};

// ── Italiano: complete, because E.D. works in it ───────────────────────────────
const IT: Dict = {
  "toolbar.file": "File",
  "toolbar.new": "Nuovo",
  "toolbar.open": "Apri…",
  "toolbar.save": "Salva",
  "toolbar.saveAs": "Salva come…",
  "toolbar.export": "Esporta",
  "ws.canvas": "Canvas",
  "ws.graphEditing": "Modifica grafo",
  "ws.ide": "IDE",
  "ws.addTitle": "Nuovo workspace da questa disposizione",
  "ws.addPrompt": "Nome del nuovo workspace",
  "ws.addDefault": "Mio workspace",
  "ws.renamePrompt": "Rinomina questo workspace",
  "ws.close": "Chiudi questo workspace",
  "win.typeTitle": "Tipo di finestra — trasforma questa finestra",
  "win.modeTitle": "Modo — che cosa mostra QUESTA finestra",
  "win.fitTitle": "Adatta a questa finestra (0)",
  "win.zoom1Title": "Dimensione reale (zoom 100%)",
  "win.editTitle": "Scrivi in questa narrativa (prosa, ordine, blocchi)",
  "win.aiTitle": "Dati per la bozza IA: provider, modello, key",
  "win.geoTitle": "Posizione del sito: il punto che legge la mappa del capitolo",
  "mode.label": "{mode} Mode",
  "win.searchGraph": "Cerca in questo grafo…",
  "win.searchTable": "Filtra queste righe…",
  "win.searchNarrative": "Cerca in questa narrativa…",
  "win.splitDownIcon": "Dividi: nuova area sotto",
  "ws.narrative": "Narrativa",
  "ws.table": "Tabella",
  "ws.dtc": "DTC",
  "win.graph": "Grafo",
  "win.narrative": "Narrativa",
  "win.table": "Tabular",
  "win.tabular": "Tabular",
  "win.doc": "Doc",
  "win.emtree": "EMtree",
  "win.inspector": "Ispettore",
  "win.viewer": "Viewer",
  "viewer.noSelection": "Seleziona un nodo per vedere l'anteprima di ciò a cui punta.",
  "viewer.notPreviewable": "{name} non ha nulla che questa finestra sappia mostrare.",
  "viewer.localPath": "Questa risorsa è un percorso su disco, che una pagina servita via http non può leggere. L'anteprima funziona per le risorse con URL (http/https, e MinIO quando arriverà).",
  "viewer.unreachable": "La risorsa non si è caricata — l'URL c'è, ma non ha risposto nessuno.",
  "viewer.openExternally": "Apri in una nuova scheda ↗",
  "win.storage": "Storage",
  "identity.none": "nessun autore",
  "identity.noneTitle": "Non sta firmando nessuno — dichiara il tuo ORCID iD (Impostazioni ▸ Identità). Funziona offline.",
  "identity.chipClaimed": "Autore {orcid} — DICHIARATO, non verificato. Puoi lavorare e salvare; per pubblicare come questa persona serve la verifica.",
  "identity.chipVerified": "Autore {orcid} — verificato con ORCID. Pubblicazione sbloccata.",
  "identity.stateNone": "Nessuna identità dichiarata su questa macchina.",
  "identity.stateClaimed": "{orcid} — dichiarato, non verificato. Tutta la preparazione dei dati funziona; pubblicare come questa persona no.",
  "identity.stateVerified": "{orcid} — verificato con ORCID.",
  "identity.knownOnThisMachine": "Identità note su questa macchina (più persone, un portatile da campo):",
  "identity.use": "Usa",
  "identity.forget": "Dimentica",
  "identity.switched": "ora firma {orcid}",
  "identity.declared": "identità dichiarata: {orcid} — puoi lavorare offline; verifica quando hai rete",
  "identity.problem.empty": "scrivi un ORCID iD (0000-0000-0000-0000).",
  "identity.problem.shape": "non è la forma di un ORCID iD: 16 cifre, l'ultima può essere una X.",
  "identity.problem.checksum": "quell'iD non supera la cifra di controllo — una cifra è sbagliata o due sono invertite. Un iD con la forma giusta e il checksum sbagliato di solito appartiene a qualcun altro.",
  "identity.verifiedMock": "{orcid} verificato — SIMULATO (provider mock): il flusso ORCID reale via Keycloak non è ancora collegato.",
  "identity.mismatch": "hai dichiarato {declared} ma ORCID ha verificato {verified}. Non è stato cambiato nulla: solo tu sai qual è l'errore.",
  "identity.verifyFailed": "la verifica non è andata a buon fine: {detail}",
  "identity.gateNoIdentity": "dichiara il tuo ORCID iD per pubblicare — è un attimo e funziona offline.",
  "identity.gateNotVerified": "verifica il tuo ORCID per pubblicare come {orcid}. Il tuo lavoro e i salvataggi locali non sono toccati.",
  "identity.documentHasAnotherAuthor": "questo documento è firmato da {orcid} — non è stato ri-attribuito. Se è quello che intendi, cambia l'autore nell'Ispettore.",
  "identity.publishNotConnected": "identità verificata — ma la consegna verso StratiGraph è fase 2: non c'è ancora dove pubblicare.",
  "container.opened": "progetto aperto — {n} grafi nello spazio di lavoro",
  "mode.standalone": "Standalone",
  "mode.standaloneTitle": "Da solo, su un .em.json locale. Nessuna connessione live: quello che fai non esce da questa finestra.",
  "mode.sidecar": "Sidecar",
  "mode.sidecarTitle": "Connesso a un HOST che possiede il grafo (Blender/EMtools). La verità resta l'em.json; il canale live è una comodità.",
  "mode.hub": "Hub",
  "mode.hubTitle": "Connesso a un em-server (più utenti). NON ANCORA CABLATO — il modo ha un nome, non una connessione.",
  "mode.hubUnavailable": "Il modo Hub richiede un em-server, che non è ancora cablato. Non è stato connesso niente.",
  "sync.label": "Sync",
  "sync.hint": "Da solo su due schermi → bidirezionale. In più persone → off, o una sola direzione. Nessuno deve subire la selezione di un altro senza averlo scelto.",
  "sync.dir.off": "Off",
  "sync.dir.send": "Invia",
  "sync.dir.receive": "Ricevi",
  "sync.dir.both": "Bidirezionale",
  "sync.dirTitle.off": "nessuna eco: la tua selezione non esce, quella dell'host non arriva",
  "sync.dirTitle.send": "la tua selezione si riflette nell'host; quella dell'host non viene qui",
  "sync.dirTitle.receive": "la selezione dell'host si riflette qui; la tua non esce",
  "sync.dirTitle.both": "i due schermi si seguono",
  "sync.dirLogged": "canale sync: {dir}",
  "cmd.blocked.disconnected": "Non connesso a un host: non c'è nessuna scena 3D a cui chiedere.",
  "cmd.blocked.noConsent": "L'host non accetta comandi. In Blender: EM Server ▸ Accetta comandi da EMStudio.",
  "cmd.sent": "chiesto all'host: {verb} su {target}",
  "cmd.done": "{what} — fatto: {nodes} nodi e {edges} connessioni sono rientrati nel grafo",
  "cmd.doneRepeat": "{what} — già fatto (stesso comando): non è stato costruito niente due volte",
  "cmd.failed": "{what} — rifiutato: {error}",
  "hub.needsConfig": "Imposta l'URL dell'em-server e la stanza in Impostazioni ▸ Live sync.",
  "hub.tokenPrompt": "Token di accesso per l'em-server (lascia vuoto per un server locale senza auth). Vale solo per questa sessione e non viene salvato.",
  "hub.joined": "sei entrato nella stanza {room}",
  "hub.connected": "in diretta nella stanza {room}",
  "hub.reconnecting": "connessione persa — tentativo {n} tra {s}s",
  "hub.resynced": "la tua storia locale era più vecchia di quel che la stanza ricorda: ri-sincronizzato dallo stato della stanza, e {n} modifiche non confermate sono state rimandate come nuove",
  "sync.wireMismatch": "questo host parla un'altra versione del protocollo di sync — vedi il log",
  "hub.somebody": "qualcuno",
  "hub.op.add_node": "ha creato {subject}",
  "hub.op.remove_node": "ha cancellato {subject}",
  "hub.op.add_edge": "ha collegato {subject}",
  "hub.op.remove_edge": "ha scollegato {subject}",
  "annotator.iiifCopied": "{n} regione/i copiate come W3C Web Annotation",
  "annotator.iiifNothing": "niente da copiare: questa immagine non ha un servizio IIIF, o non ha ancora regioni",
  "annotator.iiifPastePrompt": "Incolla una W3C Web Annotation (o una AnnotationPage):",
  "annotator.iiifBadJson": "non è JSON",
  "annotator.iiifPasted": "{n} annotazione/i sono diventate regioni di questo grafo",
  "annotator.iiifNoRegion": "non si è potuta leggere nessuna regione",
  "annotator.importedRegion": "regione importata",
  "annotator.miradorNeedsRoom": "Mirador ha bisogno di un manifest raggiungibile: entra prima in una stanza (il manifest lo serve em-server)",
  "hub.resent.structural": "{n} di queste sono state mandate alla stanza ma non rimesse qui: torneranno col prossimo snapshot",
  "hub.roster": "◍ {n} nella stanza",
  "hub.room": "stanza",
  "hub.selected": "selezionati",
  "hub.alone": "sei l'unico qui",
  "container.merged": "progetto integrato — {added} grafi aggiunti, {merged} fusi, {nodes} nodi condivisi riconciliati per UUID",
  "conflict.title": "{n} nodi contesi",
  "conflict.hint": "Il merge ha deciso per data: ha vinto la modifica più recente. Qui non si perde niente — la versione perdente si può rimettere, un nodo alla volta.",
  "conflict.sentence": "{winner} ({winnerAt}) ha sovrascritto {loser} ({loserAt}) su {node}",
  "conflict.fields": "campi",
  "conflict.reason.newer": "più recente",
  "conflict.reason.tie": "stesso istante — tie-break stabile (iD minore)",
  "conflict.reason.unstamped": "un lato non ha timbri: la data NON ha deciso",
  "conflict.noStamp": "senza data",
  "conflict.noAuthor": "non firmato",
  "conflict.reveal": "Mostra",
  "conflict.keepLoser": "Tieni la versione di {who}",
  "conflict.keepLoserTitle": "Rimette quel nodo alla versione che ha perso. Il contenuto è suo, la decisione è tua — e il timbro registra la tua.",
  "conflict.kept": "Rimessa",
  "conflict.gone": "il nodo {node} non è più nel progetto",
  "conflict.close": "Chiudi (il chip in basso lo riapre)",
  "conflict.chip": "⚑ {n} conflitti",
  "conflict.chipTitle": "Mostra i conflitti dell'ultima integrazione",
  "conflict.logged": "conflitto su {node}: {winner} ({winnerAt}) ha sovrascritto {loser} ({loserAt}) — {reason}",
  "conflict.revertLogged": "{node} rimesso alla versione di {who}",
  "version.project": "Progetto",
  "version.digest": "impronta del contenuto",
  "version.wasRevisionOf": "revisione di",
  "version.modifiedAt": "modificato",
  "version.hint": "La versione avanza solo quando cambia il contenuto — non a ogni salvataggio.",
  "version.pin": "Fissa versione…",
  "version.pinTitle": "Congela il progetto come istantanea citabile. Il DOI lo conia il Catalog; questa è la cosa stabile a cui punta.",
  "version.pinned": "versione v{v} fissata ({id})",
  "version.pinEmpty": "niente da fissare: il progetto non ha ancora un grafo",
  "container.addToProject": "Aggiungi al progetto…",
  "container.addToProjectTitle": "Innesta i grafi di un altro emj in questo progetto (i nodi condivisi si fondono per UUID — offline, nessun server)",
  "win.shelf": "Shelf",
  "shelf.count": "{n} risorse",
  "shelf.empty": "Lo shelf è vuoto. Trascina qui un file dalla finestra Storage, o incolla un URI qui sopra. Il browser mostra tutti i file del disco; lo shelf tiene quelli che hai scelto.",
  "shelf.added": "{name} sullo shelf",
  "shelf.addedNoChecksum": "{name} sullo shelf — SENZA impronta (il bridge non ha risposto): due copie di questo file non potranno essere riconosciute come una.",
  "shelf.notAUri": "non è un URI — dovrebbe iniziare per http://, https:// o s3://.",
  "shelf.folderIsASource": "una cartella è una SORGENTE, non una voce di shelf: aprila in Storage e trascina i file che vuoi.",
  "shelf.saved": "shelf salvato come ShelfGraph — si riapre qui, in Heriverse, o come membro del multigrafo",
  "shelf.opened": "shelf aperto — {n} risorse",
  "shelf.notAShelf": "quel documento non è uno shelf (manca il marcatore ShelfGraph). Leggere un grafo di studio come shelf trasformerebbe in silenzio i suoi documenti in voci di shelf.",
  "shelf.unreadable": "quel file non è JSON leggibile.",
  "shelf.remove": "Togli dallo shelf (il file non viene toccato)",
  "shelf.annotate": "Annota",
  "shelf.annotateTitle": "Apri questa risorsa nella finestra Annotatore",
  "shelf.sentToAnnotator": "{name} → Annotatore",
  "shelf.noAnnotator": "nessuna finestra Annotatore aperta — trasforma un'area in Annotatore.",
  "shelf.recorded": "registrato sulla risorsa",
  "shelf.inferred": "non registrato — è la lettura, non un'affermazione",
  "shelf.scope.own-study": "questo studio",
  "shelf.scope.own-HDT": "il mio HDT",
  "shelf.scope.other-HDT": "comparandum",
  "shelf.residency.reference": "riferimento",
  "shelf.residency.resident": "residente",
  "annotator.pickFromShelf": "Scegli una risorsa dallo Shelf (la finestra ▤▤) per annotarla.",
  "storage.addRoot": "Aggiungi cartella…",
  "storage.addRootTitle": "Servi un'altra cartella (una library, un DOSCO, le foto di scavo) — il browser vede quella cartella, non tutto il disco.",
  "storage.rootAdded": "cartella aggiunta: {name}",
  "storage.rootFailed": "il bridge non ha aggiunto la cartella: {detail}",
  "storage.rootPrompt": "Percorso assoluto della cartella da servire:",
  "win.annotator": "Annotatore",
  "win.maskPhase2": "La maschera arriva in fase 2 — il datamodel dichiara il tipo di forma, ma non la disegna ancora nessuno.",
  "mode.view": "Vista",
  "mode.annotate": "Annota",
  "mode.mask": "Maschera",
  "tool.rect": "Rettangolo",
  "tool.polygon": "Poligono",
  "tool.lasso": "Lazo",
  "tool.phase2": "Fase 2 — dichiarato, non ancora costruito.",
  "annotator.tools": "Strumenti di tracciamento",
  "annotator.toolsNote": "Le regioni sono registrate in coordinate normalizzate, quindi seguono l'immagine a qualsiasi dimensione.",
  "annotator.noImage": "Seleziona un documento o una risorsa con un'immagine per annotarla.",
  "annotator.hintView": "Modo Vista — solo l'immagine. Passa ad Annota per tracciare.",
  "annotator.hintDraw": "Trascina per tracciare un rettangolo; con il poligono clicca ogni vertice (Esc annulla).",
  "annotator.whatAreYouExtracting": "Cosa stai estraendo?",
  "annotator.target": "Unità (l'affermazione riguarda…)",
  "annotator.noTarget": "— nessuna per ora —",
  "annotator.propertyType": "Tipo di property",
  "annotator.choosePropertyType": "— cosa stai leggendo? —",
  "annotator.propertyTypeRequired": "scegli cosa stai estraendo: fa parte dell'annotazione, non è un default.",
  "annotator.value": "Lettura",
  "annotator.valuePlaceholder": "quello che leggi qui",
  "annotator.author": "Autore",
  "annotator.points": "punti",
  "annotator.commit": "Registra l'annotazione",
  "annotator.cancel": "Scarta",
  "annotator.committed": "annotazione registrata — {n} nodi, {e} archi nel grafo",
  "annotator.alreadyThere": "questa annotazione era già nel grafo — non è stato aggiunto nulla",
  "annotator.valueRequired": "la lettura È l'annotazione: scrivi cosa vedi.",
  "annotator.polygonNeedsThree": "un poligono ha bisogno di almeno 3 punti.",
  "viewer.missingFile": "Il bridge ha guardato: a questo percorso non c'è più nessun file.",
  "viewer.outsideRoots": "Il bridge non serve questo file: è fuori dalle cartelle con cui è stato avviato (--fs-root / EM_BRIDGE_FS_ROOTS).",
  "viewer.notDecodable": "{name} è un'immagine che nessun browser sa disegnare (TIFF). Fa parte della collezione; l'anteprima no.",
  "viewer.emptyCollection": "{name} non contiene nulla che questa finestra sappia mostrare.",
  "viewer.pages": "{n} pagine",
  "storage.loading": "Lettura…",
  "storage.roots": "Cartelle consentite",
  "storage.up": "Su di una cartella",
  "storage.upToRoots": "Torna alle cartelle consentite",
  "storage.emptyFolder": "Cartella vuota.",
  "storage.bridgeDown": "em-bridge non risponde. Una pagina non può leggere il disco da sola: avvialo con ./dev.sh.",
  "storage.refused": "Il bridge ha rifiutato quel percorso.",
  "storage.outside": "Fuori dalle cartelle consentite — elencato, ma non apribile.",
  "storage.minioPhase2": "MinIO arriva in fase 2: le risorse viaggiano come treefolder + JSON-LD, l'object storage viene dopo. Il Mode è qui perché la decisione è presa, non perché già funzioni.",
  // i backend che una finestra Storage sa leggere, e le due letture di una collezione
  "mode.filesystem": "Filesystem",
  "mode.minio": "MinIO",
  "mode.single": "Singola",
  "mode.gallery": "Gallery",
  "panel.multigraph": "Multigrafo",
  "panel.outliner": "Outliner",
  "panel.inspector": "Ispettore",
  "panel.log": "Registro",
  "panel.stratiminer": "StratiMiner",
  // WIN2 · la proiezione DTC
  "mode.matrix": "Matrix",
  "mode.graph": "Grafo",
  "mode.dtc": "DTC",
  "mode.multigraph": "Multigrafo",
  "win.add": "Aggiungi una finestra grafo a questo workspace",
  "win.splitRight": "Dividi: nuova area a destra",
  "win.splitDown": "Dividi: nuova area sotto",
  "win.join": "Unisci: assorbi l'area vicina",
  "win.defaultLayout": "Disposizione IDE: editor + Tabular + colonna EMtree/Ispettore",
  "tile.activate": "clicca per lavorare qui",
  "tile.corner": "Trascina dentro per dividere l'area, su una vicina per unirle",
  "tile.tableNote": "Tabella — clicca per lavorare qui",
  "tile.docNote": "Documenti — clicca per lavorare qui",
  "tile.narrativeNote": "Narrativa — entra per leggere e scrivere qui",
  "tile.enterNote": "{name} — entra per lavorare qui",
  "tab.elsewhere": "Questo pannello è aperto in una finestra — lavoraci lì",
  "tile.panelTaken": "Questo pannello è aperto in un'altra area — entra qui per portarcelo",
  "win.close": "Chiudi questa finestra",
  "win.maximize": "Magnifica questa finestra (Ctrl+Spazio)",
  "win.unmaximize": "Torna all'arrangiamento (Ctrl+Spazio)",
  "doc.empty":
    "Nessun documento in questo grafo. I documenti sono le FONTI da cui pende la catena paradata — aggiungine uno dal menu Documento, o dal foglio Documents della tabella.",
  "doc.name": "ID (es. D.1)",
  "doc.title": "Titolo",
  "doc.filename": "Nome file",
  "doc.year": "Anno",
  "doc.description": "Descrizione",
  "doc.extractors": "{n} estrazione/i pendono da questo documento",
  "doc.reveal": "Mostra sul canvas",
  "dtc.empty":
    "DTC — questo grafo non ha ancora una catena di gemello digitale (nessuna relazione dtc_, nessuna risorsa collegata).",
  "dtc.laneInput": "Ingressi",
  "dtc.laneProcess": "Processi",
  "dtc.laneOutput": "Prodotti",
  "dtc.laneUse": "Uso nel record",
  "toolbar.edit": "Modifica",
  "toolbar.undoItem": "Annulla",
  "toolbar.redoItem": "Ripristina",
  "toolbar.settingsItem": "Impostazioni…",
  "toolbar.mode": "Mode",
  "toolbar.modeStandalone": "Standalone",
  "toolbar.modeSidecar": "Sidecar (sync)",
  "toolbar.modeHub": "Hub",
  "toolbar.tools": "Strumenti",
  "toolbar.palette": "Palette nodi",
  "palette.open": "Apri la palette dei nodi",
  "palette.close": "Chiudi la palette dei nodi",
  "toolbar.help": "Aiuto",
  "toolbar.about": "Informazioni su EMStudio",
  "toolbar.updates": "Cerca aggiornamenti…",
  "toolbar.ontologies": "Modelli ontologici…",
  "toolbar.sync": "Sincronizza",
  "toolbar.resources": "Risorse",
  "toolbar.settings": "Impostazioni",
  "toolbar.undo": "Annulla",
  "toolbar.redo": "Ripeti",
  "toolbar.matrix": "Matrice",
  "toolbar.graph": "Grafo",
  "toolbar.narrative": "Narrativa",
  "toolbar.fit": "Adatta",
  "toolbar.layout": "Disponi",
  "toolbar.search": "Cerca nodi…",
  "toolbar.filters": "Filtri — nodi/archi visibili e visualizzazione",
  "toolbar.importGraphml": "Importa GraphML…",
  "matrix.addEpoch": "Aggiungi un'epoca (il contenitore in cui vanno le unità)",
  "matrix.epoch": "epoca",
  "layout.hideLeft": "Nascondi la palette",
  "layout.showLeft": "Mostra la palette",
  "layout.hideRight": "Nascondi il pannello laterale",
  "layout.showRight": "Mostra il pannello laterale",
  "stratiminer.browserPathHint":
    "Nel browser un picker non può rivelare il percorso completo — compila il " +
    "nome, e il percorso che il bridge deve leggere lo completi tu. L'app " +
    "desktop dà il percorso vero.",

  "tab.inspector": "Ispettore",
  "tab.nodes": "Nodi",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "Registro",
  "tab.emtreeTitle":
    "EMTree: i grafi aperti in questo spazio di lavoro, e i loro file ausiliari",
  "tab.logTitle": "Avvisi sul documento e registro delle attività",

  "empty.drop": "Trascina qui un file {file}",
  "empty.or": "oppure",
  "empty.stratiminer": "costruiscine uno dai tuoi dati",
  "empty.emtree": "apri lo spazio di lavoro",

  "emtree.intro":
    "I grafi aperti in questo spazio di lavoro. Cliccane uno per lavorarci — " +
    "il canvas, l'Ispettore e la narrativa mostrano sempre il grafo attivo.",
  "emtree.new": "Nuovo grafo",
  "emtree.open": "Apri…",
  "emtree.empty": "Nessun grafo aperto.",
  "emtree.close": "Chiudi questo grafo",
  "emtree.viewList": "Elenco",
  "emtree.viewOverview": "Panoramica",
  "emtree.recent": "File recenti",
  "emtree.nodes": "nodi",
  "emtree.edges": "archi",
  "emtree.noFile": "non ancora salvato su file",
  "emtree.noAux": "nessun file ausiliario",
  "emtree.auxFiles": "file ausiliari",
  "emtree.auxNote":
    "Le sorgenti ausiliarie (xlsx, pyArchInit, XML) si agganciano a un grafo e " +
    "sono VOLATILI: non entrano nell'em.json se non le si fa il bake. Mapping, " +
    "bake e cataloghi remoti sono ancora da fare.",
  "emtree.unsaved": "«{name}» ha modifiche non salvate. Chiuderlo comunque?",

  "room.readOnly": "sola lettura",
  "room.readOnlyHint": "In questa stanza hai il ruolo «{role}»: puoi leggere ed "
    + "essere visto, e il server rifiuta le modifiche fatte da qui.",
  "room.roleUnknown": "viewer",
  "settings.title": "Impostazioni",
  "settings.close": "Chiudi",
  "settings.tab.general": "Generale",
  "settings.tab.identity": "Identità",
  "settings.tab.sync": "Sync",
  "settings.tab.viewers": "Visori",
  "settings.tab.advanced": "Avanzate",
  "settings.language": "Lingua",
  "settings.languageHint":
    "La lingua di questa interfaccia. Le etichette dei nodi e il testo " +
    "narrativo sono un'altra cosa: viaggiano col documento, non con l'app.",
  "settings.translated": "tradotto",
  "settings.aiDraft": "bozza AI, non ancora validata",
  "settings.markValidated": "Ho letto questa traduzione — segnala come validata",
  "settings.markValidatedHint":
    "Spegne l'etichetta «bozza AI» su questo computer. Correggere un termine " +
    "sbagliato resta una modifica ai dizionari, e validarla per tutti è una " +
    "modifica nel codice.",
  "settings.liveSync": "Sincronizzazione live",
  "settings.hub": "Hub (em-server)",
  "settings.hubHint": "Una stanza su un em-server: più persone sullo stesso studio, in diretta. Il token di accesso viene chiesto al momento della connessione e non viene mai salvato.",
  "settings.developer": "Sviluppo",
  "settings.interaction": "Interazione",
  "settings.aiProvider": "Fornitore AI",
  "settings.viewer": "Visualizzatore",
  "settings.iiif": "Immagini (IIIF)",
  "settings.save": "Salva",
  "settings.cancel": "Annulla",

  "toast.activeGraph": "grafo attivo: «{name}»",
  "toast.workspaceEmpty": "spazio di lavoro vuoto — nessun grafo aperto",
  "toast.openOrDrop": "apri o trascina un file .em.json",
};

// ── The six other project languages: AI DRAFTS, awaiting validation ───────────
//
// Drafted by Claude on 2026-08-04 and **not yet endorsed by a person**. That
// distinction is tracked in `VALIDATED` below and shown in the language selector,
// for the same reason the narrative track marks an unendorsed draft: a machine
// translation that presents itself as finished is the failure mode, not the
// translation itself. E.D. validates; until then the selector says so.
//
// Conventions held across all six:
//
// * **proper nouns stay**: EMTree, StratiMiner, GraphML, em.json, xlsx,
//   pyArchInit, XML, AI. `bake` is kept as the English term on purpose — it is
//   this project's word for a specific operation (temporary→persistent), and
//   translating it would invent six different names for one thing.
// * **quotation marks follow the language**: « » (fr, es), „ " (pl, ro), « » (el),
//   " " (he). A dictionary that imported English quotes would look foreign in
//   every one of them.
// * **the `{name}` / `{file}` placeholders are preserved verbatim** — a
//   translated placeholder silently stops interpolating and prints the literal.

const EL: Dict = {
  "toolbar.file": "Αρχείο",
  "toolbar.new": "Νέο",
  "toolbar.open": "Άνοιγμα…",
  "toolbar.save": "Αποθήκευση",
  "toolbar.saveAs": "Αποθήκευση ως…",
  "toolbar.export": "Εξαγωγή",
  "toolbar.sync": "Συγχρονισμός",
  "toolbar.resources": "Πόροι",
  "toolbar.settings": "Ρυθμίσεις",
  "toolbar.undo": "Αναίρεση",
  "toolbar.redo": "Επανάληψη",
  "toolbar.matrix": "Μήτρα",
  "toolbar.graph": "Γράφος",
  "toolbar.narrative": "Αφήγηση",
  "toolbar.fit": "Προσαρμογή",
  "toolbar.layout": "Διάταξη",
  "toolbar.search": "Αναζήτηση κόμβων…",
  "toolbar.filters": "Φίλτρα — ορατοί κόμβοι/ακμές και εμφάνιση",
  "toolbar.importGraphml": "Εισαγωγή GraphML…",
  "matrix.addEpoch": "Προσθήκη εποχής (ο περιέκτης στον οποίο μπαίνουν οι μονάδες)",
  "matrix.epoch": "εποχή",
  "layout.hideLeft": "Απόκρυψη παλέτας",
  "layout.showLeft": "Εμφάνιση παλέτας",
  "layout.hideRight": "Απόκρυψη πλαϊνού πάνελ",
  "layout.showRight": "Εμφάνιση πλαϊνού πάνελ",
  "stratiminer.browserPathHint":
    "Στο πρόγραμμα περιήγησης ένας επιλογέας δεν μπορεί να αποκαλύψει την πλήρη " +
    "διαδρομή — συμπληρώνει το όνομα, και τη διαδρομή τη συμπληρώνετε εσείς. Η " +
    "εφαρμογή desktop δίνει την πραγματική διαδρομή.",

  "tab.inspector": "Επιθεωρητής",
  "tab.nodes": "Κόμβοι",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "Ημερολόγιο",
  "tab.emtreeTitle":
    "EMTree: οι γράφοι που είναι ανοιχτοί σε αυτόν τον χώρο εργασίας, και τα " +
    "βοηθητικά τους αρχεία",
  "tab.logTitle": "Προειδοποιήσεις εγγράφου και ημερολόγιο δραστηριότητας",

  "empty.drop": "Σύρετε εδώ ένα αρχείο {file}",
  "empty.or": "ή",
  "empty.stratiminer": "φτιάξτε έναν από τα δεδομένα σας",
  "empty.emtree": "ανοίξτε τον χώρο εργασίας",

  "emtree.intro":
    "Οι γράφοι που είναι ανοιχτοί σε αυτόν τον χώρο εργασίας. Κάντε κλικ σε " +
    "έναν για να εργαστείτε σε αυτόν — ο καμβάς, ο Επιθεωρητής και η αφήγηση " +
    "δείχνουν πάντα τον ενεργό γράφο.",
  "emtree.new": "Νέος γράφος",
  "emtree.open": "Άνοιγμα…",
  "emtree.empty": "Δεν έχει ανοίξει κανένας γράφος.",
  "emtree.close": "Κλείσιμο αυτού του γράφου",
  "emtree.nodes": "κόμβοι",
  "emtree.edges": "ακμές",
  "emtree.noFile": "δεν έχει αποθηκευτεί ακόμη σε αρχείο",
  "emtree.noAux": "κανένα βοηθητικό αρχείο",
  "emtree.auxFiles": "βοηθητικά αρχεία",
  "emtree.auxNote":
    "Οι βοηθητικές πηγές (xlsx, pyArchInit, XML) συνδέονται με έναν γράφο και " +
    "είναι ΠΤΗΤΙΚΕΣ: δεν μπαίνουν ποτέ στο em.json εκτός αν κάνετε bake. Η " +
    "αντιστοίχιση, το bake και οι απομακρυσμένοι κατάλογοι εκκρεμούν ακόμη.",
  "emtree.unsaved":
    "Το «{name}» έχει μη αποθηκευμένες αλλαγές. Να κλείσει παρόλα αυτά;",

  "settings.title": "Ρυθμίσεις",
  "settings.close": "Κλείσιμο",
  "settings.language": "Γλώσσα",
  "settings.languageHint":
    "Η γλώσσα αυτής της διεπαφής. Οι ετικέτες των κόμβων και το αφηγηματικό " +
    "κείμενο είναι ξεχωριστά: ταξιδεύουν με το έγγραφο, όχι με την εφαρμογή.",
  "settings.translated": "μεταφρασμένο",
  "settings.aiDraft": "πρόχειρο AI, δεν έχει επικυρωθεί ακόμη",
  "settings.markValidated":
    "Διάβασα αυτή τη μετάφραση — σημείωσέ την ως επικυρωμένη",
  "settings.markValidatedHint":
    "Σβήνει την ένδειξη «πρόχειρο AI» σε αυτόν τον υπολογιστή. Η διόρθωση ενός " +
    "λανθασμένου όρου παραμένει αλλαγή στα λεξικά, και η επικύρωση για όλους " +
    "είναι αλλαγή στον πηγαίο κώδικα.",
  "settings.liveSync": "Ζωντανός συγχρονισμός",
  "settings.developer": "Ανάπτυξη",
  "settings.interaction": "Αλληλεπίδραση",
  "settings.aiProvider": "Πάροχος AI",
  "settings.viewer": "Προβολέας 3D",
  "settings.save": "Αποθήκευση",
  "settings.cancel": "Άκυρο",

  "toast.activeGraph": "ενεργός γράφος: «{name}»",
  "toast.workspaceEmpty": "κενός χώρος εργασίας — κανένας ανοιχτός γράφος",
  "toast.openOrDrop": "ανοίξτε ή σύρετε ένα αρχείο .em.json",
};

const HE: Dict = {
  "toolbar.file": "קובץ",
  "toolbar.new": "חדש",
  "toolbar.open": "פתיחה…",
  "toolbar.save": "שמירה",
  "toolbar.saveAs": "שמירה בשם…",
  "toolbar.export": "ייצוא",
  "toolbar.sync": "סנכרון",
  "toolbar.resources": "משאבים",
  "toolbar.settings": "הגדרות",
  "toolbar.undo": "בטל",
  "toolbar.redo": "בצע שוב",
  "toolbar.matrix": "מטריצה",
  "toolbar.graph": "גרף",
  "toolbar.narrative": "נרטיב",
  "toolbar.fit": "התאמה",
  "toolbar.layout": "פריסה",
  "toolbar.search": "חיפוש צמתים…",
  "toolbar.filters": "מסננים — צמתים/קשתות מוצגים ותצוגה",
  "toolbar.importGraphml": "ייבוא GraphML…",
  "matrix.addEpoch": "הוסף תקופה (המכל שאליו נכנסות היחידות)",
  "matrix.epoch": "תקופה",
  "layout.hideLeft": "הסתר את הפלטה",
  "layout.showLeft": "הצג את הפלטה",
  "layout.hideRight": "הסתר את הפאנל הצדי",
  "layout.showRight": "הצג את הפאנל הצדי",
  "stratiminer.browserPathHint":
    "בדפדפן בורר קבצים אינו יכול לחשוף נתיב מלא — הוא ממלא את השם, ואת הנתיב " +
    "שהגשר צריך לקרוא אתה משלים. אפליקציית הדסקטופ נותנת את הנתיב האמיתי.",

  "tab.inspector": "מפקח",
  "tab.nodes": "צמתים",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "יומן",
  "tab.emtreeTitle": "EMTree: הגרפים הפתוחים במרחב העבודה הזה, וקבצי העזר שלהם",
  "tab.logTitle": "אזהרות המסמך ויומן הפעילות",

  "empty.drop": "גרור לכאן קובץ {file}",
  "empty.or": "או",
  "empty.stratiminer": "בנה אחד מהנתונים שלך",
  "empty.emtree": "פתח את מרחב העבודה",

  "emtree.intro":
    "הגרפים הפתוחים במרחב העבודה הזה. לחץ על אחד כדי לעבוד עליו — הבד, המפקח " +
    "והנרטיב מציגים תמיד את הגרף הפעיל.",
  "emtree.new": "גרף חדש",
  "emtree.open": "פתיחה…",
  "emtree.empty": "אין גרף פתוח.",
  "emtree.close": "סגור את הגרף הזה",
  "emtree.nodes": "צמתים",
  "emtree.edges": "קשתות",
  "emtree.noFile": "עדיין לא נשמר לקובץ",
  "emtree.noAux": "אין קבצי עזר",
  "emtree.auxFiles": "קבצי עזר",
  "emtree.auxNote":
    "מקורות עזר (xlsx, pyArchInit, XML) מתחברים לגרף והם נדיפים: הם לעולם לא " +
    "נכנסים ל-em.json אלא אם מבצעים bake. מיפוי, bake והקטלוגים המרוחקים עדיין " +
    "לפנינו.",
  "emtree.unsaved": "ל־\"{name}\" יש שינויים שלא נשמרו. לסגור בכל זאת?",

  "settings.title": "הגדרות",
  "settings.close": "סגור",
  "settings.language": "שפה",
  "settings.languageHint":
    "שפת הממשק הזה. תוויות הצמתים והטקסט הנרטיבי נפרדים: הם נעים עם המסמך, לא " +
    "עם האפליקציה.",
  "settings.translated": "מתורגם",
  "settings.aiDraft": "טיוטת AI, עדיין לא אומתה",
  "settings.markValidated": "קראתי את התרגום הזה — סמן אותו כמאומת",
  "settings.markValidatedHint":
    "מכבה את תווית «טיוטת AI» במחשב הזה. תיקון מונח שגוי הוא עדיין שינוי " +
    "במילונים, ואימות עבור כולם הוא שינוי בקוד המקור.",
  "settings.liveSync": "סנכרון חי",
  "settings.developer": "פיתוח",
  "settings.interaction": "אינטראקציה",
  "settings.aiProvider": "ספק AI",
  "settings.viewer": "מציג תלת־ממד",
  "settings.save": "שמירה",
  "settings.cancel": "ביטול",

  "toast.activeGraph": "גרף פעיל: \"{name}\"",
  "toast.workspaceEmpty": "מרחב העבודה ריק — אין גרף פתוח",
  "toast.openOrDrop": "פתח או גרור קובץ .em.json",
};

const ES: Dict = {
  "toolbar.file": "Archivo",
  "toolbar.new": "Nuevo",
  "toolbar.open": "Abrir…",
  "toolbar.save": "Guardar",
  "toolbar.saveAs": "Guardar como…",
  "toolbar.export": "Exportar",
  "toolbar.sync": "Sincronizar",
  "toolbar.resources": "Recursos",
  "toolbar.settings": "Ajustes",
  "toolbar.undo": "Deshacer",
  "toolbar.redo": "Rehacer",
  "toolbar.matrix": "Matriz",
  "toolbar.graph": "Grafo",
  "toolbar.narrative": "Narrativa",
  "toolbar.fit": "Ajustar",
  "toolbar.layout": "Disposición",
  "toolbar.search": "Buscar nodos…",
  "toolbar.filters": "Filtros — nodos/aristas visibles y visualización",
  "toolbar.importGraphml": "Importar GraphML…",
  "matrix.addEpoch": "Añadir una época (el contenedor donde van las unidades)",
  "matrix.epoch": "época",
  "layout.hideLeft": "Ocultar la paleta",
  "layout.showLeft": "Mostrar la paleta",
  "layout.hideRight": "Ocultar el panel lateral",
  "layout.showRight": "Mostrar el panel lateral",
  "stratiminer.browserPathHint":
    "En el navegador un selector no puede revelar la ruta completa — rellena el " +
    "nombre, y la ruta que el bridge debe leer la completas tú. La aplicación de " +
    "escritorio da la ruta real.",

  "tab.inspector": "Inspector",
  "tab.nodes": "Nodos",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "Registro",
  "tab.emtreeTitle":
    "EMTree: los grafos abiertos en este espacio de trabajo, y sus archivos " +
    "auxiliares",
  "tab.logTitle": "Avisos del documento y registro de actividad",

  "empty.drop": "Arrastra aquí un archivo {file}",
  "empty.or": "o",
  "empty.stratiminer": "constrúyelo a partir de tus datos",
  "empty.emtree": "abre el espacio de trabajo",

  "emtree.intro":
    "Los grafos abiertos en este espacio de trabajo. Haz clic en uno para " +
    "trabajar en él — el lienzo, el Inspector y la narrativa muestran siempre " +
    "el grafo activo.",
  "emtree.new": "Nuevo grafo",
  "emtree.open": "Abrir…",
  "emtree.empty": "No hay ningún grafo abierto.",
  "emtree.close": "Cerrar este grafo",
  "emtree.nodes": "nodos",
  "emtree.edges": "aristas",
  "emtree.noFile": "aún no guardado en un archivo",
  "emtree.noAux": "sin archivos auxiliares",
  "emtree.auxFiles": "archivos auxiliares",
  "emtree.auxNote":
    "Las fuentes auxiliares (xlsx, pyArchInit, XML) se vinculan a un grafo y " +
    "son VOLÁTILES: nunca entran en el em.json si no haces el bake. El mapeo, " +
    "el bake y los catálogos remotos están aún por llegar.",
  "emtree.unsaved": "«{name}» tiene cambios sin guardar. ¿Cerrarlo de todos modos?",

  "settings.title": "Ajustes",
  "settings.close": "Cerrar",
  "settings.language": "Idioma",
  "settings.languageHint":
    "El idioma de esta interfaz. Las etiquetas de los nodos y el texto " +
    "narrativo son otra cosa: viajan con el documento, no con la aplicación.",
  "settings.translated": "traducido",
  "settings.aiDraft": "borrador de IA, aún sin validar",
  "settings.markValidated": "He leído esta traducción — márcala como validada",
  "settings.markValidatedHint":
    "Apaga la etiqueta «borrador de IA» en este ordenador. Corregir un término " +
    "equivocado sigue siendo una edición de los diccionarios, y validarla para " +
    "todos es un cambio en el código fuente.",
  "settings.liveSync": "Sincronización en vivo",
  "settings.developer": "Desarrollo",
  "settings.interaction": "Interacción",
  "settings.aiProvider": "Proveedor de IA",
  "settings.viewer": "Visor 3D",
  "settings.save": "Guardar",
  "settings.cancel": "Cancelar",

  "toast.activeGraph": "grafo activo: «{name}»",
  "toast.workspaceEmpty": "espacio de trabajo vacío — ningún grafo abierto",
  "toast.openOrDrop": "abre o arrastra un archivo .em.json",
};

const PL: Dict = {
  "toolbar.file": "Plik",
  "toolbar.new": "Nowy",
  "toolbar.open": "Otwórz…",
  "toolbar.save": "Zapisz",
  "toolbar.saveAs": "Zapisz jako…",
  "toolbar.export": "Eksport",
  "toolbar.sync": "Synchronizacja",
  "toolbar.resources": "Zasoby",
  "toolbar.settings": "Ustawienia",
  "toolbar.undo": "Cofnij",
  "toolbar.redo": "Ponów",
  "toolbar.matrix": "Macierz",
  "toolbar.graph": "Graf",
  "toolbar.narrative": "Narracja",
  "toolbar.fit": "Dopasuj",
  "toolbar.layout": "Układ",
  "toolbar.search": "Szukaj węzłów…",
  "toolbar.filters": "Filtry — widoczne węzły/krawędzie i wyświetlanie",
  "toolbar.importGraphml": "Importuj GraphML…",
  "matrix.addEpoch": "Dodaj epokę (kontener, do którego wchodzą jednostki)",
  "matrix.epoch": "epoka",
  "layout.hideLeft": "Ukryj paletę",
  "layout.showLeft": "Pokaż paletę",
  "layout.hideRight": "Ukryj panel boczny",
  "layout.showRight": "Pokaż panel boczny",
  "stratiminer.browserPathHint":
    "W przeglądarce selektor nie może ujawnić pełnej ścieżki — wypełnia nazwę, a " +
    "ścieżkę, którą ma odczytać bridge, uzupełniasz sam. Aplikacja desktopowa " +
    "podaje prawdziwą ścieżkę.",

  "tab.inspector": "Inspektor",
  "tab.nodes": "Węzły",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "Dziennik",
  "tab.emtreeTitle":
    "EMTree: grafy otwarte w tym obszarze roboczym i ich pliki pomocnicze",
  "tab.logTitle": "Ostrzeżenia dokumentu i dziennik aktywności",

  "empty.drop": "Przeciągnij tutaj plik {file}",
  "empty.or": "lub",
  "empty.stratiminer": "zbuduj go ze swoich danych",
  "empty.emtree": "otwórz obszar roboczy",

  "emtree.intro":
    "Grafy otwarte w tym obszarze roboczym. Kliknij jeden, aby na nim " +
    "pracować — kanwa, Inspektor i narracja pokazują zawsze aktywny graf.",
  "emtree.new": "Nowy graf",
  "emtree.open": "Otwórz…",
  "emtree.empty": "Nie otwarto żadnego grafu.",
  "emtree.close": "Zamknij ten graf",
  "emtree.nodes": "węzły",
  "emtree.edges": "krawędzie",
  "emtree.noFile": "jeszcze nie zapisano do pliku",
  "emtree.noAux": "brak plików pomocniczych",
  "emtree.auxFiles": "pliki pomocnicze",
  "emtree.auxNote":
    "Źródła pomocnicze (xlsx, pyArchInit, XML) dołączają się do grafu i są " +
    "ULOTNE: nigdy nie wchodzą do em.json, dopóki nie wykonasz bake. " +
    "Mapowanie, bake i zdalne katalogi są jeszcze przed nami.",
  "emtree.unsaved": "„{name}” ma niezapisane zmiany. Zamknąć mimo to?",

  "settings.title": "Ustawienia",
  "settings.close": "Zamknij",
  "settings.language": "Język",
  "settings.languageHint":
    "Język tego interfejsu. Etykiety węzłów i tekst narracji to inna sprawa: " +
    "podróżują z dokumentem, nie z aplikacją.",
  "settings.translated": "przetłumaczone",
  "settings.aiDraft": "wersja robocza AI, jeszcze niezweryfikowana",
  "settings.markValidated":
    "Przeczytałem to tłumaczenie — oznacz je jako zweryfikowane",
  "settings.markValidatedHint":
    "Wyłącza znacznik „wersja robocza AI” na tym komputerze. Poprawienie błędnego " +
    "terminu to nadal zmiana w słownikach, a weryfikacja dla wszystkich to " +
    "zmiana w kodzie źródłowym.",
  "settings.liveSync": "Synchronizacja na żywo",
  "settings.developer": "Programowanie",
  "settings.interaction": "Interakcja",
  "settings.aiProvider": "Dostawca AI",
  "settings.viewer": "Przeglądarka 3D",
  "settings.save": "Zapisz",
  "settings.cancel": "Anuluj",

  "toast.activeGraph": "aktywny graf: „{name}”",
  "toast.workspaceEmpty": "obszar roboczy pusty — brak otwartego grafu",
  "toast.openOrDrop": "otwórz lub przeciągnij plik .em.json",
};

const RO: Dict = {
  "toolbar.file": "Fișier",
  "toolbar.new": "Nou",
  "toolbar.open": "Deschide…",
  "toolbar.save": "Salvează",
  "toolbar.saveAs": "Salvează ca…",
  "toolbar.export": "Export",
  "toolbar.sync": "Sincronizare",
  "toolbar.resources": "Resurse",
  "toolbar.settings": "Setări",
  "toolbar.undo": "Anulează",
  "toolbar.redo": "Refă",
  "toolbar.matrix": "Matrice",
  "toolbar.graph": "Graf",
  "toolbar.narrative": "Narațiune",
  "toolbar.fit": "Încadrează",
  "toolbar.layout": "Aranjare",
  "toolbar.search": "Caută noduri…",
  "toolbar.filters": "Filtre — noduri/muchii vizibile și afișare",
  "toolbar.importGraphml": "Importă GraphML…",
  "matrix.addEpoch": "Adaugă o epocă (containerul în care intră unitățile)",
  "matrix.epoch": "epocă",
  "layout.hideLeft": "Ascunde paleta",
  "layout.showLeft": "Arată paleta",
  "layout.hideRight": "Ascunde panoul lateral",
  "layout.showRight": "Arată panoul lateral",
  "stratiminer.browserPathHint":
    "În browser un selector nu poate dezvălui calea completă — completează " +
    "numele, iar calea pe care bridge-ul trebuie să o citească o completezi tu. " +
    "Aplicația desktop dă calea reală.",

  "tab.inspector": "Inspector",
  "tab.nodes": "Noduri",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "Jurnal",
  "tab.emtreeTitle":
    "EMTree: grafurile deschise în acest spațiu de lucru și fișierele lor " +
    "auxiliare",
  "tab.logTitle": "Avertismente despre document și jurnalul de activitate",

  "empty.drop": "Trage aici un fișier {file}",
  "empty.or": "sau",
  "empty.stratiminer": "construiește unul din datele tale",
  "empty.emtree": "deschide spațiul de lucru",

  "emtree.intro":
    "Grafurile deschise în acest spațiu de lucru. Apasă pe unul pentru a " +
    "lucra pe el — pânza, Inspectorul și narațiunea arată întotdeauna graful " +
    "activ.",
  "emtree.new": "Graf nou",
  "emtree.open": "Deschide…",
  "emtree.empty": "Niciun graf deschis.",
  "emtree.close": "Închide acest graf",
  "emtree.nodes": "noduri",
  "emtree.edges": "muchii",
  "emtree.noFile": "încă nesalvat într-un fișier",
  "emtree.noAux": "niciun fișier auxiliar",
  "emtree.auxFiles": "fișiere auxiliare",
  "emtree.auxNote":
    "Sursele auxiliare (xlsx, pyArchInit, XML) se atașează la un graf și sunt " +
    "VOLATILE: nu intră niciodată în em.json dacă nu faci bake. Maparea, " +
    "bake-ul și cataloagele remote sunt încă de făcut.",
  "emtree.unsaved": "„{name}” are modificări nesalvate. Îl închizi oricum?",

  "settings.title": "Setări",
  "settings.close": "Închide",
  "settings.language": "Limbă",
  "settings.languageHint":
    "Limba acestei interfețe. Etichetele nodurilor și textul narativ sunt " +
    "altceva: călătoresc cu documentul, nu cu aplicația.",
  "settings.translated": "tradus",
  "settings.aiDraft": "ciornă AI, încă nevalidată",
  "settings.markValidated": "Am citit această traducere — marchează-o ca validată",
  "settings.markValidatedHint":
    "Stinge eticheta „ciornă AI” pe acest calculator. Corectarea unui termen " +
    "greșit rămâne o modificare a dicționarelor, iar validarea pentru toți este " +
    "o modificare în codul sursă.",
  "settings.liveSync": "Sincronizare live",
  "settings.developer": "Dezvoltare",
  "settings.interaction": "Interacțiune",
  "settings.aiProvider": "Furnizor AI",
  "settings.viewer": "Vizualizator 3D",
  "settings.save": "Salvează",
  "settings.cancel": "Anulează",

  "toast.activeGraph": "graf activ: „{name}”",
  "toast.workspaceEmpty": "spațiu de lucru gol — niciun graf deschis",
  "toast.openOrDrop": "deschide sau trage un fișier .em.json",
};

const FR: Dict = {
  "toolbar.file": "Fichier",
  "toolbar.new": "Nouveau",
  "toolbar.open": "Ouvrir…",
  "toolbar.save": "Enregistrer",
  "toolbar.saveAs": "Enregistrer sous…",
  "toolbar.export": "Exporter",
  "toolbar.sync": "Synchroniser",
  "toolbar.resources": "Ressources",
  "toolbar.settings": "Paramètres",
  "toolbar.undo": "Annuler",
  "toolbar.redo": "Rétablir",
  "toolbar.matrix": "Matrice",
  "toolbar.graph": "Graphe",
  "toolbar.narrative": "Récit",
  "toolbar.fit": "Ajuster",
  "toolbar.layout": "Disposition",
  "toolbar.search": "Rechercher des nœuds…",
  "toolbar.filters": "Filtres — nœuds/arêtes visibles et affichage",
  "toolbar.importGraphml": "Importer GraphML…",
  "matrix.addEpoch": "Ajouter une époque (le conteneur où vont les unités)",
  "matrix.epoch": "époque",
  "layout.hideLeft": "Masquer la palette",
  "layout.showLeft": "Afficher la palette",
  "layout.hideRight": "Masquer le panneau latéral",
  "layout.showRight": "Afficher le panneau latéral",
  "stratiminer.browserPathHint":
    "Dans le navigateur, un sélecteur ne peut pas révéler le chemin complet — il " +
    "remplit le nom, et le chemin que le bridge doit lire, c'est vous qui le " +
    "complétez. L'application de bureau donne le vrai chemin.",

  "tab.inspector": "Inspecteur",
  "tab.nodes": "Nœuds",
  "tab.emtree": "EMTree",
  "tab.stratiminer": "StratiMiner",
  "tab.log": "Journal",
  "tab.emtreeTitle":
    "EMTree : les graphes ouverts dans cet espace de travail, et leurs " +
    "fichiers auxiliaires",
  "tab.logTitle": "Avertissements du document et journal d'activité",

  "empty.drop": "Déposez ici un fichier {file}",
  "empty.or": "ou",
  "empty.stratiminer": "construisez-en un à partir de vos données",
  "empty.emtree": "ouvrez l'espace de travail",

  "emtree.intro":
    "Les graphes ouverts dans cet espace de travail. Cliquez sur l'un d'eux " +
    "pour y travailler — le canevas, l'Inspecteur et le récit montrent " +
    "toujours le graphe actif.",
  "emtree.new": "Nouveau graphe",
  "emtree.open": "Ouvrir…",
  "emtree.empty": "Aucun graphe ouvert.",
  "emtree.close": "Fermer ce graphe",
  "emtree.nodes": "nœuds",
  "emtree.edges": "arêtes",
  "emtree.noFile": "pas encore enregistré dans un fichier",
  "emtree.noAux": "aucun fichier auxiliaire",
  "emtree.auxFiles": "fichiers auxiliaires",
  "emtree.auxNote":
    "Les sources auxiliaires (xlsx, pyArchInit, XML) se rattachent à un " +
    "graphe et sont VOLATILES : elles n'entrent jamais dans l'em.json sans un " +
    "bake. Le mapping, le bake et les catalogues distants restent à faire.",
  "emtree.unsaved":
    "« {name} » comporte des modifications non enregistrées. Le fermer quand " +
    "même ?",

  "settings.title": "Paramètres",
  "settings.close": "Fermer",
  "settings.language": "Langue",
  "settings.languageHint":
    "La langue de cette interface. Les étiquettes des nœuds et le texte du " +
    "récit sont autre chose : ils voyagent avec le document, pas avec " +
    "l'application.",
  "settings.translated": "traduit",
  "settings.aiDraft": "brouillon IA, pas encore validé",
  "settings.markValidated": "J'ai lu cette traduction — marque-la comme validée",
  "settings.markValidatedHint":
    "Éteint l'étiquette « brouillon IA » sur cet ordinateur. Corriger un terme " +
    "erroné reste une modification des dictionnaires, et la valider pour tout le " +
    "monde est une modification du code source.",
  "settings.liveSync": "Synchronisation en direct",
  "settings.developer": "Développement",
  "settings.interaction": "Interaction",
  "settings.aiProvider": "Fournisseur IA",
  "settings.viewer": "Visionneuse 3D",
  "settings.save": "Enregistrer",
  "settings.cancel": "Annuler",

  "toast.activeGraph": "graphe actif : « {name} »",
  "toast.workspaceEmpty": "espace de travail vide — aucun graphe ouvert",
  "toast.openOrDrop": "ouvrez ou déposez un fichier .em.json",
};

/**
 * Locales a **person** has reviewed.
 *
 * Separate from `coverage()` on purpose, and it is the point of this whole
 * arrangement: now that the six dictionaries are full, coverage reports 100% for
 * all of them — so coverage alone can no longer tell "translated" from "checked".
 * A machine translation that presents itself as finished is the failure mode
 * (an archaeologist reading Greek chrome has no way to know a term was guessed),
 * exactly as an unendorsed AI draft is in the narrative track.
 *
 * Move a code in here when E.D. has read it. That is the only thing that turns
 * "AI draft" into a translation in the selector.
 */
const VALIDATED: ReadonlySet<Locale> = new Set<Locale>(["en", "it"]);

/**
 * Locales validated **in the UI**, by the person using this build (POL3).
 *
 * Validation is an act, and it belongs where the reading happens: you switch to
 * Greek, read the chrome, and say so on the spot. Requiring a source edit to
 * record that meant the badge outlived the reading.
 *
 * Two things this deliberately is NOT:
 *
 *  * **not a translation fix** — the strings live in the dictionaries above, and
 *    correcting one is still a source change. This only records that a human
 *    looked.
 *  * **not shipped to anyone else** — it is this machine's localStorage. The
 *    durable claim, the one every user of a build gets, is still a code move into
 *    `VALIDATED`. So the two together read as "E.D. validated this for everyone"
 *    (the set) and "I validated this for me" (here), which are different facts and
 *    should not collapse into one.
 *
 * `en`/`it` are already in the set and are not offered as toggles: un-validating
 * the reference language would be a UI that argues with the code.
 */
const VALIDATED_KEY = "emstudio.validatedLocales";

function readUserValidated(): Set<Locale> {
  try {
    const raw = localStorage.getItem(VALIDATED_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return new Set();
    // filter against the known locales: a stale key from an older build must not
    // resurrect a code this build no longer has
    return new Set(list.filter((c): c is Locale => typeof c === "string" && c in DICTS));
  } catch {
    return new Set(); // private mode / malformed value: nothing is validated
  }
}

let userValidated: Set<Locale> = new Set();

export function isValidated(code: Locale): boolean {
  return VALIDATED.has(code) || userValidated.has(code);
}

/** True when the code is validated in the SOURCE — so the UI cannot un-tick it. */
export function isValidatedInBuild(code: Locale): boolean {
  return VALIDATED.has(code);
}

/** Record (or withdraw) the in-UI validation of a locale. Persisted. */
export function setValidated(code: Locale, on: boolean): void {
  if (!(code in DICTS) || VALIDATED.has(code)) return;
  if (on) userValidated.add(code);
  else userValidated.delete(code);
  try {
    localStorage.setItem(VALIDATED_KEY, JSON.stringify([...userValidated]));
  } catch {
    /* not fatal: the mark just won't survive a reload */
  }
}

const DICTS: Record<Locale, Dict> = {
  en: EN, it: IT, el: EL, he: HE, es: ES, pl: PL, ro: RO, fr: FR,
};

// ── state ─────────────────────────────────────────────────────────────────────
//
// Its OWN localStorage key rather than a field in `settings.ts`: this module
// imports nothing, and reaching into the settings store would create the one
// import cycle that a single-file bundle makes annoying to debug. A UI language
// is also not a setting anyone needs to see next to a sync port.
const STORAGE_KEY = "emstudio.locale";

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in DICTS) return saved as Locale;
  } catch {
    /* private mode: fall through to the browser's preference */
  }
  // The browser's preference, but only when we actually have that language —
  // guessing `el` for a Greek browser and then showing English would be worse
  // than starting in English.
  const preferred = (navigator.languages ?? [navigator.language ?? "en"])
    .map((l) => l.slice(0, 2).toLowerCase())
    .find((l) => l in DICTS);
  return (preferred as Locale) ?? "en";
}

let locale: Locale = detect();
const listeners: Array<() => void> = [];

export function getLocale(): Locale {
  return locale;
}

export function isRtl(code: Locale = locale): boolean {
  return LOCALES.find((l) => l.code === code)?.rtl === true;
}

/** Fraction of the reference keys this locale actually answers, 0…1. */
export function coverage(code: Locale): number {
  const total = Object.keys(EN).length;
  if (!total) return 1;
  const dict = DICTS[code];
  if (dict === EN) return 1;
  return Object.keys(dict).filter((k) => k in EN).length / total;
}

export function onLocaleChange(fn: () => void): void {
  listeners.push(fn);
}

/**
 * Switch language: persist, set `dir`/`lang` on the document, translate the
 * static chrome, then let the app re-render its dynamic panels.
 */
export function setLocale(code: Locale): void {
  if (!(code in DICTS)) return;
  locale = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* not fatal: the language just won't survive a reload */
  }
  applyDocumentDirection();
  applyStaticTranslations();
  for (const fn of listeners) fn();
}

/**
 * `dir` and `lang` on `<html>`.
 *
 * On the ROOT and not on a wrapper: `dir` is inherited, and the modals and the
 * toast live outside the app's main container — setting it lower down would flip
 * the panels and leave the dialogs LTR, which is worse than not flipping at all.
 * `lang` matters too: it drives hyphenation and the correct quotation marks.
 */
export function applyDocumentDirection(): void {
  const root = document.documentElement;
  root.setAttribute("lang", locale);
  root.setAttribute("dir", isRtl() ? "rtl" : "ltr");
}

/**
 * Resolve a key in the active language, English as the fallback, the key itself
 * as the last resort.
 *
 * Returning the KEY when nothing matches — rather than "" — is deliberate: a
 * missing string shows up as `toolbar.fit` on screen, which is ugly and
 * immediately reported. An empty string is an invisible bug.
 *
 * `vars` interpolates `{name}` placeholders.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = DICTS[locale][key] ?? EN[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole);
}

/**
 * Translate the static markup: `data-i18n` sets the text, `data-i18n-title` the
 * tooltip, `data-i18n-placeholder` the placeholder.
 *
 * Attributes on the HTML rather than building the toolbar in TS: the chrome is
 * already written in `index.html` and rewriting it as JS to make it translatable
 * would be a large change for no gain. This way a new button becomes translatable
 * by adding one attribute, and re-applying on a language switch costs one query.
 */
export function applyStaticTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((element) => {
    const key = element.dataset.i18nTitle;
    if (key) element.title = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")
    .forEach((element) => {
      const key = element.dataset.i18nPlaceholder;
      if (key && "placeholder" in element) {
        (element as HTMLInputElement).placeholder = t(key);
      }
    });
  // A key with markup in it (the drop hint has a <b>) cannot go through
  // textContent. One case, handled by name rather than by inventing a
  // mini-template language for it.
  const drop = root.querySelector<HTMLElement>("[data-i18n-html='empty.drop']");
  if (drop) {
    drop.innerHTML = t("empty.drop", { file: "<b>.em.json</b>" });
  }
}

/** Called once at boot, before the first render. */
export function initI18n(): void {
  // Read here and not at module scope: `readUserValidated` filters against
  // `DICTS`, which is declared below the validation block — touching it during
  // module initialisation would hit the temporal dead zone.
  userValidated = readUserValidated();
  applyDocumentDirection();
  applyStaticTranslations();
}
