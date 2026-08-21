// CONNECTORS · executable check of src/connectors.ts — the client's half.
//
//   node scripts/check-connectors.mjs
//
// The contract lives in s3Dgraphy (`s3dgraphy.contract`): the four refusals, the
// DTC-attributed delta and the write seam belong where writes enter a graph, and
// its tests are `s3Dgraphy/tests/test_contract.py`. What is checked HERE is what
// a client owns and can get wrong on its own:
//
//   * the HANDSHAKE agrees with the Python one — same fields, same comparison,
//     same verdicts. A client that accepted a peer the library will refuse would
//     show an editing UI that fails at the first write;
//   * the capability table is the SAME table (one source, vendored on purpose —
//     ADR-001's rule for the datamodels), so a capability cannot exist here and
//     not there;
//   * the registry never GRANTS anything: a refused peer provides nothing, and a
//     viewer's connector does not write however it declared itself;
//   * the mode is DERIVED from what is connected, never set.
//
// The Blender descriptor used below is the real wire form, read from
// `EM-blender-tools/sync_manager/connector.py` when that checkout is present, so
// this check fails if reference #1 stops matching what the client can read.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}connectors.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const C = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const OURS = { emjson: C.EMJSON_SCHEMA_VERSION, datamodel: "1.6.11",
               connector_api: C.CONNECTOR_API_VERSION };

/** The reference connector, as EMtools announces it. */
const blender = (over = {}) => ({
  name: "blender", description: "Blender · EMtools", host: "app-side",
  transport: ["direct", "lan", "cloud"],
  capabilities: ["read-graph", "write-graph", "subscribe", "link-selection",
                 "attach-asset", "materialize-3D", "publish-3D"],
  versions: { ...OURS }, provenance: "derivation",
  vendor: { addon_version: "1.6.0-dev.8" },
  ...over,
});

// ── 1 · the capability table is the contract's table ────────────────────────
{
  const layers = Object.keys(C.CAPABILITY_LAYERS);
  eq(layers.sort(),
     ["asset", "document", "ingest", "interaction", "semantic"],
     "capabilities · the five layers");
  eq(C.CAPABILITY_LAYERS.interaction, ["link-selection", "presence"],
     "capabilities · the ephemeral ones are their own layer — a selection is " +
     "not a fact about a study, and the layer is what says so");
  // every capability has exactly one layer: one in none would be invisible in a
  // registry that groups them
  const flat = Object.values(C.CAPABILITY_LAYERS).flat();
  eq(flat.length, new Set(flat).size, "capabilities · no capability twice");
  eq(flat.every((c) => !!C.CAPABILITY_LAYER[c]), true,
     "capabilities · each one belongs to a layer");
  eq([...C.CAPABILITIES].sort(), [...flat].sort(),
     "capabilities · the flat set IS the table, not a second list");
  // and the writing ones are declared, because a role has to gate them
  eq([...C.WRITING_CAPABILITIES].sort(),
     ["attach-asset", "ingest-batch", "materialize-3D", "write-graph"],
     "capabilities · the ones that touch the document are named");
}

// ── 2 · a descriptor is CHECKED, not trusted ───────────────────────────────
{
  ok(C.isConnectorDescriptor(blender()), "shape · the real one is a descriptor");
  for (const [what, broken] of [
    ["no name", blender({ name: "" })],
    ["an unknown host", blender({ host: "the-cloud" })],
    ["no transport", blender({ transport: [] })],
    ["no versions", blender({ versions: undefined })],
    ["not an object", "blender"],
    ["nothing at all", null],
  ])
    eq(C.isConnectorDescriptor(broken), false,
       `shape · refused: ${what} (a half descriptor must not crash a registry)`);
}

// ── 3 · the handshake, and it agrees with the library ──────────────────────
{
  eq(C.handshake(blender(), OURS).ok, true, "handshake · this build is accepted");

  const stale = C.handshake(blender({ versions: { ...OURS, datamodel: "1.6.2" } }),
                            OURS);
  eq(stale.ok, false, "handshake · a stale datamodel is refused");
  ok(stale.reason.includes("1.6.2") && stale.reason.includes("1.6.11"),
     "handshake · …and the reason names both versions");
  ok(/update it/.test(stale.reason),
     "handshake · …and says which side to update");
  eq(stale.report.datamodel.state, "behind", "handshake · the verdict is data too");

  const newer = C.handshake(blender({ versions: { ...OURS, datamodel: "1.7.0" } }),
                            OURS);
  eq(newer.report.datamodel.state, "ahead", "handshake · a newer peer is 'ahead'");
  ok(/update the study side/.test(newer.reason),
     "handshake · …and the sentence points the other way");

  const silent = C.handshake(blender({ versions: { ...OURS, datamodel: null } }),
                             OURS);
  eq(silent.ok, false, "handshake · a peer that will not say is refused");
  eq(silent.report.datamodel.state, "undeclared", "handshake · …as undeclared");

  // the tolerant half: a document format that gained a field is still readable
  const tolerant = { emjson: "2.3.1", datamodel: "1.6.11", connector_api: "1.0.0" };
  eq(C.handshake(blender({ versions: { ...tolerant, emjson: "2.1.0" } }),
                 tolerant).ok, true,
     "handshake · a minor em.json difference is not a flag day");
  eq(C.handshake(blender({ versions: { ...tolerant, emjson: "1.9.0" } }),
                 tolerant).ok, false,
     "handshake · …but a MAJOR one is not the same format");

  // the comparison itself: unparseable sorts LOWEST, i.e. behind — the safe
  // direction, and the same rule as `consumer_drift.version_key`
  eq(C.versionKey("1.6.11"), [1, 6, 11], "versions · a.b.c");
  eq(C.versionKey("1.6.2-rc1"), [1, 6, 21],
     "versions · digits are taken, tolerantly (as the Python does)");
  eq(C.versionKey(null), [0], "versions · nothing sorts lowest");
  eq(C.versionKey("what"), [0], "versions · so does nonsense");
}

// ── 4 · the registry: it lists, it never grants ────────────────────────────
{
  const reg = new C.ConnectorRegistry();
  eq(reg.mode(), "standalone", "mode · nothing connected");

  const state = reg.announce(blender(), { ours: OURS, transport: "direct",
                                          role: "editor", canWrite: true });
  eq(state.status, "accepted", "registry · the reference connector is accepted");
  eq(reg.mode(), "sidecar", "mode · a paired host on this machine");
  eq(reg.providers("materialize-3D").map((s) => s.descriptor.name), ["blender"],
     "registry · who can do this");
  eq(reg.can("ingest-batch"), false,
     "registry · a capability nobody declared is nobody's");

  // a REFUSED connector provides nothing — accepting its capabilities anyway
  // would be the whole point of the handshake thrown away
  const reg2 = new C.ConnectorRegistry();
  reg2.announce(blender({ versions: { ...OURS, datamodel: "1.6.2" } }),
                { ours: OURS, transport: "direct", canWrite: true });
  eq(reg2.list()[0].status, "refused", "registry · a stale peer is held as refused");
  eq(reg2.providers("write-graph"), [], "registry · …and provides nothing");
  eq(reg2.mode(), "standalone",
     "mode · a refused connector is not a session either");

  // a VIEWER: the connector declared write-graph, the room said no. The room wins
  const reg3 = new C.ConnectorRegistry();
  reg3.announce(blender(), { ours: OURS, transport: "cloud",
                             role: "viewer", canWrite: false });
  eq(reg3.mode(), "hub", "mode · through a room");
  eq(reg3.providers("write-graph"), [],
     "registry · a viewer does not write, whatever the connector declared");
  eq(reg3.providers("read-graph").length, 1,
     "registry · …and it still reads, which is what a viewer is for");

  // malformed → null, and nothing is registered
  const reg4 = new C.ConnectorRegistry();
  eq(reg4.announce({ name: "half" }, { ours: OURS }), null,
     "registry · a malformed announcement is refused, not stored");
  eq(reg4.list(), [], "registry · …and leaves the registry empty");

  // a second announcement REPLACES (a host reconnecting is the same connector,
  // not a duplicate) — unlike the Python registry, whose `register` refuses a
  // shadow, because there a name collision means two adapters, here it means the
  // same peer said something again
  const reg5 = new C.ConnectorRegistry();
  reg5.announce(blender(), { ours: OURS });
  reg5.announce(blender({ vendor: { addon_version: "1.6.0-dev.9" } }),
                { ours: OURS });
  eq(reg5.list().length, 1, "registry · a reconnect is not a second connector");
  eq(reg5.list()[0].descriptor.vendor.addon_version, "1.6.0-dev.9",
     "registry · …and the newer announcement is what is held");
  ok(reg5.forget("blender") && reg5.list().length === 0,
     "registry · and it can go away");
}

// ── 5 · unknown capabilities are reported, not swallowed ───────────────────
{
  const future = blender({ capabilities: ["read-graph", "teleport-3D"] });
  eq(C.unknownCapabilities(future), ["teleport-3D"],
     "capabilities · a newer peer's unknown capability is NAMED");
  eq(Object.keys(C.layersOf(future)), ["document"],
     "capabilities · …and grouping simply does not place it");
}

// ── 6 · reference #1 still matches what this client reads ──────────────────
{
  const emtools = new URL("../../../EM-blender-tools/sync_manager/connector.py",
                          import.meta.url).pathname;
  if (!existsSync(emtools)) {
    console.log("connectors: EM-blender-tools not in this checkout — "
                + "the reference-descriptor case was SKIPPED (declared)");
  } else {
    // read the descriptor the way EMStudio will: as JSON off the wire
    const py = ["python3", "-c", `
import importlib.util, json, sys
sys.path.insert(0, "${new URL("../../../s3Dgraphy/src", import.meta.url).pathname}")
spec = importlib.util.spec_from_file_location("c", "${emtools}")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps(m.descriptor(accepts_commands=True)))
`];
    let wire = null;
    try {
      wire = JSON.parse(execFileSync(py[0], py.slice(1), { encoding: "utf8" }));
    } catch (err) {
      console.log("connectors: could not run the Python side — "
                  + "the reference case was SKIPPED (declared): "
                  + String(err).split("\n")[0]);
    }
    if (wire) {
      ok(C.isConnectorDescriptor(wire),
         "reference · EMtools' real descriptor is one this client can read");
      eq(C.unknownCapabilities(wire), [],
         "reference · every capability it declares is in this build's set");
      const verdict = C.handshake(wire, { ...OURS, datamodel: wire.versions.datamodel });
      eq(verdict.ok, true, "reference · and the handshake accepts it");
      eq(Object.keys(C.layersOf(wire)).sort(),
         ["asset", "document", "interaction"],
         "reference · the three layers Blender actually acts on");
      eq(wire.provenance, "derivation",
         "reference · what it writes is a derivation, declared before it writes");
    }
  }
}

console.log(`connectors: ${checks} checks passed`);
