use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MeetingSignal {
    title: String,
    meeting_url: Option<String>,
    provider: String,
    source: String,
    capture_audio: bool,
}

#[tauri::command]
fn current_meeting_signal() -> MeetingSignal {
    // Placeholder command for the first desktop bridge slice.
    // The next implementation replaces this with OS-specific active window detection.
    MeetingSignal {
        title: "Desktop detected meeting".into(),
        meeting_url: None,
        provider: "unknown".into(),
        source: "auto-desktop".into(),
        capture_audio: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![current_meeting_signal])
        .run(tauri::generate_context!())
        .expect("error while running Mila desktop");
}
