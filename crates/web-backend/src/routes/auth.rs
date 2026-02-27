use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{FromRequestParts, State},
    http::{StatusCode, request::Parts},
    response::IntoResponse,
    routing::{get, post, put},
};

use crate::AppState;
use crate::error::AppError;
use a_scanner_core::models::{AuthMeResponse, ChangePasswordRequest, Claims, LoginRequest, LoginResponse};
use a_scanner_core::services::auth_service;

/// Build the auth router (mounted at /api/v1/auth).
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/login", post(login_handler))
        .route("/me", get(me_handler))
        .route("/password", put(change_password_handler))
}

/// POST /api/v1/auth/login — authenticate and return a JWT.
async fn login_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Look up user
    let user: Option<(String, String)> =
        sqlx::query_as("SELECT username, password_hash FROM users WHERE username = ?")
            .bind(&body.username)
            .fetch_optional(&state.db)
            .await?;

    let (username, password_hash) =
        user.ok_or_else(|| AppError::from(a_scanner_core::error::CoreError::Unauthorized("Invalid username or password".to_string())))?;

    // Verify password (CPU-intensive, run in blocking thread)
    let pw = body.password.clone();
    let hash = password_hash.clone();
    let valid = tokio::task::spawn_blocking(move || auth_service::verify_password(&pw, &hash))
        .await
        .map_err(|e| AppError::from(anyhow::anyhow!("Join error: {}", e)))??;

    if !valid {
        return Err(a_scanner_core::error::CoreError::Unauthorized(
            "Invalid username or password".to_string(),
        ).into());
    }

    let token = auth_service::generate_jwt(&username, &state.jwt_secret)?;
    Ok((StatusCode::OK, Json(LoginResponse { token })))
}

/// GET /api/v1/auth/me — return the authenticated user's information.
async fn me_handler(auth: AuthUser) -> impl IntoResponse {
    Json(AuthMeResponse {
        username: auth.claims.sub,
    })
}

/// PUT /api/v1/auth/password — change the authenticated user's password.
async fn change_password_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<impl IntoResponse, AppError> {
    let username = auth.claims.sub.clone();
    let current = body.current_password.clone();
    let new_pw = body.new_password.clone();
    let pool = state.db.clone();

    // Password verification & hashing are CPU-bound
    tokio::task::spawn_blocking(move || {
        // We need a new runtime handle to call async from blocking context
        // Instead, do all sync work here and pass result back
        let rt = tokio::runtime::Handle::current();
        rt.block_on(auth_service::change_password(&pool, &username, &current, &new_pw))
    })
    .await
    .map_err(|e| AppError::from(anyhow::anyhow!("Join error: {}", e)))??;

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Auth extractor
// ---------------------------------------------------------------------------

/// Extractor that validates the JWT from the `Authorization: Bearer <token>` header.
/// Use this in any handler that requires authentication.
pub struct AuthUser {
    pub claims: Claims,
}

impl FromRequestParts<Arc<AppState>> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &Arc<AppState>) -> Result<Self, Self::Rejection> {
        let app_state = state.as_ref();

        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::from(a_scanner_core::error::CoreError::Unauthorized("Missing authorization header".to_string())))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::from(a_scanner_core::error::CoreError::Unauthorized("Invalid authorization header format".to_string())))?;

        let claims = auth_service::validate_jwt(token, &app_state.jwt_secret)?;
        Ok(AuthUser { claims })
    }
}
