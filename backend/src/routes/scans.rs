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
use crate::models::{Scan, ScanResult};
use crate::services;

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

#[derive(Debug, Deserialize)]
pub struct CreateScanRequest {
    pub provider: String,
}

/// GET /api/v1/scans — list all scans with pagination.
async fn list_scans(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<Scan>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let scans = services::scan_service::list_scans(&state.db, page, per_page).await?;
    Ok(Json(scans))
}

/// POST /api/v1/scans — create and start a new scan.
async fn create_scan(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateScanRequest>,
) -> Result<(axum::http::StatusCode, Json<Scan>), AppError> {
    let scan = services::scan_service::create_scan(&state.db, &body.provider).await?;
    Ok((axum::http::StatusCode::CREATED, Json(scan)))
}

/// GET /api/v1/scans/:id — get a single scan by ID.
async fn get_scan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Scan>, AppError> {
    let scan = services::scan_service::get_scan(&state.db, &id).await?;
    Ok(Json(scan))
}

/// GET /api/v1/scans/:id/results — get results for a specific scan.
async fn get_scan_results(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let results =
        services::scan_service::get_scan_results(&state.db, &id, page, per_page).await?;
    Ok(Json(results))
}
