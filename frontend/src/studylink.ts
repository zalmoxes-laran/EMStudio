/**
 * WHERE A STUDY IS, out of a URL — read by BOTH pages.
 *
 * The Catalog's «open in…» hands out an address, and two EMStudio pages have to
 * understand it: the READER (`/em/read/`, where somebody handed a link reads a
 * study) and the EDITOR (`/em/studio/`, where somebody works on one). Two doors,
 * two verbs, and until this file existed only one of them could read the link —
 * the editor answered «Drop an .em.json file here» over a perfectly good
 * `?emjson=`, which is a button that worked and a door that did not.
 *
 * **One implementation, not two.** It lived inside `reader.ts::documentUrl()`,
 * and copying it into `main.ts` would have created two grammars for one query
 * string. They would not have diverged on day one; they would have diverged the
 * first time somebody added a parameter to the page they were working on.
 *
 * The forms, in precedence order — the Catalog's own two, and nothing invented
 * here:
 *
 *     ?emjson=<url>              the container itself (what `/open` hands out)
 *     ?study=<id>&catalog=<base> a study id against a catalogue
 *     ?study=<id>                …resolved against THIS origin, which is right
 *                                whenever the page is served by the node that
 *                                also runs the Catalog — the arrangement
 *                                `/em/studio/` exists to create
 *     ?narrative=<id>            which narrative, when a study holds several
 *     ?token=<jwt>               for a restricted study, used and not kept
 *
 * **Relative is allowed and is the good case.** `?emjson=/catalog/study/…` names
 * the container on the origin the page came from, which cannot be wrong: the
 * fetch resolves it against `location`. The Catalog already writes that form for
 * its own reading page, after a mixed-content failure measured in Chrome (an
 * https page told to fetch `http://localhost:8010/…`). Nothing here needs to
 * turn it into an absolute URL, and doing so would reintroduce exactly that bug.
 */

/** What a link says about which study to open, and how to reach it. */
export interface StudyLink {
  /** the container's URL — absolute or root-relative, as it was given */
  url: string;
  /** the study id, when the link named one (for a title before the fetch) */
  study: string | null;
  /** which narrative to open, when the study holds several */
  narrative: string | null;
  /** a bearer token for a restricted study. USED, never stored. */
  token: string | null;
}

/**
 * Read a study link off a query string, or `null` when there is not one.
 *
 * Deliberately total: a page can call this at boot and act on `null` by doing
 * nothing, which is what makes it safe to run on every load of the editor.
 */
export function readStudyLink(search?: string): StudyLink | null {
  const params = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""));
  const url = studyDocumentUrl(params);
  if (!url) return null;
  return {
    url,
    study: params.get("study") || null,
    narrative: params.get("narrative") || null,
    token: params.get("token") || null,
  };
}

/**
 * The container's address, from the two forms the Catalog documents.
 *
 * `?emjson=` wins because it is what `/open` hands out and it needs no
 * assumption; `?study=` is the friendlier spelling of the same thing and is
 * resolved against `?catalog=` — or, with no catalogue named, against the origin
 * this page came from. That last case is not a guess: it is the arrangement
 * where the node serves both the editor and the Catalog, which is why
 * `/em/studio/` is a route at all.
 */
export function studyDocumentUrl(params: URLSearchParams): string | null {
  const direct = params.get("emjson");
  if (direct) return direct;
  const study = params.get("study");
  if (!study) return null;
  const catalog = (params.get("catalog") ?? "").replace(/\/+$/, "");
  return `${catalog}/catalog/study/${encodeURIComponent(study)}/emjson`;
}

/** Take the study parameters off the address bar once they have been read.
 *
 *  Same reasoning as the handoff's own cleaner: none of this is secret except
 *  the token, and a URL that still says `?emjson=` reloads the study over
 *  whatever the person has been doing since. The TOKEN is the one that must go
 *  whatever happens — a credential in an address bar outlives the tab it was
 *  useful in, gets copied into a chat, and ends up in a screenshot. */
export function clearStudyLinkFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of ["emjson", "study", "catalog", "narrative", "token"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", url.toString());
}
