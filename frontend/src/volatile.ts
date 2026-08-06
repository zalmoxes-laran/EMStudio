// AUX2 — the VOLATILE state (DP-81, corrected reading of AUX1).
//
// When an auxiliary source is MAPPED, its nodes enter the in-memory graph so
// they are visible BOTH on the canvas AND in the EM-Data table — but marked
// volatile (rendered in accent blue) and EXCLUDED from the saved em.json until a
// BAKE promotes them. Volatile ≠ hidden: it is seen everywhere, distinguished by
// colour, and simply does not travel with the document until baked.
//
// Single source of truth: a marker on the node itself, `data.aux_volatile` =
// the id of the auxiliary it came from. Both the canvas renderer and the table
// read THIS — they can never disagree. Save (`DocumentStore.toJSON`) drops every
// node carrying it (plus incident edges); bake clears it.

import type { EmNode } from "./types";

/** The marker key. Value = the auxiliary-file id the node was mapped from. */
export const VOLATILE_KEY = "aux_volatile";

export function isVolatile(node: EmNode | undefined | null): boolean {
  if (!node) return false;
  const d = node.data as Record<string, unknown> | undefined;
  return !!(d && d[VOLATILE_KEY]);
}

/** The auxiliary id a volatile node came from (or null). */
export function volatileSource(node: EmNode | undefined | null): string | null {
  if (!node) return null;
  const d = node.data as Record<string, unknown> | undefined;
  const v = d ? d[VOLATILE_KEY] : undefined;
  return typeof v === "string" ? v : v ? "" : null;
}

/** Stamp the marker (mutates the node object in place; the caller checkpoints). */
export function markVolatile(node: EmNode, auxId: string): void {
  (node.data ??= {} as Record<string, unknown>)[VOLATILE_KEY] = auxId;
}

/** Remove the marker — the node becomes persistent (bake). */
export function clearVolatile(node: EmNode): void {
  const d = node.data as Record<string, unknown> | undefined;
  if (d) delete d[VOLATILE_KEY];
}
