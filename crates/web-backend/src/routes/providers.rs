use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post, put},
};

use crate::AppState;
use crate::error::AppError;
use a_scanner_core::facade;
use a_scanner_core::models::{
    BulkToggleRequest, CreateProviderRequest, CreateRangeRequest, Provider, ProviderRange,
    ProviderSettings, UpdateProviderRequest, UpdateProviderSettingsRequest, UpdateRangeRequest,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_providers).post(create_provider))
        .route("/{id}", get(get_provider).put(update_provider).delete(delete_provider))
        .route("/{id}/ranges", get(list_ranges).post(create_range))
        .route("/{id}/ranges/fetch", post(fetch_ranges))
        .route("/{id}/ranges/bulk", patch(bulk_toggle))
        .route("/{id}/ranges/{range_id}", put(update_range).delete(delete_range))
        .route("/{id}/settings", get(get_settings).put(update_settings))
}

/// GET /api/v1/providers — list all providers from the database.
async fn list_providers(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Provider>>, AppError> {
    let providers = facade::list_providers(&state.core).await?;
    Ok(Json(providers))
}

/// GET /api/v1/providers/:id — get a single provider.
async fn get_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Provider>, AppError> {
    let provider = facade::get_provider(&state.core, &id).await?;
    Ok(Json(provider))
}

/// POST /api/v1/providers — create a new custom provider.
async fn create_provider(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateProviderRequest>,
) -> Result<(StatusCode, Json<Provider>), AppError> {
    let provider = facade::create_provider(&state.core, &body).await?;
    Ok((StatusCode::CREATED, Json(provider)))
}

/// PUT /api/v1/providers/:id — update a provider.
async fn update_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateProviderRequest>,
) -> Result<Json<Provider>, AppError> {
    let provider = facade::update_provider(&state.core, &id, &body).await?;
    Ok(Json(provider))
}

/// DELETE /api/v1/providers/:id — delete a custom provider.
async fn delete_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    facade::delete_provider(&state.core, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/providers/:id/ranges — list all IP ranges for a provider.
async fn list_ranges(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ProviderRange>>, AppError> {
    let ranges = facade::get_provider_ranges(&state.core, &id).await?;
    Ok(Json(ranges))
}

/// POST /api/v1/providers/:id/ranges/fetch — fetch ranges from upstream URLs and store.
async fn fetch_ranges(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ProviderRange>>, AppError> {
    let ranges = facade::fetch_provider_ranges(&state.core, &id).await?;
    Ok(Json(ranges))
}

/// POST /api/v1/providers/:id/ranges — create a custom IP range.
async fn create_range(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateRangeRequest>,
) -> Result<(StatusCode, Json<ProviderRange>), AppError> {
    let range = facade::create_custom_range(&state.core, &id, &body).await?;
    Ok((StatusCode::CREATED, Json(range)))
}

/// PUT /api/v1/providers/:id/ranges/:range_id — update a range.
async fn update_range(
    State(state): State<Arc<AppState>>,
    Path((_id, range_id)): Path<(String, String)>,
    Json(body): Json<UpdateRangeRequest>,
) -> Result<Json<ProviderRange>, AppError> {
    let range = facade::update_range(&state.core, &range_id, &body).await?;
    Ok(Json(range))
}

/// DELETE /api/v1/providers/:id/ranges/:range_id — delete a range.
async fn delete_range(
    State(state): State<Arc<AppState>>,
    Path((_id, range_id)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    facade::delete_range(&state.core, &range_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /api/v1/providers/:id/ranges/bulk — bulk toggle enabled/disabled.
async fn bulk_toggle(
    State(state): State<Arc<AppState>>,
    Path(_id): Path<String>,
    Json(body): Json<BulkToggleRequest>,
) -> Result<StatusCode, AppError> {
    facade::bulk_toggle_ranges(&state.core, &body).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/providers/:id/settings — get provider auto-update settings.
async fn get_settings(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ProviderSettings>, AppError> {
    let settings = facade::get_provider_settings(&state.core, &id).await?;
    Ok(Json(settings))
}

/// PUT /api/v1/providers/:id/settings — update provider auto-update settings.
async fn update_settings(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateProviderSettingsRequest>,
) -> Result<Json<ProviderSettings>, AppError> {
    let settings = facade::update_provider_settings(&state.core, &id, &body).await?;
    Ok(Json(settings))
}
