use std::sync::Arc;

use axum::{
    Router,
    extract::{Path, Query, State, WebSocketUpgrade, ws::Message},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json,
};
use serde::Deserialize;

use crate::AppState;
use crate::models::ScanStatus;
use crate::services;

/// Query parameters for WebSocket auth.
#[derive(Debug, Deserialize)]
struct WsQuery {
    token: Option<String>,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/v1/scans/{id}/ws", get(scan_ws_handler))
}

/// GET /api/v1/scans/:id/ws?token=<jwt> — WebSocket endpoint for real-time scan progress.
///
/// Requires a valid JWT passed as the `token` query parameter.
/// If the scan is already completed/failed, sends a single status message and
/// closes. Otherwise, subscribes to the scan's broadcast channel and streams
/// progress events as JSON text frames.
async fn scan_ws_handler(
    State(state): State<Arc<AppState>>,
    Path(scan_id): Path<String>,
    Query(query): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    // Validate JWT from query parameter
    let token = match query.token {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Missing token query parameter" })),
            )
                .into_response();
        }
    };

    if let Err(_) = services::auth_service::validate_jwt(&token, &state.jwt_secret) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid or expired token" })),
        )
            .into_response();
    }

    ws.on_upgrade(move |mut socket| async move {
        // Look up the scan in the DB
        let scan = match services::scan_service::get_scan(&state.db, &scan_id).await {
            Ok(s) => s,
            Err(_) => {
                let _ = socket
                    .send(Message::Close(None))
                    .await;
                return;
            }
        };

        let status = ScanStatus::from_str(&scan.status);

        // If scan is already finished, send final state and close
        if status == ScanStatus::Completed || status == ScanStatus::Failed {
            let event = crate::models::ScanProgressEvent {
                scan_id: scan.id.clone(),
                status: scan.status.clone(),
                scanned_ips: scan.scanned_ips,
                working_ips: scan.working_ips,
                total_ips: scan.total_ips,
                phase: "done".to_string(),
            };
            if let Ok(json) = serde_json::to_string(&event) {
                let _ = socket.send(Message::Text(json.into())).await;
            }
            let _ = socket.send(Message::Close(None)).await;
            return;
        }

        // Subscribe to the broadcast channel for this scan
        let mut rx = match state.subscribe_scan(&scan_id).await {
            Some(rx) => rx,
            None => {
                // No channel yet (scan might still be in pending state).
                // Send current DB state and close — client will reconnect or poll.
                let event = crate::models::ScanProgressEvent {
                    scan_id: scan.id.clone(),
                    status: scan.status.clone(),
                    scanned_ips: scan.scanned_ips,
                    working_ips: scan.working_ips,
                    total_ips: scan.total_ips,
                    phase: "pending".to_string(),
                };
                if let Ok(json) = serde_json::to_string(&event) {
                    let _ = socket.send(Message::Text(json.into())).await;
                }
                let _ = socket.send(Message::Close(None)).await;
                return;
            }
        };

        // Stream progress events until the scan finishes or client disconnects
        loop {
            tokio::select! {
                result = rx.recv() => {
                    match result {
                        Ok(event) => {
                            let is_terminal = event.status == "completed" || event.status == "failed";
                            if let Ok(json) = serde_json::to_string(&event) {
                                if socket.send(Message::Text(json.into())).await.is_err() {
                                    // Client disconnected
                                    break;
                                }
                            }
                            if is_terminal {
                                let _ = socket.send(Message::Close(None)).await;
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            tracing::debug!("WS client lagged by {} messages for scan {}", n, scan_id);
                            // Continue — we'll get the next event
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                            // Channel closed — scan finished
                            break;
                        }
                    }
                }
                // Also listen for incoming messages (client close / ping)
                msg = socket.recv() => {
                    match msg {
                        Some(Ok(Message::Close(_))) | None => break,
                        _ => {} // Ignore other client messages
                    }
                }
            }
        }
    })
    .into_response()
}
