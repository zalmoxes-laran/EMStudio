// EMStudio desktop shell — wraps the web frontend. Native Open/Save/Save-As
// are provided by tauri-plugin-dialog + tauri-plugin-fs; the frontend
// (frontend/src/tauri.ts) detects the Tauri runtime and routes file I/O
// through them, falling back to browser download / <input type="file">
// when served as a plain web app. Native menus, recent files and direct
// em-core in-process calls land later.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running EMStudio");
}
