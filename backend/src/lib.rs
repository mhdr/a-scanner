pub mod db;
pub mod error;
pub mod models;
pub mod routes;
pub mod scanner;
pub mod services;

use sqlx::SqlitePool;
use std::sync::Arc;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
}

impl AppState {
    pub fn new(db: SqlitePool) -> Arc<Self> {
        Arc::new(Self { db })
    }
}
