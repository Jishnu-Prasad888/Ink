use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// Opens a file-picker dialog and returns the selected .md/.markdown paths.
#[tauri::command]
async fn open_file_dialog(app: AppHandle) -> Result<Vec<String>, String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] open_file_dialog called");

    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .pick_files(move |files| {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] dialog picked files: {:?}", files);
            let _ = tx.send(files);
        });

    match rx.recv() {
        Ok(Some(files)) => {
            let paths: Vec<String> = files.iter().map(|p| p.to_string()).collect();
            #[cfg(debug_assertions)]
            eprintln!("[RUST] open_file_dialog returning {:?}", paths);
            Ok(paths)
        }
        _ => Ok(vec![]),
    }
}

/// Opens a save dialog and returns the chosen destination path.
#[tauri::command]
async fn save_file_dialog(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] save_file_dialog called");

    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .save_file(move |file| {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] dialog save file: {:?}", file);
            let _ = tx.send(file);
        });

    match rx.recv() {
        Ok(Some(file)) => {
            let path = file.to_string();
            #[cfg(debug_assertions)]
            eprintln!("[RUST] save_file_dialog returning {:?}", path);
            Ok(Some(path))
        }
        _ => Ok(None),
    }
}

/// Reads the entire contents of a file as a UTF-8 string.
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] read_file called with path: {}", path);

    match fs::read_to_string(&path) {
        Ok(content) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] read_file success, {} bytes", content.len());
            Ok(content)
        }
        Err(e) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] read_file error: {}", e);
            Err(e.to_string())
        }
    }
}

/// Writes (overwrites) a file with the given content string.
#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] write_file called, path: {}, content length: {}", path, content.len());

    match fs::write(&path, content) {
        Ok(_) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] write_file success");
            Ok(())
        }
        Err(e) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] write_file error: {}", e);
            Err(e.to_string())
        }
    }
}

/// Returns basic metadata (name, last-modified epoch-seconds) for a file.
#[tauri::command]
async fn get_file_info(path: String) -> Result<serde_json::Value, String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] get_file_info called for {}", path);

    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .unwrap_or_else(|_| std::time::SystemTime::now())
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let result = serde_json::json!({
        "name": PathBuf::from(&path).file_name().unwrap_or_default().to_string_lossy(),
        "modified": modified,
    });
    #[cfg(debug_assertions)]
    eprintln!("[RUST] get_file_info returning {:?}", result);
    Ok(result)
}

/// Opens a native save dialog filtered to PDF and returns the chosen path.
#[tauri::command]
async fn save_pdf_dialog(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] save_pdf_dialog called");

    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("PDF Document", &["pdf"])
        .save_file(move |file| {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] dialog save pdf: {:?}", file);
            let _ = tx.send(file);
        });

    match rx.recv() {
        Ok(Some(file)) => {
            let path = file.to_string();
            #[cfg(debug_assertions)]
            eprintln!("[RUST] save_pdf_dialog returning {:?}", path);
            Ok(Some(path))
        }
        _ => Ok(None),
    }
}

/// Writes raw binary bytes to a file (used for PDF export).
#[tauri::command]
async fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] write_binary_file called, path: {}, bytes: {}", path, data.len());

    match fs::write(&path, data) {
        Ok(_) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] write_binary_file success");
            Ok(())
        }
        Err(e) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] write_binary_file error: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn get_opened_files(files: tauri::State<'_, Vec<String>>) -> Vec<String> {
    files.inner().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let initial_files: Vec<String> = args
        .into_iter()
        .skip(1)
        .filter(|arg| arg.ends_with(".md") || arg.ends_with(".markdown") || arg.ends_with(".txt"))
        .collect();

    tauri::Builder::default()
        .manage(initial_files)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] single-instance triggered with argv: {:?}", argv);

            if let Some(window) = app.get_webview_window("main") {
                let files: Vec<String> = argv
                    .iter()
                    .filter(|arg| {
                        let lower = arg.to_lowercase();
                        lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")
                    })
                    .map(|arg| arg.to_string())
                    .collect();

                if !files.is_empty() {
                    #[cfg(debug_assertions)]
                    eprintln!("[RUST] emitting open-files event with {:?}", files);
                    let _ = window.emit("open-files", files);
                }
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            save_pdf_dialog,
            read_file,
            write_file,
            write_binary_file,
            get_file_info,
            get_opened_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}