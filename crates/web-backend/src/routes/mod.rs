pub mod auth;
pub mod providers;
pub mod results;
pub mod scans;
mod static_files;
pub mod ws;

use crate::AppState;
use axum::{
    Router,
    middleware,
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

/// Middleware that rejects requests without a valid JWT.
/// Login endpoint is excluded by placing it outside this layer.
async fn require_auth(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: middleware::Next,
) -> Response {
    // Extract token from Authorization header
    let token = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match token {
        Some(t) => {
            match a_scanner_core::services::auth_service::validate_jwt(t, &state.jwt_secret) {
                Ok(_claims) => next.run(req).await,
                Err(_) => (
                    StatusCode::UNAUTHORIZED,
                    axum::Json(serde_json::json!({ "error": "Invalid or expired token" })),
                )
                    .into_response(),
            }
        }
        None => (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({ "error": "Missing authorization header" })),
        )
            .into_response(),
    }
}

/// Build the API router with all versioned routes.
pub fn api_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    // Public routes (no auth required)
    let public = Router::new().nest("/api/v1/auth", auth::router());

    // Protected routes (require valid JWT)
    let protected = Router::new()
        .nest("/api/v1/scans", scans::router())
        .nest("/api/v1/results", results::router())
        .nest("/api/v1/providers", providers::router())
        .layer(middleware::from_fn_with_state(state, require_auth));

    public.merge(protected)
}

/// Build the full application router with API routes and embedded frontend.
pub fn app_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    // Public routes
    let public = Router::new().nest("/api/v1/auth", auth::router());

    // Protected API routes
    let protected = Router::new()
        .nest("/api/v1/scans", scans::router())
        .nest("/api/v1/results", results::router())
        .nest("/api/v1/providers", providers::router())
        .layer(middleware::from_fn_with_state(state, require_auth));

    // WebSocket (auth handled inside the handler via query param)
    let websocket = ws::router();

    public
        .merge(protected)
        .merge(websocket)
        .fallback(static_files::static_handler)
}
