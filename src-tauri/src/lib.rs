use atomicwrites::{AllowOverwrite, AtomicFile};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter, Manager};

/// Opens a file-picker dialog for documents supported by the workspace.
#[tauri::command]
async fn open_file_dialog(app: AppHandle) -> Result<Vec<String>, String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] open_file_dialog called");

    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("Documents", &["md", "markdown", "txt", "pdf"])
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

fn modified_timestamp(path: &Path) -> Result<u64, String> {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|error| error.to_string())?
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .map_err(|error| error.to_string())
}

fn file_fingerprint(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    AtomicFile::new(path, AllowOverwrite)
        .write(|file| file.write_all(data))
        .map_err(|error| error.to_string())
}

fn write_text_file(
    path: &Path,
    content: &str,
    expected_fingerprint: Option<&str>,
    force: bool,
) -> Result<serde_json::Value, String> {
    if !force && let Some(expected) = expected_fingerprint {
        let current = file_fingerprint(path)?;
        if current != expected {
            return Err("FILE_MODIFIED: The file changed on disk".to_string());
        }
    }

    atomic_write(path, content.as_bytes())?;
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "modified": modified_timestamp(path)?,
        "fingerprint": file_fingerprint(path)?,
        "size": metadata.len(),
    }))
}

/// Atomically writes a text file and rejects stale overwrites by default.
#[tauri::command]
async fn write_file(
    path: String,
    content: String,
    expected_fingerprint: Option<String>,
    force: Option<bool>,
) -> Result<serde_json::Value, String> {
    #[cfg(debug_assertions)]
    eprintln!(
        "[RUST] write_file called, path: {}, content length: {}",
        path,
        content.len()
    );

    write_text_file(
        Path::new(&path),
        &content,
        expected_fingerprint.as_deref(),
        force.unwrap_or(false),
    )
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
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    let result = serde_json::json!({
        "name": PathBuf::from(&path).file_name().unwrap_or_default().to_string_lossy(),
        "modified": modified,
        "fingerprint": file_fingerprint(Path::new(&path))?,
        "size": metadata.len(),
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
    eprintln!(
        "[RUST] write_binary_file called, path: {}, bytes: {}",
        path,
        data.len()
    );

    match atomic_write(Path::new(&path), &data) {
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

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let initial_files: Vec<String> = args
        .into_iter()
        .skip(1)
        .filter(|arg| {
            let lower = arg.to_lowercase();
            lower.ends_with(".md")
                || lower.ends_with(".markdown")
                || lower.ends_with(".txt")
                || lower.ends_with(".pdf")
        })
        .collect();

    tauri::Builder::default()
        .manage(initial_files)
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] single-instance triggered with argv: {:?}", argv);

            if let Some(window) = app.get_webview_window("main") {
                let files: Vec<String> = argv
                    .iter()
                    .filter(|arg| {
                        let lower = arg.to_lowercase();
                        lower.ends_with(".md")
                            || lower.ends_with(".markdown")
                            || lower.ends_with(".txt")
                            || lower.ends_with(".pdf")
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            save_pdf_dialog,
            read_file,
            write_file,
            write_binary_file,
            get_file_info,
            get_opened_files,
            quit_app,
            read_dir,
            create_file,
            create_dir,
            delete_item,
            read_file_binary,
            open_folder_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn read_dir(path: String) -> Result<Vec<serde_json::Value>, String> {
    use std::fs;

    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().to_string_lossy().to_string();

        // Only show directories and markdown/PDF files
        let lower_name = name.to_lowercase();
        let is_supported = !file_type.is_dir()
            && (lower_name.ends_with(".md")
                || lower_name.ends_with(".markdown")
                || lower_name.ends_with(".txt")
                || lower_name.ends_with(".pdf"));

        if file_type.is_dir() || is_supported {
            result.push(serde_json::json!({
                "name": name,
                "path": path,
                "is_dir": file_type.is_dir(),
            }));
        }
    }
    // Sort: directories first, then files
    result.sort_by(|a, b| {
        let a_dir = a["is_dir"].as_bool().unwrap_or(false);
        let b_dir = b["is_dir"].as_bool().unwrap_or(false);
        if a_dir && !b_dir {
            std::cmp::Ordering::Less
        } else if !a_dir && b_dir {
            std::cmp::Ordering::Greater
        } else {
            a["name"]
                .as_str()
                .unwrap_or("")
                .to_lowercase()
                .cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
        }
    });
    Ok(result)
}

#[tauri::command]
async fn create_file(parent_path: String, name: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::path::PathBuf;

    validate_child_name(&name)?;
    let mut path = PathBuf::from(parent_path);
    path.push(&name);
    if !name.ends_with(".md") && !name.ends_with(".markdown") {
        path.set_extension("md");
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn create_dir(parent_path: String, name: String) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    validate_child_name(&name)?;
    let mut path = PathBuf::from(parent_path);
    path.push(&name);
    fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(())
}

fn validate_child_name(name: &str) -> Result<(), String> {
    let mut components = Path::new(name).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) if !name.trim().is_empty() => Ok(()),
        _ => Err("Name must be a single file or folder name".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{file_fingerprint, validate_child_name, write_text_file};
    use std::fs;

    #[test]
    fn accepts_single_safe_component() {
        assert!(validate_child_name("notes.md").is_ok());
        assert!(validate_child_name("Project notes").is_ok());
    }

    #[test]
    fn rejects_path_traversal_and_absolute_paths() {
        assert!(validate_child_name("../notes.md").is_err());
        assert!(validate_child_name("folder/notes.md").is_err());
        assert!(validate_child_name("/tmp/notes.md").is_err());
        assert!(validate_child_name(".").is_err());
    }

    #[test]
    fn rejects_stale_writes_without_losing_existing_content() {
        let path = std::env::temp_dir().join(format!(
            "ink-atomic-write-{}-{}.md",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ));
        fs::write(&path, "original").unwrap();
        let fingerprint = file_fingerprint(&path).unwrap();

        write_text_file(&path, "external change", Some(&fingerprint), false).unwrap();
        let result = write_text_file(&path, "stale editor", Some(&fingerprint), false);

        assert!(result.unwrap_err().starts_with("FILE_MODIFIED:"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "external change");
        fs::remove_file(path).unwrap();
    }
}

#[tauri::command]
async fn delete_item(path: String) -> Result<(), String> {
    use std::fs;
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] read_file_binary called with path: {}", path);

    match std::fs::read(&path) {
        Ok(bytes) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] read_file_binary success, {} bytes", bytes.len());
            Ok(bytes)
        }
        Err(e) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] read_file_binary error: {}", e);
            Err(format!("Failed to read file: {}", e))
        }
    }
}

#[tauri::command]
async fn open_folder_dialog(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog().file().pick_folders(move |folders| {
        let _ = tx.send(folders);
    });

    match rx.recv() {
        Ok(Some(folders)) => {
            let paths: Vec<String> = folders.iter().map(|p| p.to_string()).collect();
            #[cfg(debug_assertions)]
            eprintln!("[RUST] open_folder_dialog returning {:?}", paths);
            Ok(paths)
        }
        Ok(None) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] open_folder_dialog cancelled");
            Ok(vec![])
        }
        Err(_) => {
            #[cfg(debug_assertions)]
            eprintln!("[RUST] open_folder_dialog channel error");
            Ok(vec![])
        }
    }
}
