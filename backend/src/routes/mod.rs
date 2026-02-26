pub mod providers;
pub mod results;
pub mod scans;

use crate::AppState;
use axum::Router;
use std::sync::Arc;

/// Build the API router with all versioned routes.
pub fn api_router() -> Router<Arc<AppState>> {
    Router::new()
        .nest("/api/v1/scans", scans::router())
        .nest("/api/v1/results", results::router())
        .nest("/api/v1/providers", providers::router())
}
