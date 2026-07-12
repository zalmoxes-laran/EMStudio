// EMStudio desktop shell — phase 2: wraps the web frontend; the file is
// opened through the standard <input type="file"> / drag-and-drop paths,
// which WKWebView/WebView2 support natively. Native menus, recent files
// and direct em-core in-process calls land with the editing phase.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running EMStudio");
}
