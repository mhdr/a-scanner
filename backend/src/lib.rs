pub mod db;
pub mod error;
pub mod models;
pub mod routes;
pub mod scanner;
pub mod services;

use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tokio_rustls::TlsConnector;

use crate::models::ScanProgressEvent;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub tls_connector: Arc<TlsConnector>,
    /// Per-scan broadcast channels for real-time progress updates.
    scan_channels: Arc<Mutex<HashMap<String, broadcast::Sender<ScanProgressEvent>>>>,
}

impl AppState {
    pub fn new(db: SqlitePool, tls_connector: TlsConnector) -> Arc<Self> {
        Arc::new(Self {
            db,
            tls_connector: Arc::new(tls_connector),
            scan_channels: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Create a broadcast channel for a scan and return the sender.
    pub async fn create_scan_channel(&self, scan_id: &str) -> broadcast::Sender<ScanProgressEvent> {
        let (tx, _) = broadcast::channel(256);
        self.scan_channels
            .lock()
            .await
            .insert(scan_id.to_string(), tx.clone());
        tx
    }

    /// Subscribe to progress updates for a scan.
    pub async fn subscribe_scan(&self, scan_id: &str) -> Option<broadcast::Receiver<ScanProgressEvent>> {
        self.scan_channels
            .lock()
            .await
            .get(scan_id)
            .map(|tx| tx.subscribe())
    }

    /// Remove the broadcast channel for a completed/failed scan.
    pub async fn remove_scan_channel(&self, scan_id: &str) {
        self.scan_channels.lock().await.remove(scan_id);
    }
}
