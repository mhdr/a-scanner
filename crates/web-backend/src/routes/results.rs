use std::sync::Arc;

use axum::{
    Json,
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;

use crate::AppState;
use crate::error::AppError;
use a_scanner_core::facade;
use a_scanner_core::models::{AggregatedIpResult, PaginatedResponse, ScanResult};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/ips", get(list_aggregated_ips))
        .route("/ips/{ip}", get(get_ip_results))
        .route("/", get(list_results).delete(delete_all_results))
}

#[derive(Debug, Deserialize)]
pub struct ResultFilterParams {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    pub reachable_only: Option<bool>,
    pub provider: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IpFilterParams {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    pub provider: Option<String>,
}

/// DELETE /api/v1/results — delete all completed/failed scans and their results.
async fn delete_all_results(
    State(state): State<Arc<AppState>>,
) -> Result<StatusCode, AppError> {
    facade::delete_completed_scans(&state.core).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/results — list all scan results with optional filtering.
async fn list_results(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ResultFilterParams>,
) -> Result<Json<PaginatedResponse<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let resp = facade::list_results(
        &state.core,
        page,
        per_page,
        params.reachable_only,
        params.provider.as_deref(),
    )
    .await?;
    Ok(Json(resp))
}

/// GET /api/v1/results/ips — list aggregated (deduplicated) reachable IP results.
async fn list_aggregated_ips(
    State(state): State<Arc<AppState>>,
    Query(params): Query<IpFilterParams>,
) -> Result<Json<PaginatedResponse<AggregatedIpResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let resp = facade::list_aggregated_ips(
        &state.core,
        page,
        per_page,
        params.provider.as_deref(),
    )
    .await?;
    Ok(Json(resp))
}

/// GET /api/v1/results/ips/:ip — list all individual scan results for a specific IP.
async fn get_ip_results(
    State(state): State<Arc<AppState>>,
    Path(ip): Path<String>,
    Query(params): Query<ResultFilterParams>,
) -> Result<Json<PaginatedResponse<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let resp = facade::get_ip_results(&state.core, &ip, page, per_page).await?;
    Ok(Json(resp))
}
