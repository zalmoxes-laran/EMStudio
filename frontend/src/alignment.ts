/**
 * C1 · WHICH DOCUMENT each end has open — and the comparison.
 *
 * The twin of `EM-blender-tools/sync_manager/alignment.py`, written the same way
 * for the same reason the wire is written three times: a rule small enough to
 * state twice is cheaper than a dependency, and the day the two disagree a check
 * says so (`scripts/check-alignment.mjs`).
 *
 * The defect this closes is not a bug in anybody's message handler — EMStudio →
 * Blender selection was measured working on 12-09-2026. It is that **two ends
 * looking at different documents produce exactly the same silence** as a closed
 * channel or a graph that is not in memory: three causes, one symptom.
 *
 * Three rules, all of them about NOT KNOWING:
 *
 * - **Identity is the graph id, never the file name.** Two people can each have
 *   their own `TempluMare.em.json`; a graph that arrived over a socket has no
 *   file at all. The name survives as the LABEL a human reads.
 * - **Not knowing is not an alarm.** An end that declares nothing — an older
 *   build, a Blender with no graph loaded — is silent, not misaligned. Telling
 *   somebody they are looking elsewhere on no evidence teaches them to ignore
 *   the warning.
 * - **It is not an error.** Working on different documents over an open channel
 *   is legitimate (one models, the other writes the narrative). Not knowing is
 *   not.
 */

/** The keys that travel on the wire. Constants, not repeated string literals:
 *  the two ends must spell them identically, and a typo here is a
 *  misalignment that cannot be seen. */
export const GRAPH_ID_KEY = "graph_id";
export const GRAPH_NAME_KEY = "graph_name";
/** …and every id loaded, because Blender is multigraph: "your document is in my
 *  other tab" and "I do not have your document" are different situations with
 *  different cures, and one id could not tell them apart. */
export const GRAPH_IDS_KEY = "graph_ids";

export interface Declared {
  graph_id?: string | null;
  graph_name?: string | null;
  graph_ids?: string[] | null;
}

export interface Alignment {
  /** did BOTH ends declare an id? If not, nothing is concluded. */
  known: boolean;
  aligned: boolean;
  /** their document is among the ones I have loaded: switch, do not go looking */
  alsoOpen: boolean;
  /** empty unless there is something to say */
  sentence: string;
  mine: string;
  theirs: string;
}

const text = (v: unknown): string => String(v ?? "").trim();

/** How a document is NAMED to a reader: the name when there is one, the id
 *  otherwise. The id is what gets COMPARED; a uuid in a warning helps nobody. */
export function label(id: string, name = ""): string {
  const n = text(name), i = text(id);
  if (n && i && n !== i) return `${n} (${i.slice(0, 8)})`;
  return n || i;
}

/** The two descriptors compared. Never throws. */
export function compare(mine: Declared | null | undefined,
                        theirs: Declared | null | undefined): Alignment {
  const a = mine ?? {}, b = theirs ?? {};
  const mineId = text(a.graph_id), theirsId = text(b.graph_id);
  const out: Alignment = {
    known: Boolean(mineId && theirsId),
    aligned: true,
    alsoOpen: false,
    sentence: "",
    mine: label(mineId, text(a.graph_name)),
    theirs: label(theirsId, text(b.graph_name)),
  };
  // Absence of proof is not proof of the contrary: with either end silent the
  // answer stays `aligned` and says nothing, and `known` is how a caller tells
  // "we agree" from "I cannot tell".
  if (!out.known || mineId === theirsId) return out;
  out.aligned = false;
  const all = a.graph_ids;
  out.alsoOpen = Array.isArray(all) && all.map(text).includes(theirsId);
  out.sentence = `you have ${out.theirs} open, I have ${out.mine}`;
  if (out.alsoOpen) out.sentence += " — and I have theirs loaded too: switch to it";
  return out;
}
