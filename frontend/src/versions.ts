// Version breakdown for the clickable EM-version pill: the EM language version,
// each vendored JSON config's version, and the reference ontologies (CIDOC-CRM
// et al.) the datamodel mappings are audited against — all read from the
// vendored s3Dgraphy datamodels (never hardcoded).
import conn from "./assets/s3Dgraphy_connections_datamodel.json";
import qualia from "./assets/em_qualia_types.json";
import node from "./assets/s3Dgraphy_node_datamodel.json";
import visual from "./assets/em_visual_rules.json";

export interface OntologyRef {
  name: string;
  version: string;
  source?: string;
  /**
   * The reference page to open, when there is one (POL3).
   *
   * Derived from the datamodel's own `source`, not from a name→URL table kept in
   * the UI: seven of the nine sources ARE the official URL (cidoc-crm.org,
   * w3.org/TR/prov-o), and the two that are not — HDT-O ("ECHOES deliverable
   * D7.1…") and CRMs3D ("internal em.ttl … companion ontologies") — name a
   * document that has no public page. Those stay unlinked instead of getting an
   * invented URL: a link that guesses is worse than a line of text, because it
   * looks authoritative.
   */
  href?: string;
}
export interface VersionBreakdown {
  emLanguage: string;
  configs: { label: string; version: string }[];
  ontologies: OntologyRef[];
}

function s(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "?");
}

/**
 * Shorten an ontology version for DISPLAY only.
 *
 * Every reference ontology in the datamodel carries a number — `7.1.3`, `2.1.1`,
 * `1.2` — except PROV-O, whose "version" is the sentence *"W3C Recommendation
 * 2013-04-30"*. In a list of numbers that one line wraps and pushes the popup wide,
 * and it reads as an anomaly rather than as the same kind of fact.
 *
 * So a leading `W3C Recommendation` becomes `REC`: the standards world's own
 * abbreviation for exactly this maturity level, and short enough to sit in the same
 * column as `7.1.3`. `REC 2013-04-30` still says which document and from when —
 * nothing is lost, and the date is what a reader would check.
 *
 * **Formatting only.** The datamodel keeps the full string; the vendored JSONs are
 * byte-identical to s3Dgraphy's and are not to be edited for presentation. Written
 * as a general rule rather than a special case for PROV-O, so a future ontology
 * quoting its W3C status is shortened the same way.
 */
export function displayOntologyVersion(version: string): string {
  return version
    .replace(/^W3C\s+Recommendation\b/i, "REC")
    .replace(/^W3C\s+Working\s+Draft\b/i, "WD")
    .replace(/^W3C\s+Candidate\s+Recommendation\b/i, "CR")
    .replace(/^W3C\s+Proposed\s+Recommendation\b/i, "PR")
    .replace(/^W3C\s+Note\b/i, "NOTE")
    .trim();
}

export function versionBreakdown(): VersionBreakdown {
  const n = node as Record<string, unknown>;
  const c = conn as Record<string, unknown>;
  const nodeVer = s(n["s3Dgraphy_data_model_version"]);
  const emLanguage = nodeVer.split(".").slice(0, 2).join(".");
  const configs = [
    { label: "Node datamodel", version: nodeVer },
    { label: "Connections datamodel", version: s(c["s3Dgraphy_connections_model_version"]) },
    { label: "Visual rules", version: s((visual as Record<string, unknown>)["version"]) },
    {
      label: "Qualia vocabulary",
      version: s(
        ((qualia as { metadata?: { version?: unknown } }).metadata ?? {}).version,
      ),
    },
  ];
  // ontologies from the node datamodel (identical block in connections)
  const raw =
    (n["referenced_ontology_versions"] as Record<string, unknown>) ?? {};
  const ontologies: OntologyRef[] = [];
  for (const [name, val] of Object.entries(raw)) {
    if (name.startsWith("_") || typeof val !== "object" || val === null) continue;
    const o = val as { version?: unknown; source?: unknown };
    const source = typeof o.source === "string" ? o.source : undefined;
    ontologies.push({
      name,
      // Display form: see `displayOntologyVersion`. The datamodel's own string is
      // untouched — this is the only place that shortens it, and only for reading.
      version: displayOntologyVersion(s(o.version)),
      source,
      // http(s) only: a `source` that is prose stays prose (see OntologyRef.href),
      // and the scheme test also refuses a `javascript:`/`data:` URL sneaking in
      // from a datamodel we do not author here.
      href: source && /^https?:\/\//i.test(source) ? source : undefined,
    });
  }
  return { emLanguage, configs, ontologies };
}
