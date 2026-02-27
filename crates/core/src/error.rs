/// Unified error type for the core library.
///
/// This enum does NOT depend on any HTTP/web framework types.
/// The web-backend maps `CoreError` into its own `AppError` that
/// implements `axum::response::IntoResponse`.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}
