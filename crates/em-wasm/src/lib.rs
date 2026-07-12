//! em-core → WebAssembly, minimal manual ABI (no wasm-bindgen: the surface
//! is one JSON-in / JSON-out call, hand-written glue keeps the toolchain
//! lean and the binary small).
//!
//! ABI (all pointers into the module's linear memory):
//!   em_alloc(len)            → ptr        caller writes UTF-8 JSON there
//!   em_layout(ptr, len)      → out_ptr    4 bytes LE length + JSON bytes
//!   em_free(ptr, len)                     release a buffer from em_alloc
//!   em_free_result(out_ptr)               release a result buffer
//!
//! Input: `{ graph, layout? }` — when `layout` is present its positions are
//! used as a From-Sketch soft constraint (manual arrangements survive).
//! Output: `{ "ok": Layout }` or `{ "err": "message" }`.

use em_core::{layout, model::Graph, model::Layout};

#[derive(serde::Deserialize)]
struct LayoutRequest {
    graph: Graph,
    #[serde(default)]
    layout: Option<Layout>,
}

#[no_mangle]
pub extern "C" fn em_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety: ptr/len must come from `em_alloc(len)`.
#[no_mangle]
pub unsafe extern "C" fn em_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

fn pack(result: String) -> *mut u8 {
    let bytes = result.into_bytes();
    let mut out = Vec::with_capacity(4 + bytes.len());
    out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&bytes);
    let ptr = out.as_mut_ptr();
    std::mem::forget(out);
    ptr
}

/// # Safety: out_ptr must come from `em_layout`.
#[no_mangle]
pub unsafe extern "C" fn em_free_result(out_ptr: *mut u8) {
    let len = u32::from_le_bytes([
        *out_ptr,
        *out_ptr.add(1),
        *out_ptr.add(2),
        *out_ptr.add(3),
    ]) as usize;
    drop(Vec::from_raw_parts(out_ptr, 0, 4 + len));
}

/// # Safety: ptr/len must describe a valid UTF-8 buffer from `em_alloc`.
#[no_mangle]
pub unsafe extern "C" fn em_layout(ptr: *const u8, len: usize) -> *mut u8 {
    let bytes = std::slice::from_raw_parts(ptr, len);
    let result = match std::str::from_utf8(bytes) {
        Err(e) => format!(r#"{{"err":"invalid utf-8: {e}"}}"#),
        Ok(text) => match serde_json::from_str::<LayoutRequest>(text) {
            Err(e) => serde_json::to_string(&serde_json::json!({ "err": format!("request parse: {e}") }))
                .unwrap_or_else(|_| r#"{"err":"request parse"}"#.into()),
            Ok(req) => {
                let mut opts = layout::LayoutOptions::default();
                let sketch = req.layout.as_ref().map(|l| &l.positions);
                opts.use_sketch = sketch.is_some();
                let computed = layout::compute_with_sketch(&req.graph, &opts, sketch);
                match serde_json::to_string(&computed) {
                    Ok(json) => format!(r#"{{"ok":{json}}}"#),
                    Err(e) => format!(r#"{{"err":"serialize: {e}"}}"#),
                }
            }
        },
    };
    pack(result)
}
