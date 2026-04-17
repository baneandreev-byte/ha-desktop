use serde::{Deserialize, Serialize};


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HaInstance {
    pub id: String,
    pub name: String,
    pub url: String,
    pub token: String,
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HaState {
    pub entity_id: String,
    pub state: String,
    pub attributes: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Fetch all entity states from a HA instance
#[tauri::command]
async fn ha_get_states(url: String, token: String) -> Result<ApiResponse, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true) // allow self-signed certs (local HA)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(format!("{}/api/states", url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        })
    } else {
        Ok(ApiResponse {
            success: false,
            data: None,
            error: Some(format!("HTTP {}", response.status())),
        })
    }
}

/// Call a HA service (e.g. light.turn_on)
#[tauri::command]
async fn ha_call_service(
    url: String,
    token: String,
    domain: String,
    service: String,
    entity_id: String,
    extra: Option<serde_json::Value>,
) -> Result<ApiResponse, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut body = serde_json::json!({ "entity_id": entity_id });
    if let Some(extra_data) = extra {
        if let serde_json::Value::Object(map) = extra_data {
            if let serde_json::Value::Object(ref mut b) = body {
                b.extend(map);
            }
        }
    }

    let response = client
        .post(format!(
            "{}/api/services/{}/{}",
            url.trim_end_matches('/'),
            domain,
            service
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        Ok(ApiResponse {
            success: true,
            data: None,
            error: None,
        })
    } else {
        Ok(ApiResponse {
            success: false,
            data: None,
            error: Some(format!("HTTP {}", response.status())),
        })
    }
}

/// Test connection to a HA instance
#[tauri::command]
async fn ha_test_connection(url: String, token: String) -> Result<ApiResponse, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(format!("{}/api/", url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        })
    } else {
        Ok(ApiResponse {
            success: false,
            data: None,
            error: Some(format!("HTTP {}", response.status())),
        })
    }
}

/// Open HA in a native WebviewWindow (bypasses X-Frame-Options)
#[tauri::command]
fn show_ha_webview(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};

    // Close existing HA window if present
    if let Some(v) = app.get_webview_window("ha-view") {
        let _ = v.close();
    }

    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;

    WebviewWindowBuilder::new(&app, "ha-view", WebviewUrl::External(parsed))
        .title("Home Assistant")
        .inner_size(1280.0, 900.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn hide_ha_webview(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(v) = app.get_webview_window("ha-view") {
        let _ = v.close();
    }
}

#[tauri::command]
async fn window_minimize(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
async fn window_maximize(window: tauri::WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
async fn window_close(window: tauri::WebviewWindow) {
    let _ = window.close();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            ha_get_states,
            ha_call_service,
            ha_test_connection,
            window_minimize,
            window_maximize,
            window_close,
            show_ha_webview,
            hide_ha_webview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
