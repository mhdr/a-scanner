pub mod db;
pub mod error;
pub mod models;
pub mod routes;
pub mod scanner;
pub mod services;

use sqlx::SqlitePool;
use std::sync::Arc;
use tokio_rustls::TlsConnector;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub tls_connector: Arc<TlsConnector>,
}

impl AppState {
    pub fn new(db: SqlitePool, tls_connector: TlsConnector) -> Arc<Self> {
        Arc::new(Self {
            db,
            tls_connector: Arc::new(tls_connector),
        })
    }
}
