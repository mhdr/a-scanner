use std::sync::Arc;

use axum::{
    Json,
    Router,
    extract::{Query, State},
    routing::get,
};
use serde::Deserialize;

use crate::AppState;
use crate::error::AppError;
use crate::models::ScanResult;
use crate::services;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list_results))
}

#[derive(Debug, Deserialize)]
pub struct ResultFilterParams {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    pub reachable_only: Option<bool>,
    pub provider: Option<String>,
}

/// GET /api/v1/results — list all scan results with optional filtering.
async fn list_results(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ResultFilterParams>,
) -> Result<Json<Vec<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let results = services::result_service::list_results(
        &state.db,
        page,
        per_page,
        params.reachable_only,
        params.provider.as_deref(),
    )
    .await?;
    Ok(Json(results))
}
