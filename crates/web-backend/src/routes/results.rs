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
use a_scanner_core::models::{AggregatedIpResult, PaginatedResponse, ScanResult};
use a_scanner_core::services;

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
    services::scan_service::delete_all_completed_scans(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/results — list all scan results with optional filtering.
async fn list_results(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ResultFilterParams>,
) -> Result<Json<PaginatedResponse<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let total = services::result_service::count_results(
        &state.db,
        params.reachable_only,
        params.provider.as_deref(),
    )
    .await?;
    let results = services::result_service::list_results(
        &state.db,
        page,
        per_page,
        params.reachable_only,
        params.provider.as_deref(),
    )
    .await?;
    Ok(Json(PaginatedResponse {
        data: results,
        total,
        page,
        per_page,
    }))
}

/// GET /api/v1/results/ips — list aggregated (deduplicated) reachable IP results.
async fn list_aggregated_ips(
    State(state): State<Arc<AppState>>,
    Query(params): Query<IpFilterParams>,
) -> Result<Json<PaginatedResponse<AggregatedIpResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let total = services::result_service::count_aggregated_ips(
        &state.db,
        params.provider.as_deref(),
    )
    .await?;
    let results = services::result_service::list_aggregated_ips(
        &state.db,
        page,
        per_page,
        params.provider.as_deref(),
    )
    .await?;
    Ok(Json(PaginatedResponse {
        data: results,
        total,
        page,
        per_page,
    }))
}

/// GET /api/v1/results/ips/:ip — list all individual scan results for a specific IP.
async fn get_ip_results(
    State(state): State<Arc<AppState>>,
    Path(ip): Path<String>,
    Query(params): Query<ResultFilterParams>,
) -> Result<Json<PaginatedResponse<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let total = services::result_service::count_ip_results(&state.db, &ip).await?;
    let results = services::result_service::list_ip_results(
        &state.db,
        &ip,
        page,
        per_page,
    )
    .await?;
    Ok(Json(PaginatedResponse {
        data: results,
        total,
        page,
        per_page,
    }))
}
