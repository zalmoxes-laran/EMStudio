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

// ── the LLM API key ────────────────────────────────────────────────────────
//
// EM Narrative can ask a model to draft a chapter (N5). That call needs an API
// key, and the key is the one genuinely dangerous thing this app holds. The
// rules, in order of importance:
//
//   * it NEVER reaches the frontend — no localStorage, no em.json, no log. The
//     webview can set it, clear it, and ask whether one exists; it can never
//     read it back.
//   * it lives in the OS keychain, not in a file we wrote.
//   * it reaches the model only through em-bridge's ENVIRONMENT, which is where
//     `tools/llm_provider.py` reads `ANTHROPIC_API_KEY` at call time.
//
// Without a keychain (a browser-served dev build) there is no safe place to put
// it, so the frontend says so and the user exports the env var before ./dev.sh.
// Degrading to "store it in plain text" would be worse than not offering it.

const KEYRING_SERVICE: &str = "org.extendedmatrix.emstudio";
const KEYRING_USER: &str = "anthropic-api-key";

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

/// The key, for injection into the sidecar's environment. Never returned to the
/// webview — only this file calls it.
fn stored_llm_key() -> Option<String> {
    keyring_entry().ok()?.get_password().ok()
}

/// Is a key set? A boolean, deliberately: the UI shows "impostata", not the key.
#[tauri::command]
fn llm_key_status() -> bool {
    stored_llm_key().is_some_and(|k| !k.trim().is_empty())
}

/// Store the key and restart the bridge so it picks it up.
///
/// The restart is not a nicety: the sidecar is spawned at launch, before the
/// user has pasted anything, and a process's environment cannot be changed from
/// outside. Without this, a key saved in Settings would appear to work and then
/// fail on every generation until the app was restarted.
#[tauri::command]
fn set_llm_key(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("empty key".into());
    }
    keyring_entry()?.set_password(&key).map_err(|e| e.to_string())?;
    restart_bridge(&app);
    Ok(true)
}

#[tauri::command]
fn clear_llm_key(app: tauri::AppHandle) -> Result<bool, String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(e.to_string()),
    }
    restart_bridge(&app);
    Ok(true)
}

/// Where the frontend should POST GraphML transform requests: a remote
/// StratiGraph server if configured, else the local sidecar.
#[tauri::command]
fn transformer_url() -> String {
    std::env::var("EM_TRANSFORMER_URL")
        .unwrap_or_else(|_| format!("http://localhost:{BRIDGE_PORT}"))
}

/// Spawn the bundled bridge, injecting the stored API key into its environment.
///
/// The key is passed as an env var and nowhere else: it is not an argument (a
/// `ps` listing would show it), not a file, not a log line.
fn spawn_bridge(app: &tauri::AppHandle) {
    let cmd = match app.shell().sidecar("em-bridge") {
        Ok(cmd) => cmd,
        Err(e) => {
            eprintln!("[emstudio] em-bridge sidecar not found: {e}");
            return;
        }
    };
    let mut env = std::collections::HashMap::new();
    if let Some(key) = stored_llm_key() {
        env.insert("ANTHROPIC_API_KEY".to_string(), key);
    }
    match cmd
        .args(["--port", BRIDGE_PORT, "--exit-with-parent"])
        .envs(env)
        .spawn()
    {
        Ok((mut rx, child)) => {
            app.state::<BridgeChild>().0.lock().unwrap().replace(child);
            // Drain the sidecar's stdout/stderr. If we drop the receiver, the
            // pipe's read end closes and the bridge's first print() hits EPIPE —
            // the Python server then dies with the socket already bound, i.e.
            // listening but never answering (the "transformer not reachable"
            // wedge).
            tauri::async_runtime::spawn(async move {
                while rx.recv().await.is_some() {}
            });
        }
        Err(e) => eprintln!("[emstudio] em-bridge sidecar spawn failed: {e}"),
    }
}

/// Kill the running sidecar and start a fresh one, so an environment change
/// (the API key) actually takes effect. A no-op when a remote transformer is
/// configured — there is no local process to restart.
fn restart_bridge(app: &tauri::AppHandle) {
    if std::env::var("EM_TRANSFORMER_URL").is_ok() {
        return;
    }
    if let Some(child) = app.state::<BridgeChild>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
    spawn_bridge(app);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(BridgeChild(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            transformer_url,
            llm_key_status,
            set_llm_key,
            clear_llm_key
        ])
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
            spawn_bridge(app.handle());
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
