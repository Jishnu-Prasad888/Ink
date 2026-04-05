#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(debug_assertions)]
    eprintln!("[RUST] Application started in DEV mode");
    ink_lib::run();
}