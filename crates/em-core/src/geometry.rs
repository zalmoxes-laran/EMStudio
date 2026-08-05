//! Per-node-type box geometry, read from the s3Dgraphy visual rules.
//!
//! Until EM1 every leaf node got the same box — `default_node_w × default_node_h`
//! (90×32) — whatever its type. That was fine while every type was drawn as a
//! full-box shape, and stopped being fine when BR became a black rhombus at 0.7×
//! height: the drawing was 22×22 and the box it reserved (and the box the click
//! answered to) was still 90×32.
//!
//! # Why the table is COMPILED IN, from the vendored datamodel
//!
//! `lib.rs` promises that the EM language is not hardcoded here, and it is not:
//! this module hardcodes no type and no number, it reads
//! `frontend/src/assets/em_visual_rules.json` — the pinned vendored copy that
//! `frontend/scripts/sync-datamodels.sh` refreshes from s3Dgraphy (ADR-001), the
//! same file `palette.ts` and the renderer read.
//!
//! Compile time rather than runtime for one reason, and it is the determinism
//! contract (invariant 7): the same document must lay out identically in the CLI,
//! in WASM and on the desktop. A table passed in by each caller would make that
//! true only as long as three callers agreed; a table baked from one file makes it
//! true by construction. The WASM delivery could not read the file at runtime
//! anyway — it is a single inlined binary with no filesystem.
//!
//! If the vendored file moves, this crate stops compiling. That is the intended
//! failure: loud, at build time, instead of a layout that silently drifts.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The vendored visual rules. See the module docs for why this is `include_str!`.
const VISUAL_RULES_JSON: &str =
    include_str!("../../../frontend/src/assets/em_visual_rules.json");

/// How one node type's box differs from the default box.
///
/// Deliberately only the two things the visual rules state about the SHAPE's
/// extent — nothing about how the shape looks, which is the renderer's business:
///
/// * `scale` ← `style.shape_scale` (BR: 0.7). A marker is punctuation, not a unit.
/// * `square` ← `style.shape_bbox == "square"` (BR). Without it a diamond in a
///   90×32 box is a flattened lozenge; with it the rhombus is equilateral.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TypeBox {
    pub scale: f64,
    pub square: bool,
}

impl Default for TypeBox {
    fn default() -> Self {
        Self { scale: 1.0, square: false }
    }
}

impl TypeBox {
    /// Apply to a default box. Returns `(w, h)`.
    ///
    /// `square` takes the SMALLER side, never the larger: a box that grew would
    /// overlap its neighbours and claim clicks that belong to them.
    pub fn apply(&self, w: f64, h: f64) -> (f64, f64) {
        let (mut bw, mut bh) = (w * self.scale, h * self.scale);
        if self.square {
            let side = bw.min(bh);
            bw = side;
            bh = side;
        }
        (bw, bh)
    }

    /// True when this is the default box — nothing to do.
    pub fn is_identity(&self) -> bool {
        self.scale == 1.0 && !self.square
    }
}

/// `node_type` → box geometry, for the types that declare one.
pub type TypeBoxes = BTreeMap<String, TypeBox>;

/// Node data key that makes a single node a glyph regardless of its type (EM2).
///
/// A DTC node picks its glyph per NODE from `data.dtc_kind` — a plain `link` is a
/// chain, a `link` with a kind is a photograph, a mesh, a laser scan. So this one
/// cannot be answered from the type table and is checked on the node itself; see
/// [`glyph_box`].
pub const GLYPH_BY_DATA_KEY: &str = "dtc_kind";

/// The box of a node that draws as a centred square glyph: square, full size.
///
/// EM2 reuses EM1's mechanism rather than adding a second one — a glyph type is
/// simply a type whose bounding box is square, exactly like BR, only without BR's
/// 0.7 shrink. The consequence is what EM2 is for: the right edge of the box lands
/// on the right edge of the glyph, so the connect handle (anchored there) touches
/// the glyph instead of floating in an empty margin.
pub const fn glyph_box() -> TypeBox {
    TypeBox { scale: 1.0, square: true }
}

/// Parse a visual-rules document into a box table.
///
/// Two sources inside the same file, both data:
///
/// * `node_styles.<abbr>.style` → `shape_scale` / `shape_bbox` (EM1, BR);
/// * `2d_render_glyph_types.types` → the node types drawn as a centred square
///   glyph (EM2), which get [`glyph_box`].
///
/// Only entries that actually say something are kept, so a lookup miss and an
/// identity entry are the same thing and callers need no special case.
///
/// NB the two blocks are keyed differently in the datamodel and that is
/// deliberate: `node_styles` uses the short abbreviation (`BR`, `EXT`), the glyph
/// list uses the runtime `node_type` (`extractor`). This engine knows node types
/// and not abbreviations, which is why the glyph list is the one it can read at
/// all — see the `_comment` on that block.
pub fn type_boxes_from_json(json: &str) -> TypeBoxes {
    let mut out = TypeBoxes::new();
    let Ok(doc) = serde_json::from_str::<serde_json::Value>(json) else {
        // A malformed vendored file is a build/vendoring problem, not a reason to
        // refuse to lay out: fall back to uniform boxes, which is the behaviour
        // this table replaces.
        return out;
    };
    if let Some(styles) = doc.get("node_styles").and_then(|v| v.as_object()) {
        for (node_type, entry) in styles {
            let Some(style) = entry.get("style") else { continue };
            let scale = style
                .get("shape_scale")
                .and_then(|v| v.as_f64())
                .filter(|s| *s > 0.0 && *s <= 1.0)
                .unwrap_or(1.0);
            let square = style.get("shape_bbox").and_then(|v| v.as_str()) == Some("square");
            let tb = TypeBox { scale, square };
            if !tb.is_identity() {
                out.insert(node_type.clone(), tb);
            }
        }
    }
    if let Some(types) = doc
        .get("2d_render_glyph_types")
        .and_then(|v| v.get("types"))
        .and_then(|v| v.as_array())
    {
        for t in types.iter().filter_map(|v| v.as_str()) {
            // A type that also declares shape geometry keeps it: the explicit
            // per-style declaration is the more specific statement.
            out.entry(t.to_string()).or_insert_with(glyph_box);
        }
    }
    out
}

/// The table for the vendored datamodel — what every delivery uses.
pub fn type_boxes() -> TypeBoxes {
    type_boxes_from_json(VISUAL_RULES_JSON)
}

/// The box for a node type: its own if it declares one, else the default.
pub fn box_for(boxes: &TypeBoxes, node_type: &str, w: f64, h: f64) -> (f64, f64) {
    match boxes.get(node_type) {
        Some(tb) => tb.apply(w, h),
        None => (w, h),
    }
}

/// The box for a NODE: its type's, unless the node itself carries a glyph.
///
/// `glyph_by_data` is the per-node escape hatch EM2 needs for the DTC profile
/// (`data.dtc_kind`): those nodes draw a glyph although their type does not say
/// so, and a node drawn as a glyph must get the glyph's square box or the connect
/// handle drifts away from it again.
///
/// The node's own glyph WINS over the type table, because it is the more specific
/// statement — and in practice the only types it applies to (`link`,
/// `dtc_process`) declare no box geometry at all.
pub fn box_for_node(
    boxes: &TypeBoxes,
    node_type: &str,
    glyph_by_data: bool,
    w: f64,
    h: f64,
) -> (f64, f64) {
    if glyph_by_data {
        return glyph_box().apply(w, h);
    }
    box_for(boxes, node_type, w, h)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_vendored_rules_are_readable_and_declare_br() {
        let boxes = type_boxes();
        // BR is the type EM1 exists for. If this fails, either the vendored copy
        // moved or the visual rules stopped declaring the marker's geometry —
        // both are worth failing a build over, because the alternative is a
        // 90×32 click target around a 22 px rhombus.
        let br = boxes.get("BR").expect("BR must declare a box in em_visual_rules");
        assert_eq!(br.scale, 0.7);
        assert!(br.square);
    }

    #[test]
    fn a_square_box_takes_the_smaller_side() {
        let (w, h) = TypeBox { scale: 0.7, square: true }.apply(90.0, 32.0);
        assert_eq!((w, h), (22.4, 22.4));
        // and never grows: 32*0.7 = 22.4 < 90*0.7 = 63
        assert!(w <= 90.0 && h <= 32.0);
    }

    #[test]
    fn an_undeclared_type_keeps_the_default_box() {
        let boxes = type_boxes();
        assert_eq!(box_for(&boxes, "US", 90.0, 32.0), (90.0, 32.0));
        assert_eq!(box_for(&boxes, "not_a_type", 90.0, 32.0), (90.0, 32.0));
    }

    #[test]
    fn scale_alone_does_not_square_the_box() {
        let (w, h) = TypeBox { scale: 0.5, square: false }.apply(90.0, 32.0);
        assert_eq!((w, h), (45.0, 16.0));
    }

    #[test]
    fn the_glyph_types_get_a_square_box_the_same_way_br_does() {
        let boxes = type_boxes();
        // EM2: every type the renderer draws as a centred glyph must be square,
        // so the right edge of the box IS the right edge of the glyph and the
        // connect handle lands on it. `extractor` is E.D.'s reported case.
        for t in ["extractor", "combiner", "author", "license", "narrative"] {
            let tb = boxes
                .get(t)
                .unwrap_or_else(|| panic!("{t} must be a declared glyph type"));
            assert!(tb.square, "{t} must have a SQUARE box");
            assert_eq!(tb.scale, 1.0, "{t} is full size — only BR shrinks");
            assert_eq!(box_for(&boxes, t, 90.0, 32.0), (32.0, 32.0));
        }
    }

    #[test]
    fn the_types_with_custom_geometry_stay_rectangular() {
        let boxes = type_boxes();
        // `document` is a sheet with a folded corner and `property` a bracketed
        // text annotation: neither is square, and squaring them would crush the
        // text they exist to carry. US and the two voids are shapes, not glyphs.
        for t in ["document", "property", "US", "USN", "USNt"] {
            assert_eq!(
                box_for(&boxes, t, 90.0, 32.0),
                (90.0, 32.0),
                "{t} must keep the default rectangular box"
            );
        }
    }

    #[test]
    fn a_node_carrying_a_dtc_kind_is_a_glyph_whatever_its_type_says() {
        let boxes = type_boxes();
        // A plain `link` is a chain drawn in its box…
        assert_eq!(box_for_node(&boxes, "link", false, 90.0, 32.0), (90.0, 32.0));
        // …the same `link` with a DTC kind draws a photograph/mesh/laser-scan
        // glyph, so it takes the square box even though its TYPE says nothing.
        assert_eq!(box_for_node(&boxes, "link", true, 90.0, 32.0), (32.0, 32.0));
    }

    #[test]
    fn the_square_side_never_depends_on_an_image() {
        // The determinism requirement spelled out: the side is the node HEIGHT,
        // a number the engine already owns. Nothing here reads a file, decodes a
        // bitmap or asks for an aspect ratio, so the box cannot change when an
        // icon finishes loading — the layout is the same before and after.
        let tb = glyph_box();
        assert_eq!(tb.apply(90.0, 32.0), (32.0, 32.0));
        assert_eq!(tb.apply(120.0, 40.0), (40.0, 40.0));
        // and it never grows, whatever the aspect of the drawing inside it
        let (w, h) = tb.apply(20.0, 60.0);
        assert!(w <= 20.0 && h <= 60.0 && w == h);
    }

    #[test]
    fn a_malformed_or_empty_rules_file_degrades_to_uniform_boxes() {
        assert!(type_boxes_from_json("not json").is_empty());
        assert!(type_boxes_from_json("{}").is_empty());
        // an out-of-range scale is ignored rather than trusted
        let t = type_boxes_from_json(
            r#"{"node_styles":{"X":{"style":{"shape_scale":0}}}}"#,
        );
        assert!(t.is_empty(), "a zero scale would collapse the node to nothing");
    }
}
