use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::get};

use crate::AppState;
use crate::error::AppError;
use crate::models::Provider;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list_providers))
}

/// GET /api/v1/providers — list supported CDN providers.
async fn list_providers(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<Provider>>, AppError> {
    // For now, return a static list. This can be made dynamic later.
    let providers = vec![
        Provider {
            id: "cloudflare".to_string(),
            name: "Cloudflare".to_string(),
            description: "Cloudflare CDN IP ranges".to_string(),
        },
        Provider {
            id: "gcore".to_string(),
            name: "Gcore".to_string(),
            description: "Gcore CDN IP ranges".to_string(),
        },
    ];
    Ok(Json(providers))
}
