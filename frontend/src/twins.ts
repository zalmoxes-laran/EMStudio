/**
 * THE TWIN REGISTER, from the editor's side — «does one already exist?»
 *
 * Two searches live in the HDT-O panel and they are two different questions:
 *
 *   1. **which thing in the world?** → an authority file (TGN, GND, Wikidata),
 *      facet `WHERE` → the identity of the heritage entity (HC1). That one has
 *      existed since P1-D and is `buildAuthorityField` in `inspector.ts`.
 *   2. **which twin already exists for that thing?** → a register of twins →
 *      HC2. That is this file.
 *
 * **The second one is a suggestion and never a gate.** «Perhaps it is this one»,
 * never «you cannot go on until you choose». Somebody who has just opened a
 * trench must be able to say *I do not know yet* and keep working — and that
 * state must be visible and named rather than an empty field. If a flow built on
 * this module ever forces the choice, the flow is wrong: a tool that demands the
 * answer stops serving ninety per cent of excavations.
 *
 * **Federated in shape, one source answered.** The register's reply always names
 * every source it asked and what each said about itself, and every twin carries
 * the source it came from. Today one place answers. A search that is not born
 * with the shape of federation becomes two implementations that diverge — this
 * project has paid that bill once already.
 *
 * **Nothing is simulated.** Where there is no register, the answer says so, in
 * the tone the authority badge already uses for itself («resolver unavailable»).
 * A mock that looked like a second register would make the day the collaborative
 * cloud arrives indistinguishable from the day before it.
 */

/** One twin, as a register describes it. Mirrors the Catalog's `/catalog/twins`
 *  entry; unknown fields are ignored rather than trusted. */
export interface TwinRecord {
  /** the shared identity — what makes two catalogues able to agree */
  key: string;
  label: string;
  /** WHICH REGISTER answered. The first of the three facts. */
  source: string;
  /** WHO IS ALREADY WORKING ON IT. The second. */
  custodians: { name?: string | null; orcid?: string }[];
  /** …and how that was derived, because nothing records a custodian directly */
  custodians_from?: string;
  /** HOW MANY STUDIES hang on it. The third. */
  studies: number;
  /** a twin known only by the id its own document minted: legitimate, and NOT a
   *  good place for somebody else to attach */
  provisional: boolean;
  hc1?: { id?: string; name?: string; iri?: string } | null;
  hc2?: { id?: string; name?: string; iri?: string } | null;
}

/** What a register said about itself — including, especially, that it is not
 *  there. `status` is a word and not a boolean because it has to be printed. */
export interface TwinSourceReport {
  id: string;
  kind?: string;
  label?: string;
  status: string;
  detail?: string;
  count?: number;
}

export interface TwinSearchResult {
  twins: TwinRecord[];
  sources: TwinSourceReport[];
  /** how many studies the register knows with NO twin. Reported because it is
   *  the ordinary case, not the failure case. */
  untwinned?: number;
  /** true when not one register could be asked: the badge says «unavailable»
   *  rather than «none found», which are different sentences. */
  unreachable: boolean;
}

/** The answer when nobody could be asked. Never confused with «found nothing». */
export const NO_REGISTER: TwinSearchResult = {
  twins: [],
  sources: [],
  unreachable: true,
};

/**
 * Where the Catalog is, from this page's point of view.
 *
 * `?catalog=` first — the same parameter `studylink.ts` already reads, so a link
 * that opened a study from a catalogue keeps naming it. Then `window.EM_CATALOG`
 * for a deployment that serves the editor beside its own catalogue. Otherwise
 * the origin this page came from, which is right exactly when the same node
 * serves `/em/studio/` and `/catalog/` — the arrangement that route exists to
 * create, and wrong (harmlessly: the fetch fails and the panel says the register
 * is unavailable) when the editor is on a dev server on its own.
 */
export function catalogBase(search?: string): string {
  const params = new URLSearchParams(
    search ??
      (typeof window !== "undefined" ? window.location.search : ""),
  );
  const named = (params.get("catalog") ?? "").trim();
  if (named) return named.replace(/\/+$/, "");
  const global = (
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).EM_CATALOG ?? "")
      : ""
  ) as string;
  if (typeof global === "string" && global.trim())
    return global.trim().replace(/\/+$/, "");
  return "";
}

/** A record only counts if it carries the fields a person decides on. A partial
 *  answer is dropped rather than shown with blanks: a twin row missing its study
 *  count invites the reader to supply the missing certainty themselves. */
function readRecord(raw: unknown): TwinRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = String(r.key ?? "").trim();
  if (!key) return null;
  const custodians = Array.isArray(r.custodians)
    ? (r.custodians as TwinRecord["custodians"])
    : [];
  return {
    key,
    label: String(r.label ?? "") || key,
    source: String(r.source ?? "") || "unknown",
    custodians,
    custodians_from:
      typeof r.custodians_from === "string" ? r.custodians_from : undefined,
    studies: Number.isFinite(Number(r.studies)) ? Number(r.studies) : 0,
    provisional: r.provisional === true,
    hc1: (r.hc1 ?? null) as TwinRecord["hc1"],
    hc2: (r.hc2 ?? null) as TwinRecord["hc2"],
  };
}

function readSource(raw: unknown): TwinSourceReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    kind: typeof r.kind === "string" ? r.kind : undefined,
    label: typeof r.label === "string" ? r.label : undefined,
    status: String(r.status ?? "unknown"),
    detail: typeof r.detail === "string" ? r.detail : undefined,
    count: Number.isFinite(Number(r.count)) ? Number(r.count) : undefined,
  };
}

/**
 * Ask the register(s) which twins they know for a term.
 *
 * Total: every failure — no catalogue, a 404, a body that is not what it claims
 * — resolves to {@link NO_REGISTER} rather than throwing, because the caller is
 * a panel that must keep working. What it does NOT do is turn a failure into an
 * empty result: `unreachable` separates «nobody has one» from «I could not ask».
 */
export async function searchTwins(
  term: string,
  opts: {
    base?: string;
    limit?: number;
    fetcher?: typeof fetch;
    token?: string | null;
  } = {},
): Promise<TwinSearchResult> {
  const base = opts.base ?? catalogBase();
  const doFetch =
    opts.fetcher ?? (typeof fetch === "function" ? fetch : undefined);
  if (!doFetch) return { ...NO_REGISTER };
  const query = new URLSearchParams();
  if (term.trim()) query.set("q", term.trim());
  query.set("limit", String(opts.limit ?? 12));
  if (opts.token) query.set("token", opts.token);
  try {
    const res = await doFetch(`${base}/catalog/twins?${query.toString()}`);
    if (!res.ok) return { ...NO_REGISTER };
    const body = (await res.json()) as Record<string, unknown>;
    const twins = Array.isArray(body.twins)
      ? body.twins.map(readRecord).filter((t): t is TwinRecord => t !== null)
      : [];
    const sources = Array.isArray(body.sources)
      ? body.sources
          .map(readSource)
          .filter((s): s is TwinSourceReport => s !== null)
      : [];
    // a reply with no `sources` at all is not this contract: treat it as a
    // register we could not read rather than as a register that knows nothing
    if (!sources.length) return { ...NO_REGISTER };
    return {
      twins,
      sources,
      untwinned: Number.isFinite(Number(body.untwinned))
        ? Number(body.untwinned)
        : undefined,
      unreachable: false,
    };
  } catch {
    return { ...NO_REGISTER };
  }
}

/** The registers that answered, for the line under the results. Sources that
 *  said they are not configured are named separately — «asked and absent» is
 *  information, and hiding it would make one register look like all of them. */
export function describeSources(result: TwinSearchResult): {
  answering: TwinSourceReport[];
  absent: TwinSourceReport[];
} {
  return {
    answering: result.sources.filter((s) => s.status === "ok"),
    absent: result.sources.filter((s) => s.status !== "ok"),
  };
}
