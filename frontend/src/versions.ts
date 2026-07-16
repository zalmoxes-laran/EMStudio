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
}
export interface VersionBreakdown {
  emLanguage: string;
  configs: { label: string; version: string }[];
  ontologies: OntologyRef[];
}

function s(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "?");
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
    ontologies.push({
      name,
      version: s(o.version),
      source: typeof o.source === "string" ? o.source : undefined,
    });
  }
  return { emLanguage, configs, ontologies };
}
