pub mod error;
pub mod routes;

use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tokio_rustls::TlsConnector;

use a_scanner_core::models::ScanProgressEvent;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub tls_connector: Arc<TlsConnector>,
    /// JWT signing/verification secret.
    pub jwt_secret: Vec<u8>,
    /// Per-scan broadcast channels for real-time progress updates.
    scan_channels: Arc<Mutex<HashMap<String, broadcast::Sender<ScanProgressEvent>>>>,
}

impl AppState {
    pub fn new(db: SqlitePool, tls_connector: TlsConnector, jwt_secret: Vec<u8>) -> Arc<Self> {
        Arc::new(Self {
            db,
            tls_connector: Arc::new(tls_connector),
            jwt_secret,
            scan_channels: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn create_scan_channel(&self, scan_id: &str) -> broadcast::Sender<ScanProgressEvent> {
        let (tx, _) = broadcast::channel(256);
        self.scan_channels
            .lock()
            .await
            .insert(scan_id.to_string(), tx.clone());
        tx
    }

    pub async fn subscribe_scan(&self, scan_id: &str) -> Option<broadcast::Receiver<ScanProgressEvent>> {
        self.scan_channels
            .lock()
            .await
            .get(scan_id)
            .map(|tx| tx.subscribe())
    }

    pub async fn remove_scan_channel(&self, scan_id: &str) {
        self.scan_channels.lock().await.remove(scan_id);
    }
}
