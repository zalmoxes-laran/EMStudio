// Controlled vocabularies from the s3Dgraphy datamodels (em_qualia_types.json).
// EMStudio never hardcodes EM terms — the qualia catalogue is vendored and read
// here so the "create property" flow can offer a real, searchable vocabulary
// (e.g. absolute_time_start), each term carrying its rationale + example.
import raw from "./assets/em_qualia_types.json";

export interface Qualia {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  subcategory: string;
  subcategoryLabel: string;
  description?: string;
  rationale?: string;
  example?: string;
  dataType?: string;
  units?: string[];
  values?: string[];
}

interface RawQ {
  id: string;
  name: string;
  description?: string;
  rationale?: string;
  example?: string;
  data_type?: string;
  units?: string[];
  values?: string[];
}
interface RawSub {
  name?: string;
  qualia?: RawQ[];
}
interface RawCat {
  id: string;
  name?: string;
  subcategories?: Record<string, RawSub>;
}

const doc = raw as unknown as {
  metadata?: { version?: string };
  qualia_categories?: RawCat[];
};

export const QUALIA_VERSION = doc.metadata?.version ?? "?";

const list: Qualia[] = [];
for (const c of doc.qualia_categories ?? []) {
  for (const [sk, sv] of Object.entries(c.subcategories ?? {})) {
    for (const q of sv.qualia ?? []) {
      list.push({
        id: q.id,
        name: q.name,
        category: c.id,
        categoryLabel: c.name ?? c.id,
        subcategory: sk,
        subcategoryLabel: sv.name ?? sk,
        description: q.description,
        rationale: q.rationale,
        example: q.example,
        dataType: q.data_type,
        units: q.units,
        values: q.values,
      });
    }
  }
}

export function qualiaList(): Qualia[] {
  return list;
}

/** The controlled vocabulary backing a node type, or null if it has none.
 *  Today only PropertyNode is vocabulary-backed (qualia). */
export function vocabularyFor(nodeType: string | undefined): Qualia[] | null {
  return nodeType === "property" ? list : null;
}
