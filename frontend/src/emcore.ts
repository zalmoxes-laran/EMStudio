// em-core in the browser: the SAME Rust layout engine that powers em-cli,
// compiled to WebAssembly (crates/em-wasm) — one implementation, identical
// results across CLI, desktop and web (ADR-001, ARCHITECTURE §4.4).
// Rebuild with: scripts/build-wasm.sh (the .wasm is vendored so `npm run
// build` works without a Rust toolchain).
import type { EmGraph, EmLayout } from "./types";
import wasmUrl from "./wasm/em_wasm.wasm?url";

interface EmCoreExports {
  memory: WebAssembly.Memory;
  em_alloc: (len: number) => number;
  em_free: (ptr: number, len: number) => void;
  em_layout: (ptr: number, len: number) => number;
  em_free_result: (ptr: number) => void;
}

let exportsCache: EmCoreExports | null = null;

async function ensure(): Promise<EmCoreExports> {
  if (exportsCache) return exportsCache;
  const response = await fetch(wasmUrl);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  exportsCache = instance.exports as unknown as EmCoreExports;
  return exportsCache;
}

/** Compute the swimlane layout for a graph section, via em-core (WASM). */
export async function computeLayout(graph: EmGraph): Promise<EmLayout> {
  const core = await ensure();
  const input = new TextEncoder().encode(JSON.stringify(graph));
  const ptr = core.em_alloc(input.length);
  new Uint8Array(core.memory.buffer, ptr, input.length).set(input);
  const out = core.em_layout(ptr, input.length);
  core.em_free(ptr, input.length);
  // fresh views: the call may have grown (re-allocated) the memory
  const view = new DataView(core.memory.buffer);
  const len = view.getUint32(out, true);
  const json = new TextDecoder().decode(
    new Uint8Array(core.memory.buffer, out + 4, len),
  );
  core.em_free_result(out);
  const result = JSON.parse(json) as { ok?: EmLayout; err?: string };
  if (result.err || !result.ok) throw new Error(result.err ?? "layout failed");
  return result.ok;
}
