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
use a_scanner_core::models::{CreateScanRequest, PaginatedResponse, Scan, ScanResult};
use a_scanner_core::scanner::ScanConfig;
use a_scanner_core::scanner::orchestrator::run_scan;
use a_scanner_core::services;

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
    let total = services::scan_service::count_scans(&state.db).await?;
    let scans = services::scan_service::list_scans(&state.db, page, per_page).await?;
    Ok(Json(PaginatedResponse {
        data: scans,
        total,
        page,
        per_page,
    }))
}

/// POST /api/v1/scans — create and start a new scan.
async fn create_scan(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateScanRequest>,
) -> Result<(axum::http::StatusCode, Json<Scan>), AppError> {
    let scan = services::scan_service::create_scan(&state.db, &body).await?;

    // Build scan config from request
    let config = ScanConfig {
        provider_id: body.provider.clone(),
        concurrency: body.concurrency.unwrap_or(3000) as usize,
        timeout_ms: body.timeout_ms.unwrap_or(2000) as u64,
        port: body.port.unwrap_or(443) as u16,
        extended: body.extended,
        samples: body.samples.unwrap_or(3) as usize,
        extended_concurrency: body.extended_concurrency.unwrap_or(200) as usize,
        extended_timeout_ms: body.extended_timeout_ms.unwrap_or(10000) as u64,
        packet_loss_probes: body.packet_loss_probes.unwrap_or(10) as usize,
        ip_ranges: body.ip_ranges.clone(),
    };

    // Create broadcast channel for this scan's progress events
    let scan_id = scan.id.clone();
    let tx = state.create_scan_channel(&scan_id).await;
    let pool = state.db.clone();
    let tls = state.tls_connector.clone();
    let state_clone = state.clone();

    tokio::spawn(async move {
        run_scan(scan_id.clone(), config, pool, tls, tx).await;
        // Clean up the channel after scan completes
        state_clone.remove_scan_channel(&scan_id).await;
    });

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
) -> Result<Json<PaginatedResponse<ScanResult>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(50);
    let total = services::scan_service::count_scan_results(&state.db, &id).await?;
    let results =
        services::scan_service::get_scan_results(&state.db, &id, page, per_page).await?;
    Ok(Json(PaginatedResponse {
        data: results,
        total,
        page,
        per_page,
    }))
}
