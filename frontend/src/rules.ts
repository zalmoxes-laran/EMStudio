// Live socket validation from s3Dgraphy's datamodels — the same versioned
// JSONs that drive the Python side (EM 1.5/1.6 connector rules). The class
// hierarchy lives in the GENERATED registry `node_registry.generated.json`
// (node_types entries carry `parent` and `node_type`; derived from the Python
// classes by s3dgraphy.tools.sync_node_datamodel — ADR-001 / Phase 1 P1-A).
// The hand-authored datamodel keeps only semantics/CIDOC. Refresh both local
// copies with scripts/sync-datamodels.sh.
import connections from "./assets/s3Dgraphy_connections_datamodel.json";
import nodeRegistry from "./assets/node_registry.generated.json";
import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";
import visualRules from "./assets/em_visual_rules.json";

interface EdgeTypeDef {
  name?: string;
  label?: string;
  description?: string;
  allowed_connections?: { source?: string[]; target?: string[] };
}

interface NodeTypeEntry {
  class?: string;
  parent?: string | null;
  node_type?: string | null;
  description?: string;
}

const EDGE_TYPES = (
  connections as { edge_types: Record<string, EdgeTypeDef> }
).edge_types;

/**
 * Per-node-type narrowing of the class-level edge rules
 * (`node_type_restrictions`, connections datamodel 1.6.3 — POL5).
 *
 * The edge rules are stated by CLASS, so a subtype inherits everything its parent
 * may connect. This is how a subtype says LESS: `USN`, the NEUTRAL stratigraphic
 * unit (a risparmio — a window or door opening, the volume of a room), takes
 * `is_after` and nothing else, because a void cannot cut, fill, abut or bond.
 *
 * Absent block → no narrowing, which is why a consumer that ignores this simply
 * offers more instead of breaking.
 */
const NODE_RESTRICTIONS = (
  connections as {
    node_type_restrictions?: Record<
      string,
      { allowed_edges?: string[]; scope?: string; denied_edges?: string[] }
    >;
  }
).node_type_restrictions ?? {};

/**
 * The edges the restriction GOVERNS: relations between two stratigraphic units.
 *
 * Read off the data rather than listed here: the eleven unit-to-unit relations
 * (`is_after`, `cuts`, `fills`, `abuts`, `overlies`, `bonded_to`, `equals`, …) all
 * declare the BASE class `StratigraphicNode` on both endpoints, while everything
 * else names either other families (paradata, epochs, groups) or concrete
 * subclasses. `is_part_of` is the interesting case: it enumerates subclasses, and
 * NeutralStratigraphicUnit is not among them — so containment was already closed
 * to a USN by the ordinary rules and needs no exception here.
 *
 * Paradata and membership stay OPEN, deliberately: a risparmio is measured,
 * documented and dated like any other unit.
 */
const STRAT_BASE_CLASS = "StratigraphicNode";
function isUnitToUnitEdge(def: EdgeTypeDef): boolean {
  const ac = def.allowed_connections;
  return (
    !!ac &&
    !!ac.source?.includes(STRAT_BASE_CLASS) &&
    !!ac.target?.includes(STRAT_BASE_CLASS)
  );
}

const CLASS_ENTRIES = (
  nodeRegistry as unknown as { node_types: Record<string, NodeTypeEntry> }
).node_types;

// runtime node_type string → class name (e.g. "US" → "StratigraphicUnit")
const TYPE_TO_CLASS = new Map<string, string>();
for (const [className, entry] of Object.entries(CLASS_ENTRIES)) {
  if (entry.node_type) TYPE_TO_CLASS.set(entry.node_type, className);
}

// class name → ancestry, walking `parent` chains (the hierarchy is complete
// in the datamodel since the VirtualStratigraphicUnit curation of 2026-07-12)
const ANCESTRY = new Map<string, string[]>();
function classAncestors(className: string): string[] {
  const hit = ANCESTRY.get(className);
  if (hit) return hit;
  const out: string[] = [];
  let cur: string | null | undefined = className;
  let guard = 0;
  while (cur && guard++ < 20) {
    out.push(cur);
    cur = CLASS_ENTRIES[cur]?.parent;
  }
  ANCESTRY.set(className, out);
  return out;
}

export const GENERIC_EDGE = "generic_connection";

/** EM language version the palette/rules are aligned to (from the datamodel). */
export const DATAMODEL_VERSION = String(
  (connections as Record<string, unknown>)[
    "s3Dgraphy_connections_model_version"
  ] ?? "?",
);
export const EM_VERSION = DATAMODEL_VERSION.split(".").slice(0, 2).join(".");

/** Class ancestry for a runtime node_type (always includes "Node"). */
export function ancestorsOf(nodeType: string | undefined): string[] {
  const className = TYPE_TO_CLASS.get(nodeType ?? "");
  return className ? classAncestors(className) : ["Node"];
}

export function classOf(nodeType: string | undefined): string {
  return TYPE_TO_CLASS.get(nodeType ?? "") ?? "Node";
}

/** Runtime node_type string for a datamodel class name (e.g.
 *  "HeritageEntityNode" → "heritage_entity"), read from the generated
 *  registry. Returns undefined for an unknown/abstract class. Lets callers
 *  reference a concept by its stable class name and resolve the wire string
 *  from the datamodel instead of hardcoding it. */
export function nodeTypeForClass(className: string): string | undefined {
  return CLASS_ENTRIES[className]?.node_type ?? undefined;
}

/** Runtime node_type strings of the gated HDT-O authoring layer — read from the
 *  datamodel's `hdto_nodes` section (HeritageEntity/HC1, Study/HC9, Project/HC13),
 *  NOT a hardcoded list. Keys starting with `_` (e.g. `_section_note`) are skipped.
 *  HDTNode(HC2)/GraphNode(HC16) are auto-authored by the panel, not hand-created,
 *  so they live in `container_nodes` and are intentionally absent here. */
export function hdtoAuthoringTypes(): string[] {
  const section = (nodeDatamodel as { hdto_nodes?: Record<string, unknown> })
    .hdto_nodes;
  if (!section) return [];
  const out: string[] = [];
  for (const cls of Object.keys(section)) {
    if (cls.startsWith("_")) continue;
    const nt = nodeTypeForClass(cls);
    if (nt) out.push(nt);
  }
  return out;
}

/** All HDT-O-profile node_types the per-graph panel authors: the `hdto_nodes`
 *  authoring types PLUS the auto-created twin (HC2/HDTNode) and proposition set
 *  (HC16/GraphNode). Resolved from the datamodel (class names → node_type), no
 *  hardcoded strings. Used to keep HDT-O metadata OFF the stratigraphic canvas
 *  (they stay in em.json for projection + the future HDT-O lens). */
export function hdtoProfileTypes(): Set<string> {
  const out = new Set<string>(hdtoAuthoringTypes());
  for (const cls of ["HDTNode", "GraphNode"]) {
    const nt = nodeTypeForClass(cls);
    if (nt) out.add(nt);
  }
  return out;
}

// class name → human `label` from the hand-authored datamodel (searches every
// section for an entry carrying both `class` and `label`).
const CLASS_TO_LABEL = new Map<string, string>();
(function buildClassLabels(node: unknown): void {
  if (Array.isArray(node)) {
    for (const v of node) buildClassLabels(v);
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.class === "string" && typeof o.label === "string")
      CLASS_TO_LABEL.set(o.class, o.label);
    for (const v of Object.values(o)) buildClassLabels(v);
  }
})(nodeDatamodel);

/** Human-readable datamodel label for a runtime node_type (e.g. "heritage_entity"
 *  → "Heritage Entity"); falls back to the node_type string when none is defined. */
export function nodeLabel(nodeType: string): string {
  const cls = TYPE_TO_CLASS.get(nodeType);
  return (cls && CLASS_TO_LABEL.get(cls)) || nodeType;
}

// ── DTC substrate profile (ECHOES): data-driven kinds + glyphs ────────────────
// The DTC node_types come from the `dtc_nodes` datamodel section — now just
// `dtc_process` (both INPUT and OUTPUT are Resources = ResourceNodes, no dedicated
// class). The per-kind vocabulary + glyph basenames come from the `dtc_kinds`
// block of em_visual_rules.json; a base with a dedicated `dtc_${base}` node uses
// it, else the kind creates a Resource (ResourceNode). Adding a kind is
// a `dtc_kinds` entry (+ an SVG) — NO code change here.

/** Runtime node_types of the gated DTC authoring layer (from `dtc_nodes`). */
function dtcNodeTypes(): Set<string> {
  const section = (nodeDatamodel as { dtc_nodes?: Record<string, unknown> })
    .dtc_nodes;
  const out = new Set<string>();
  if (!section) return out;
  for (const cls of Object.keys(section)) {
    if (cls.startsWith("_")) continue;
    const nt = nodeTypeForClass(cls);
    if (nt) out.add(nt);
  }
  return out;
}

const DTC_KINDS =
  (
    visualRules as unknown as {
      dtc_kinds?: Record<
        string,
        Record<string, { label?: string; glyph?: string }>
      >;
    }
  ).dtc_kinds ?? {};

export interface DtcKindItem {
  nodeType: string; // dtc_process | (input/output →) link (a Resource)
  kind: string; // photo | mesh | …
  label: string;
  glyph: string | null;
  /** true when creating this item yields a RESOURCE (ResourceNode) rather than a
   *  dedicated DTC node — the output facet (slice b): the DTC output is a file
   *  Resource, so it also gets a `resource_type`. */
  isResource: boolean;
}

/** The DTC authoring palette, fully data-driven: one entry per (base kind) ×
 *  (specific kind) from `dtc_kinds`. A base backed by a dedicated DTC node_type
 *  (`dtc_${base}`) creates that node; a base WITHOUT one (the OUTPUT, slice b —
 *  DTCOutputNode retired) creates a RESOURCE = the ResourceNode. Empty when the
 *  datamodel carries no DTC profile. */
export function dtcAuthoringKinds(): DtcKindItem[] {
  const types = dtcNodeTypes();
  const resourceNt = nodeTypeForClass("ResourceNode"); // the Resource node ("resource")
  const out: DtcKindItem[] = [];
  for (const base of Object.keys(DTC_KINDS)) {
    if (base.startsWith("_")) continue;
    const dedicated = `dtc_${base}`;
    const hasNode = types.has(dedicated);
    const nodeType = hasNode ? dedicated : resourceNt;
    if (!nodeType) continue; // no dedicated node AND no Resource type available
    const entries = DTC_KINDS[base] ?? {};
    for (const kind of Object.keys(entries)) {
      if (kind.startsWith("_")) continue;
      const e = entries[kind] ?? {};
      out.push({
        nodeType,
        kind,
        label: e.label ?? kind,
        glyph: e.glyph ?? null,
        isResource: !hasNode,
      });
    }
  }
  return out;
}

// flat kind → glyph basename (kinds are unique across the input/process/output
// bases), so a glyph resolves from a node's `data.dtc_kind` regardless of its
// node_type — covers the dtc_* chunks AND the output Resource (a ResourceNode).
const DTC_KIND_GLYPH = new Map<string, string>();
for (const base of Object.keys(DTC_KINDS)) {
  if (base.startsWith("_")) continue;
  for (const [kind, e] of Object.entries(DTC_KINDS[base] ?? {})) {
    if (kind.startsWith("_")) continue;
    if (e?.glyph) DTC_KIND_GLYPH.set(kind, e.glyph);
  }
}

/** Glyph basename for a node's `data.dtc_kind` — data-driven from `dtc_kinds`;
 *  null when there is no kind / no glyph. Resolves for the dtc_* chunks and for
 *  the output Resource (ResourceNode) alike, keyed purely on the kind. */
export function dtcGlyphName(dtcKind: string | undefined): string | null {
  return (dtcKind && DTC_KIND_GLYPH.get(dtcKind)) || null;
}

/** The single edge type the datamodel permits between two node_types, or
 *  undefined if none (or, defensively, the first when several qualify). Reads
 *  `allowed_connections` — no edge-name literals in caller code. */
export function edgeTypeFor(
  sourceType: string | undefined,
  targetType: string | undefined,
): string | undefined {
  return allowedEdgeTypes(sourceType, targetType)[0];
}

export function typeDescription(nodeType: string | undefined): string {
  const className = TYPE_TO_CLASS.get(nodeType ?? "");
  return (className && CLASS_ENTRIES[className]?.description) || "";
}

function intersects(allowed: string[] | undefined, anc: string[]): boolean {
  if (!allowed || !allowed.length) return false;
  return allowed.some((a) => anc.includes(a));
}

/**
 * Edge types permitted from a source node_type to a target node_type,
 * specific rules only (generic_connection excluded).
 */
export function allowedEdgeTypes(
  sourceType: string | undefined,
  targetType: string | undefined,
): string[] {
  const sa = ancestorsOf(sourceType);
  const ta = ancestorsOf(targetType);
  const out: string[] = [];
  for (const [name, def] of Object.entries(EDGE_TYPES)) {
    if (name === GENERIC_EDGE) continue;
    const ac = def.allowed_connections;
    if (!ac) continue;
    if (!intersects(ac.source, sa) || !intersects(ac.target, ta)) continue;
    // BUGFIX-CONN · a node type may DENY specific edges its CLASS would otherwise
    // allow (`denied_edges`, the blacklist mirror of `allowed_edges`). Unlike the
    // scoped `allowed_edges` whitelist below, this is NOT gated on the edge family
    // — it names exact edges to withhold, so a subtype can say LESS than its
    // parent for one edge without leaving the class hierarchy (e.g. an
    // ExtractorNode/CombinerNode does not offer has_visual_reference, even though
    // their parent ParadataNode is a listed source).
    const deniedBySource = sourceType ? NODE_RESTRICTIONS[sourceType]?.denied_edges : undefined;
    const deniedByTarget = targetType ? NODE_RESTRICTIONS[targetType]?.denied_edges : undefined;
    if (deniedBySource?.includes(name) || deniedByTarget?.includes(name)) continue;
    // POL5 · a restricted type narrows the unit-to-unit relations, at EITHER end:
    // "USN cuts US" is as wrong as "US cuts USN".
    if (isUnitToUnitEdge(def)) {
      const blocked = [sourceType, targetType].some((t) => {
        const allow = t ? NODE_RESTRICTIONS[t]?.allowed_edges : undefined;
        return !!allow && !allow.includes(name);
      });
      if (blocked) continue;
    }
    out.push(name);
  }
  return out;
}

export type ConnectValidity = "valid" | "generic" | "invalid";

export function connectValidity(
  sourceType: string | undefined,
  targetType: string | undefined,
): ConnectValidity {
  if (allowedEdgeTypes(sourceType, targetType).length) return "valid";
  const g = EDGE_TYPES[GENERIC_EDGE]?.allowed_connections;
  const ok =
    g &&
    intersects(g.source, ancestorsOf(sourceType)) &&
    intersects(g.target, ancestorsOf(targetType));
  return ok ? "generic" : "invalid";
}

export function edgeTypeLabel(edgeType: string): string {
  return EDGE_TYPES[edgeType]?.label ?? edgeType;
}

export function edgeTypeDescription(edgeType: string): string {
  return EDGE_TYPES[edgeType]?.description ?? "";
}

/** All specific edge type names (excludes the generic connection). Lets callers
 *  derive edge-class sets from the datamodel instead of hardcoding names. */
export function edgeTypeNames(): string[] {
  return Object.keys(EDGE_TYPES).filter((n) => n !== GENERIC_EDGE);
}

/** Raw declared endpoint CLASS names of an edge type, VERBATIM from the
 *  datamodel's `allowed_connections` (NOT expanded to ancestors — the caller
 *  that needs "target is exactly these classes" must see the declared set, not
 *  every ancestor up to Node). */
export function edgeEndpointsRaw(edgeType: string): {
  source: string[];
  target: string[];
} {
  const ac = EDGE_TYPES[edgeType]?.allowed_connections;
  return { source: ac?.source ?? [], target: ac?.target ?? [] };
}

/** node_types whose class ancestry includes the given class name. */
export function typesOfClass(className: string): string[] {
  return [...TYPE_TO_CLASS.keys()].filter((t) =>
    ancestorsOf(t).includes(className),
  );
}

export function isGroupType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("GroupNode");
}

export function isStratigraphicType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("StratigraphicNode");
}

/** Reasoning-chain (paradata) node: property / extractor / combiner / document. */
export function isParadataType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("ParadataNode");
}

/** Continuity node (BR) — the boundary marker of a unit's life-span. */
export function isContinuityType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("ContinuityNode");
}

/** Virtual stratigraphic unit — detected from the datamodel class names
 *  (VirtualStratigraphicUnit / …VirtualSpecialFindUnit / SeriesOf…Virtual…),
 *  so it also covers VSF and the virtual series, not just USVn/USVs. */
export function isVirtualType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).some((c) => c.includes("Virtual"));
}

/**
 * The narrative embed view types, from the datamodel
 * (`narrative_nodes.NarrativeNode.valid_view_types`).
 *
 * One vocabulary, owned by s3Dgraphy — not a hand-written list that has to be
 * remembered when a term is renamed. Order is the datamodel's, which is the
 * order the author sees in the menu.
 */
export function narrativeViewTypes(): string[] {
  const dm = nodeDatamodel as unknown as {
    narrative_nodes?: Record<string, { valid_view_types?: Record<string, string> }>;
  };
  const declared = dm.narrative_nodes?.NarrativeNode?.valid_view_types;
  return declared ? Object.keys(declared) : [];
}

/** What the datamodel says a view type shows — straight into the tooltip of the
 *  block's view-type picker, so the author reads the definition, not a guess. */
export function narrativeViewTypeDescription(viewType: string): string {
  const dm = nodeDatamodel as unknown as {
    narrative_nodes?: Record<string, { valid_view_types?: Record<string, string> }>;
  };
  return dm.narrative_nodes?.NarrativeNode?.valid_view_types?.[viewType] ?? "";
}

// ── resource types (ResourceNode) ────────────────────────────────────────────────
// A resource's *kind* — image, document, 3d_model, … — is a vocabulary the
// datamodel owns (`reference_nodes.ResourceNode.resource_types`: kind → extensions),
// and it is the same table `s3dgraphy.resources.classify_resource_type` reads on
// the Python side. So: no second list of extensions in the UI. The previews
// (N10) and the 3D embed (N9) both ask this.
const RESOURCE_TYPES: Record<string, string[]> =
  ((
    nodeDatamodel as unknown as {
      reference_nodes?: Record<string, { resource_types?: Record<string, string[]> }>;
    }
  ).reference_nodes?.ResourceNode?.resource_types) ?? {};

const EXT_TO_RESOURCE_TYPE = new Map<string, string>();
for (const [kind, exts] of Object.entries(RESOURCE_TYPES))
  for (const ext of exts) EXT_TO_RESOURCE_TYPE.set(ext.toLowerCase(), kind);

/**
 * Classify a filename / locator into an EM resource type, by extension.
 *
 * Mirrors `classify_resource_type` (s3Dgraphy): the extension table is the
 * datamodel's, and "unknown" is a legitimate answer rather than a guess. Query
 * strings and fragments are stripped first — a locator is not a filename.
 */
export function resourceTypeOfLocator(locator: string | undefined): string {
  const clean = String(locator ?? "").split(/[?#]/)[0];
  const base = clean.split(/[\\/]/).pop() ?? "";
  if (!base.includes(".")) return "unknown";
  const ext = base.slice(base.lastIndexOf(".") + 1).toLowerCase();
  return EXT_TO_RESOURCE_TYPE.get(ext) ?? "unknown";
}

/** The resource types that are 3D geometry — read off the datamodel's own kind
 *  names, so a new 3D kind added there is 3D here too. `proxy_model` (glb) and
 *  `3d_model` (gltf/obj/…) both qualify; point clouds do not (ATON loads meshes
 *  in the preview app, not e57/las). */
export function is3dResourceType(resourceType: string | undefined): boolean {
  const t = String(resourceType ?? "");
  return Object.keys(RESOURCE_TYPES).includes(t) && /model/.test(t);
}

/** Union of the node classes (with ancestry) an edge type may connect —
 *  from the datamodel `allowed_connections`. Used to categorise edges
 *  (epoch / paradata / stratigraphic) without hardcoding edge names. */
export function edgeEndpointClasses(edgeType: string | undefined): Set<string> {
  const ac = EDGE_TYPES[edgeType ?? ""]?.allowed_connections;
  const out = new Set<string>();
  for (const c of [...(ac?.source ?? []), ...(ac?.target ?? [])])
    for (const a of classAncestors(c)) out.add(a);
  return out;
}
