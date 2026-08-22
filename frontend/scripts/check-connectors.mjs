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

// ── 7 · the capability table IS the library's table ────────────────────────
//
// Vendored on purpose (ADR-001's rule for the datamodels) — which is only safe if
// somebody notices when the copy drifts. So it is compared, not trusted: the
// Python table is the source, and this asks it.
{
  const s3d = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
  if (!existsSync(s3d)) {
    console.log("connectors: s3Dgraphy not in this checkout — "
                + "the capability-parity case was SKIPPED (declared)");
  } else {
    let table = null;
    try {
      table = JSON.parse(execFileSync("python3", ["-c", `
import json, sys
sys.path.insert(0, "${s3d}")
from s3dgraphy.contract import CAPABILITY_LAYERS, CONSUMER_CAPABILITIES, \
    READ_CAPABILITIES, WRITING_CAPABILITIES
print(json.dumps({"layers": {k: list(v) for k, v in CAPABILITY_LAYERS.items()},
                  "consumer": list(CONSUMER_CAPABILITIES),
                  "read": list(READ_CAPABILITIES),
                  "writing": list(WRITING_CAPABILITIES)}))
`], { encoding: "utf8" }));
    } catch (err) {
      console.log("connectors: could not ask the library — the capability-parity "
                  + "case was SKIPPED (declared): " + String(err).split("\n")[0]);
    }
    if (table) {
      eq(Object.fromEntries(Object.entries(C.CAPABILITY_LAYERS)
           .map(([k, v]) => [k, [...v]])),
         table.layers,
         "parity · the capability table is the library's, layer for layer");
      eq([...C.CONSUMER_CAPABILITIES], table.consumer,
         "parity · …and so is what a consumer may declare");
      eq([...C.READ_CAPABILITIES], table.read, "parity · …and the reads");
      eq([...C.WRITING_CAPABILITIES].sort(), [...table.writing].sort(),
         "parity · …and the ones a role has to allow");
    }
  }
}

// ── 8 · a CONSUMER: served, listed with what it was granted, never a writer ──
{
  const s3d = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
  /** The Heriverse reference descriptor — read from the library, which is where
   *  the spec 3DR implements against lives. Hand-typing it here would let this
   *  check keep passing after the spec moved. */
  let heriverse = null;
  if (existsSync(s3d)) {
    try {
      heriverse = JSON.parse(execFileSync("python3", ["-c", `
import json, sys
sys.path.insert(0, "${s3d}")
from s3dgraphy.contract import heriverse_wire
print(json.dumps(heriverse_wire()))
`], { encoding: "utf8" }));
    } catch (err) {
      console.log("connectors: could not read the reference descriptor — the "
                  + "consumer cases run on the local copy instead (declared): "
                  + String(err).split("\n")[0]);
    }
  }
  // The local stand-in, used when the library is not in this checkout. Same
  // shape, and the parity case above is what keeps it honest.
  heriverse = heriverse ?? {
    name: "heriverse", description: "Heriverse · web viewer (3D-ResearchLab)",
    host: "app-side", transport: ["cloud", "lan"],
    capabilities: ["read-graph", "subscribe", "resolve-asset", "resolve-preview",
                   "resolve-uri", "link-selection", "presence"],
    versions: { ...OURS }, provenance: "none", writes: false,
  };
  const viewer = { ...heriverse, versions: { ...OURS } };

  ok(C.isConnectorDescriptor(viewer),
     "consumer · the reference descriptor is one this client can read");
  eq(C.unknownCapabilities(viewer), [],
     "consumer · every capability it declares is in this build's set");
  eq(C.isConsumer(viewer), true, "consumer · …and every one of them is a read");
  eq(Object.keys(C.layersOf(viewer)).sort(),
     ["asset", "document", "interaction", "semantic"],
     "consumer · the four layers a viewer acts on");

  const reg = new C.ConnectorRegistry();
  const state = reg.announce(viewer, { ours: OURS, transport: "cloud",
                                       role: "viewer", canWrite: false });
  eq(state.status, "accepted", "consumer · it is accepted, not merely tolerated");
  eq(reg.mode(), "hub", "mode · a consumer arrives through a room");
  eq(reg.consumers().map((s) => s.descriptor.name), ["heriverse"],
     "registry · who is being SERVED");
  eq(reg.subscribers().map((s) => s.descriptor.name), ["heriverse"],
     "registry · …and who asked to be told when the study changes");
  eq(reg.granted("heriverse"), viewer.capabilities,
     "registry · a consumer is granted exactly what it declared");
  eq(reg.providers("write-graph"), [],
     "registry · and it is nobody's provider for a write");

  // the GREEDY one: it declared a write. The room said viewer, so the write is
  // not granted — no refusal, no drama, and no write
  const greedy = { ...viewer, writes: true,
                   capabilities: [...viewer.capabilities, "write-graph"] };
  const reg2 = new C.ConnectorRegistry();
  reg2.announce(greedy, { ours: OURS, transport: "cloud", role: "viewer",
                          canWrite: false });
  eq(reg2.list()[0].status, "accepted",
     "consumer · an ambitious descriptor is not a refusal");
  eq(reg2.granted("heriverse").includes("write-graph"), false,
     "consumer · …but the write it declared is NOT granted");
  eq(reg2.granted("heriverse").includes("read-graph"), true,
     "consumer · …and the reads still are");
  eq(reg2.providers("write-graph"), [],
     "consumer · a viewer does not write, whatever it declared");
  eq(C.isConsumer(greedy), false,
     "consumer · it stopped being one the moment it said so");

  // …and the one contradiction that IS refused, in the same words the Python
  // constructor raises: writes:false beside a capability that writes
  const impossible = { ...viewer, capabilities: [...viewer.capabilities,
                                                 "write-graph"] };
  ok(C.descriptorContradiction(impossible),
     "consumer · writes:false beside write-graph is a contradiction");
  const reg3 = new C.ConnectorRegistry();
  const refused = reg3.announce(impossible, { ours: OURS, transport: "cloud" });
  eq(refused.status, "refused",
     "consumer · …and it is refused rather than repaired");
  ok(/writes:false/.test(refused.reason) && /never fire/.test(refused.reason),
     "consumer · …with the reason a partner can act on");
  eq(reg3.providers("read-graph"), [],
     "consumer · a refused peer provides nothing, not even its reads");
  eq(C.descriptorContradiction(viewer), null,
     "consumer · and the honest descriptor contradicts nothing");
}

// ── 9 · the app SAYS it, at both moments ───────────────────────────────────
//
// `subscribe` rides the existing op channel, which means the sync direction
// governs it: in `off` or `receive` nothing leaves this client and a subscribed
// viewer shows a study that never moves — indistinguishable, from over there,
// from a broken viewer. So the sentence is owed at two moments, and a source
// check is the only thing that can hold a caller (the logic lives in `main.ts`,
// which does not load outside a browser).
{
  const main = readFileSync(new URL("../src/main.ts", import.meta.url).pathname,
                            "utf8");
  ok(/function warnStarvedSubscribers\(\)/.test(main),
     "app · the warning exists");
  // …when a connector announces itself
  const announce = main.slice(main.indexOf("function announceConnector"),
                              main.indexOf("function warnStarvedSubscribers"));
  ok(/warnStarvedSubscribers\(\);/.test(announce),
     "app · …said when a subscriber arrives");
  // …and when somebody turns the stream off, which is the other half: the
  // subscriber was already there and nothing announces itself twice
  const direction = main.slice(main.indexOf("function setSyncDirection"),
                               main.indexOf("const SYNC_GLYPHS"));
  ok(/warnStarvedSubscribers\(\);/.test(direction),
     "app · …and when the direction changes under one");
  // a consumer is SAID differently from a collaborator, and what is listed is
  // what it was GRANTED rather than what it declared
  ok(/isConsumer\(state\.descriptor\) \? "conn\.consumer"/.test(main),
     "app · a consumer is announced as a consumer");
  ok(/connectors\.granted\(state\.descriptor\.name\)/.test(main),
     "app · …and listed with what it was granted");
  // the two sentences exist in both languages (parity itself is check-i18n's)
  const i18n = readFileSync(new URL("../src/i18n.ts", import.meta.url).pathname,
                            "utf8");
  for (const key of ["conn.consumer", "conn.starved"])
    eq((i18n.match(new RegExp(`"${key.replace(".", "\\.")}":`, "g")) || []).length,
       2, `app · «${key}» is written in both languages`);
}

console.log(`connectors: ${checks} checks passed`);
