use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// Opens a file-picker dialog and returns the selected .md/.markdown paths.
/// Supports picking multiple files.
#[tauri::command]
async fn open_file_dialog(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .pick_files(move |files| {
            // files is Option<Vec<FilePath>>
            let _ = tx.send(files);
        });

    match rx.recv() {
        Ok(Some(files)) => Ok(files
            .iter()
            .map(|p| p.to_string())
            .collect()),
        _ => Ok(vec![]),
    }
}

/// Opens a save dialog and returns the chosen destination path.
#[tauri::command]
async fn save_file_dialog(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .save_file(move |file| {
            // file is Option<FilePath>
            let _ = tx.send(file);
        });

    match rx.recv() {
        Ok(Some(file)) => Ok(Some(file.to_string())),
        _ => Ok(None),
    }
}

/// Reads the entire contents of a file as a UTF-8 string.
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Writes (overwrites) a file with the given content string.
#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Returns basic metadata (name, last-modified epoch-seconds) for a file.
#[tauri::command]
async fn get_file_info(path: String) -> Result<serde_json::Value, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .unwrap_or_else(|_| std::time::SystemTime::now())
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(serde_json::json!({
        "name": PathBuf::from(&path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
        "modified": modified,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // All plugins must be registered here, in the builder that actually runs.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second instance was launched – forward any .md paths to the
            // already-running window and bring it to the front.
            if let Some(window) = app.get_webview_window("main") {
                let files: Vec<String> = argv
                    .iter()
                    .filter(|arg| arg.ends_with(".md") || arg.ends_with(".markdown"))
                    .map(|arg| arg.to_string())
                    .collect();

                if !files.is_empty() {
                    let _ = window.emit("open-files", files);
                }
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            read_file,
            write_file,
            get_file_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}