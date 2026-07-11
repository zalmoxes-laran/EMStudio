//! EMStudio CLI — phase 1 surface (no external arg-parsing deps):
//!
//!   emstudio validate <file.em.json>
//!   emstudio layout   <file.em.json> [-o <out.em.json>]
//!   emstudio stats    <file.em.json>
//!
//! Exit codes: 0 ok, 1 validation/parse error, 2 usage.

use em_core::{emjson, layout};
use std::fs;
use std::process::ExitCode;

fn usage() -> ExitCode {
    eprintln!("usage: emstudio <validate|layout|stats> <file.em.json> [-o out.em.json]");
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 2 {
        return usage();
    }
    let cmd = args[0].as_str();
    let path = args[1].as_str();

    let src = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {path}: {e}");
            return ExitCode::from(1);
        }
    };
    let (doc, warnings) = match emjson::from_str(&src) {
        Ok(x) => x,
        Err(e) => {
            eprintln!("error: {e:?}");
            return ExitCode::from(1);
        }
    };
    for w in &warnings {
        eprintln!("warning: {w}");
    }

    match cmd {
        "validate" => {
            println!(
                "OK {} v{} — graph '{}': {} nodes, {} edges, layout: {}",
                doc.header.format,
                doc.header.version,
                doc.graph.graph_id,
                doc.graph.nodes.len(),
                doc.graph.edges.len(),
                if doc.layout.is_some() { "present" } else { "absent" }
            );
            ExitCode::SUCCESS
        }
        "stats" => {
            let mut by_type: std::collections::BTreeMap<&str, usize> =
                std::collections::BTreeMap::new();
            for n in &doc.graph.nodes {
                *by_type.entry(n.node_type.as_str()).or_default() += 1;
            }
            println!("graph '{}'", doc.graph.graph_id);
            for (t, c) in by_type {
                println!("  {t:<24} {c}");
            }
            ExitCode::SUCCESS
        }
        "layout" => {
            let mut doc = doc;
            let computed = layout::compute(&doc.graph, &layout::LayoutOptions::default());
            println!(
                "layout: {} lanes, {} positions, canvas {:.0}x{:.0}",
                computed.swimlanes.len(),
                computed.positions.len(),
                computed.canvas.width,
                computed.canvas.height
            );
            doc.layout = Some(computed);
            let out = args
                .iter()
                .position(|a| a == "-o")
                .and_then(|i| args.get(i + 1))
                .cloned();
            match out {
                Some(out_path) => match emjson::to_string_pretty(&doc) {
                    Ok(s) => {
                        if let Err(e) = fs::write(&out_path, s + "\n") {
                            eprintln!("error: cannot write {out_path}: {e}");
                            return ExitCode::from(1);
                        }
                        println!("written: {out_path}");
                        ExitCode::SUCCESS
                    }
                    Err(e) => {
                        eprintln!("error: {e:?}");
                        ExitCode::from(1)
                    }
                },
                None => ExitCode::SUCCESS,
            }
        }
        _ => usage(),
    }
}
