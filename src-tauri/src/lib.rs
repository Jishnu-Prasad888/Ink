use std::fs;
use std::path::PathBuf;
use tauri::{Manager, Window};

#[tauri::command]
async fn open_file_dialog(window: Window) -> Result<Vec<String>, String> {
    use tauri::api::dialog::FileDialogBuilder;
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    FileDialogBuilder::new()
        .add_filter("Markdown", &["md", "markdown"])
        .set_title("Open Markdown File")
        .pick_files(move |files| {
            let _ = tx.send(files);
        });
    
    match rx.recv() {
        Ok(Some(files)) => Ok(files.iter().map(|p| p.to_string_lossy().to_string()).collect()),
        _ => Ok(vec![]),
    }
}

#[tauri::command]
async fn save_file_dialog() -> Result<Option<String>, String> {
    use tauri::api::dialog::FileDialogBuilder;
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    FileDialogBuilder::new()
        .add_filter("Markdown", &["md"])
        .set_title("Save Markdown File")
        .save_file(move |file| {
            let _ = tx.send(file);
        });
    
    match rx.recv() {
        Ok(Some(file)) => Ok(Some(file.to_string_lossy().to_string())),
        _ => Ok(None),
    }
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_info(path: String) -> Result<serde_json::Value, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "name": PathBuf::from(&path).file_name().unwrap_or_default().to_string_lossy(),
        "modified": metadata.modified().unwrap_or_else(|_| std::time::SystemTime::now()).duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Handle second instance - send file paths to existing window
            let window = app.get_window("main").unwrap();
            let files: Vec<String> = argv
                .iter()
                .filter(|arg| arg.ends_with(".md") || arg.ends_with(".markdown"))
                .map(|arg| arg.to_string())
                .collect();
            
            if !files.is_empty() {
                window.emit("open-files", files).unwrap();
            }
            window.set_focus().unwrap();
        }))
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            read_file,
            write_file,
            get_file_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}