// SHELF1 · executable check of src/shelf.ts — the wide list.
//
//   node scripts/check-shelf.mjs
//
// Same harness as check-tiling/check-identity: bundled with the project's own
// esbuild and exercised in node, with a stub localStorage and crypto.randomUUID.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = randomUUID;

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}shelf.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const S = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const DIGEST_A = "sha256:" + "ab".repeat(32);
const DIGEST_B = "sha256:" + "cd".repeat(32);

// ── adding, and the two axes ────────────────────────────────────────────────
{
  S.clearShelf();
  const local = S.addToShelf({
    locator: "/dati/scavo/foto1.jpg", name: "foto1",
    checksum: DIGEST_A, scope: "own-study", residency: "resident",
  });
  eq(local.kind, "image", "a .jpg is an image");
  eq(local.checksum, DIGEST_A, "the digest is kept");
  eq(S.shelfEntries().length, 1, "one entry");

  const lod = S.addToShelf({
    locator: "https://ecch.example/object/42", name: "comparandum",
    scope: "other-HDT",
  });
  eq(lod.checksum, undefined, "a pure URI has no digest: there are no bytes here to hash");
  eq(S.effectiveResidency(lod), "reference", "…and it reads as a reference");
  eq(S.effectiveScope(lod), "other-HDT", "the fence it was given");
  eq(S.shelfEntries().length, 2, "two entries");
}

// ── the same bytes are one resource ─────────────────────────────────────────
//
// The file is called something else and lives somewhere else: no name-based
// check can see this, which is exactly why the digest exists.
{
  S.clearShelf();
  const first = S.addToShelf({ locator: "/dati/2024/foto.jpg", name: "foto", checksum: DIGEST_A });
  const again = S.addToShelf({ locator: "/backup/copia_di_foto.jpg", name: "copia", checksum: DIGEST_A });
  eq(first.id, again.id, "the same digest lands on the same entry");
  eq(S.shelfEntries().length, 1, "and the shelf does not grow");

  const other = S.addToShelf({ locator: "/dati/altra.jpg", name: "altra", checksum: DIGEST_B });
  ok(other.id !== first.id, "a different digest is a different resource");
  eq(S.shelfEntries().length, 2, "two now");

  // a re-drag may still SAY something new — without creating a place to say it
  S.addToShelf({ locator: "/dati/2024/foto.jpg", checksum: DIGEST_A, scope: "own-HDT" });
  eq(S.shelfEntries().length, 2, "still two");
  eq(S.shelfEntries().find((e) => e.checksum === DIGEST_A).scope, "own-HDT",
     "…and the new scope was recorded on the entry that was already there");
}

// ── absent means UNKNOWN, and the reading stays on the consumer's side ──────
{
  S.clearShelf();
  const bare = S.addToShelf({ locator: "/dati/senza_nulla.png" });
  eq(bare.scope, undefined, "nothing was recorded");
  eq(bare.residency, undefined, "…nothing at all");
  eq(S.effectiveScope(bare), "own-study", "the sane reading of a local file");
  eq(S.effectiveResidency(bare), "resident", "…and it is here");
  const remote = S.addToShelf({ locator: "s3://bucket/key.png" });
  eq(S.effectiveResidency(remote), "reference", "an s3 locator reads as a reference");
}

// ── it is a GRAPH: save and reopen ──────────────────────────────────────────
{
  S.clearShelf();
  S.renameShelf("Scavo 2026");
  S.addToShelf({ locator: "/dati/a.jpg", name: "a", checksum: DIGEST_A,
                 scope: "own-study", residency: "resident" });
  S.addToShelf({ locator: "https://ecch.example/o/1", name: "comp", scope: "other-HDT" });

  const doc = S.shelfToDocument();
  eq(doc.graph.data.em_collection, "ShelfGraph", "the marker is the Heriverse/s3Dgraphy one");
  eq(doc.graph.nodes.length, 2, "two resource nodes");
  eq(doc.graph.nodes[0].node_type, "resource", "…of the resource type");
  // written where s3Dgraphy reads them
  const withDigest = doc.graph.nodes.find((n) => n.data.checksum);
  eq(withDigest.data.checksum, DIGEST_A, "the digest is in node.data.checksum");
  eq(withDigest.data.scope, "own-study", "…scope beside it");
  eq(withDigest.data.residency, "resident", "…and residency");
  const lodNode = doc.graph.nodes.find((n) => n.data.url.startsWith("https:"));
  ok(!("checksum" in lodNode.data), "and a URI resource writes NO checksum key at all");
  ok(!("residency" in lodNode.data), "…nor a residency nobody recorded");

  S.clearShelf();
  eq(S.shelfEntries().length, 0, "cleared");
  const loaded = S.loadShelfDocument(doc);
  eq(loaded, { ok: true, count: 2 }, "the shelf reopens");
  eq(S.shelfMeta().name, "Scavo 2026", "…with its name");
  eq(S.shelfEntries().length, 2, "…and its entries");
  eq(S.shelfEntries().find((e) => e.checksum === DIGEST_A).scope, "own-study", "…and their fences");
}

// ── a study graph is NOT a shelf ────────────────────────────────────────────
//
// Reading one "as a shelf" would silently turn its documents into shelf
// entries, and nobody would be able to tell what they were holding.
{
  const study = { header: {}, graph: { graph_id: "s", nodes: [
    { id: "res1", node_type: "resource", name: "x", data: { url: "/a.png" } }] } };
  eq(S.loadShelfDocument(study), { ok: false, reason: "not-a-shelf" },
     "an unmarked graph is refused even though it HAS resources");
  eq(S.loadShelfDocument(null), { ok: false, reason: "not-a-shelf" }, "so is nothing at all");
  eq(S.isShelfDocument(S.shelfToDocument()), true, "…while a shelf identifies itself");
}

// ── what the annotator can work on ──────────────────────────────────────────
{
  S.clearShelf();
  const img = S.addToShelf({ locator: "/a/foto.png" });
  const pdf = S.addToShelf({ locator: "/a/relazione.pdf" });
  const zip = S.addToShelf({ locator: "/a/dati.zip" });
  ok(S.isAnnotatable(img), "an image can be annotated");
  ok(S.isAnnotatable(pdf), "a PDF page can be annotated");
  ok(!S.isAnnotatable(zip), "an archive cannot");
}

// ── it survives a reload (a convenience, not THE save) ──────────────────────
{
  S.clearShelf();
  S.renameShelf("Persistente");
  S.addToShelf({ locator: "/dati/x.jpg", checksum: DIGEST_B });
  S.clearShelf();               // wipes the in-memory list AND the stored copy
  S.restoreShelf();
  eq(S.shelfEntries().length, 0, "restoring after a clear finds an empty shelf");
}

console.log(`shelf: ${checks} checks passed`);
