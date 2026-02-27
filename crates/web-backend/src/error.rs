use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use a_scanner_core::error::CoreError;

/// Web-backend error type that wraps [`CoreError`] and implements Axum's
/// [`IntoResponse`] to produce proper HTTP error responses.
#[derive(Debug)]
pub struct AppError(pub CoreError);

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self.0 {
            CoreError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            CoreError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            CoreError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            CoreError::Database(err) => {
                tracing::error!("Database error: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            CoreError::Internal(err) => {
                tracing::error!("Internal error: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(json!({ "error": message }));
        (status, body).into_response()
    }
}

// Allow `?` on functions returning `Result<T, CoreError>` in handlers
impl From<CoreError> for AppError {
    fn from(err: CoreError) -> Self {
        AppError(err)
    }
}

// Allow `?` on sqlx::Error directly in handlers
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError(CoreError::Database(err))
    }
}

// Allow `?` on anyhow::Error directly in handlers
impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError(CoreError::Internal(err))
    }
}
