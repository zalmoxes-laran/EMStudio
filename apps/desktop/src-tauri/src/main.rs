// EMStudio desktop shell — wraps the web frontend. Native Open/Save/Save-As
// come from tauri-plugin-dialog + tauri-plugin-fs (routed in
// frontend/src/tauri.ts).
//
// GraphML import/export can't run in the webview (invariant 2: the EM
// transformer is s3Dgraphy, in Python). The frontend POSTs to an HTTP
// "transformer" service exposing /graphml + /import-graphml. That service is
// PLUGGABLE:
//   * EM_TRANSFORMER_URL set  → use that endpoint (e.g. a remote StratiGraph
//     server, one of several dockerised services) and start nothing locally;
//   * otherwise               → spawn the bundled `em-bridge` sidecar
//     (tools/em_bridge.py frozen with s3Dgraphy, see build-bridge.sh) on
//     localhost and use it — the silent local pipe.
// The frontend asks which URL to use via the `transformer_url` command.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Port the local sidecar listens on (matches the frontend browser-dev
/// default, so `?bridge=`/`EM_BRIDGE` overrides still line up).
const BRIDGE_PORT: &str = "8765";

/// Holds the spawned sidecar so we can kill it when the app exits.
struct BridgeChild(Mutex<Option<CommandChild>>);

/// Where the frontend should POST GraphML transform requests: a remote
/// StratiGraph server if configured, else the local sidecar.
#[tauri::command]
fn transformer_url() -> String {
    std::env::var("EM_TRANSFORMER_URL")
        .unwrap_or_else(|_| format!("http://localhost:{BRIDGE_PORT}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(BridgeChild(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![transformer_url])
        .setup(|app| {
            // A remote transformer is configured → nothing to start locally.
            if std::env::var("EM_TRANSFORMER_URL").is_ok() {
                return Ok(());
            }
            // Silent local pipe: spawn the frozen s3Dgraphy bridge. If the
            // sidecar is missing (build-bridge.sh not run) or the port is
            // already taken (a dev ./dev.sh bridge), we just log and carry on —
            // the frontend still reaches whatever is on localhost:8765, and the
            // GraphML buttons surface a clear toast if nothing answers.
            match app.shell().sidecar("em-bridge") {
                Ok(cmd) => match cmd
                    .args(["--port", BRIDGE_PORT, "--exit-with-parent"])
                    .spawn()
                {
                    Ok((mut rx, child)) => {
                        app.state::<BridgeChild>().0.lock().unwrap().replace(child);
                        // Drain the sidecar's stdout/stderr. If we drop the
                        // receiver, the pipe's read end closes and the bridge's
                        // first print() hits EPIPE — the Python server then dies
                        // with the socket already bound, i.e. listening but never
                        // answering (the "transformer not reachable" wedge).
                        tauri::async_runtime::spawn(async move {
                            while rx.recv().await.is_some() {}
                        });
                    }
                    Err(e) => eprintln!("[emstudio] em-bridge sidecar spawn failed: {e}"),
                },
                Err(e) => eprintln!("[emstudio] em-bridge sidecar not found: {e}"),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building EMStudio")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(child) = app.state::<BridgeChild>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
