use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post, put},
};

use crate::AppState;
use crate::error::AppError;
use crate::models::{
    BulkToggleRequest, CreateProviderRequest, CreateRangeRequest, Provider, ProviderRange,
    ProviderSettings, UpdateProviderRequest, UpdateProviderSettingsRequest, UpdateRangeRequest,
};
use crate::services;

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
    let providers = services::provider_service::list_providers(&state.db).await?;
    Ok(Json(providers))
}

/// GET /api/v1/providers/:id — get a single provider.
async fn get_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Provider>, AppError> {
    let provider = services::provider_service::get_provider_by_id(&state.db, &id).await?;
    Ok(Json(provider))
}

/// POST /api/v1/providers — create a new custom provider.
async fn create_provider(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateProviderRequest>,
) -> Result<(StatusCode, Json<Provider>), AppError> {
    let provider = services::provider_service::create_provider(&state.db, &body).await?;
    Ok((StatusCode::CREATED, Json(provider)))
}

/// PUT /api/v1/providers/:id — update a provider.
async fn update_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateProviderRequest>,
) -> Result<Json<Provider>, AppError> {
    let provider = services::provider_service::update_provider(&state.db, &id, &body).await?;
    Ok(Json(provider))
}

/// DELETE /api/v1/providers/:id — delete a custom provider.
async fn delete_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    services::provider_service::delete_provider(&state.db, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/providers/:id/ranges — list all IP ranges for a provider.
async fn list_ranges(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ProviderRange>>, AppError> {
    let ranges = services::provider_service::get_ranges(&state.db, &id).await?;
    Ok(Json(ranges))
}

/// POST /api/v1/providers/:id/ranges/fetch — fetch ranges from upstream URLs and store.
async fn fetch_ranges(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ProviderRange>>, AppError> {
    let ranges = services::provider_service::fetch_and_store_ranges(&state.db, &id).await?;
    Ok(Json(ranges))
}

/// POST /api/v1/providers/:id/ranges — create a custom IP range.
async fn create_range(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateRangeRequest>,
) -> Result<(StatusCode, Json<ProviderRange>), AppError> {
    let range = services::provider_service::create_custom_range(&state.db, &id, &body).await?;
    Ok((StatusCode::CREATED, Json(range)))
}

/// PUT /api/v1/providers/:id/ranges/:range_id — update a range.
async fn update_range(
    State(state): State<Arc<AppState>>,
    Path((_id, range_id)): Path<(String, String)>,
    Json(body): Json<UpdateRangeRequest>,
) -> Result<Json<ProviderRange>, AppError> {
    let range = services::provider_service::update_range(&state.db, &range_id, &body).await?;
    Ok(Json(range))
}

/// DELETE /api/v1/providers/:id/ranges/:range_id — delete a range.
async fn delete_range(
    State(state): State<Arc<AppState>>,
    Path((_id, range_id)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    services::provider_service::delete_range(&state.db, &range_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /api/v1/providers/:id/ranges/bulk — bulk toggle enabled/disabled.
async fn bulk_toggle(
    State(state): State<Arc<AppState>>,
    Path(_id): Path<String>,
    Json(body): Json<BulkToggleRequest>,
) -> Result<StatusCode, AppError> {
    services::provider_service::bulk_toggle_ranges(&state.db, &body).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/providers/:id/settings — get provider auto-update settings.
async fn get_settings(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ProviderSettings>, AppError> {
    let settings = services::provider_service::get_settings(&state.db, &id).await?;
    Ok(Json(settings))
}

/// PUT /api/v1/providers/:id/settings — update provider auto-update settings.
async fn update_settings(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateProviderSettingsRequest>,
) -> Result<Json<ProviderSettings>, AppError> {
    let settings = services::provider_service::update_settings(&state.db, &id, &body).await?;
    Ok(Json(settings))
}
