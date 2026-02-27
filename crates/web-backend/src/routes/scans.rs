use std::sync::Arc;

use axum::{
    Json,
    Router,
    extract::{Path, Query, State},
    routing::get,
};
use serde::Deserialize;

use crate::AppState;
use crate::error::AppError;
use a_scanner_core::facade;
use a_scanner_core::models::{CreateScanRequest, PaginatedResponse, Scan, ScanResult};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_scans).post(create_scan))
        .route("/{id}", get(get_scan))
        .route("/{id}/results", get(get_scan_results))
}

#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
}

/// GET /api/v1/scans — list all scans with pagination.
async fn list_scans(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<PaginatedResponse<Scan>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let resp = facade::list_scans(&state.core, page, per_page).await?;
    Ok(Json(resp))
}

/// POST /api/v1/scans — create and start a new scan.
async fn create_scan(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateScanRequest>,
) -> Result<(axum::http::StatusCode, Json<Scan>), AppError> {
    let (scan, _rx) = facade::start_scan(&state.core, &body).await?;
    Ok((axum::http::StatusCode::CREATED, Json(scan)))
}

/// GET /api/v1/scans/:id — get a single scan by ID.
async fn get_scan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Scan>, AppError> {
    let scan = facade::get_scan(&state.core, &id).await?;
    Ok(Json(scan))
}

/// GET /api/v1/scans/:id/results — get results for a specific scan.
async fn get_scan_results(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<PaginatedResponse<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let resp = facade::get_scan_results(&state.core, &id, page, per_page).await?;
    Ok(Json(resp))
}
