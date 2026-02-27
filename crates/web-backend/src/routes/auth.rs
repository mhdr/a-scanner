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
use a_scanner_core::facade;
use a_scanner_core::models::{AuthMeResponse, ChangePasswordRequest, Claims, LoginRequest};

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
    let resp = facade::login(&state.core, &body.username, &body.password).await?;
    Ok((StatusCode::OK, Json(resp)))
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
    facade::change_password(&state.core, &auth.claims.sub, &body).await?;
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
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::from(a_scanner_core::error::CoreError::Unauthorized("Missing authorization header".to_string())))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::from(a_scanner_core::error::CoreError::Unauthorized("Invalid authorization header format".to_string())))?;

        let claims = facade::validate_token(&state.core, token)?;
        Ok(AuthUser { claims })
    }
}
