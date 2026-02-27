//! High-level async API for all scanner operations.
//!
//! This facade is the **single entry point** for both the web-backend (Axum)
//! and the mobile-backend (JNI).  It does NOT depend on any HTTP, WebSocket,
//! or JNI types — only on core domain types and `tokio::sync::broadcast` for
//! real-time scan progress.

use std::collections::HashMap;
use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::{broadcast, Mutex};
use tokio_rustls::TlsConnector;
use tokio_util::sync::CancellationToken;

use crate::error::CoreError;
use crate::models::{
    AggregatedIpResult, BulkToggleRequest, ChangePasswordRequest, Claims,
    CreateProviderRequest, CreateRangeRequest, CreateScanRequest, LoginResponse,
    PaginatedResponse, Provider, ProviderRange, ProviderSettings, Scan,
    ScanProgressEvent, ScanResult, UpdateProviderRequest,
    UpdateProviderSettingsRequest, UpdateRangeRequest,
};
use crate::scanner::orchestrator::run_scan;
use crate::scanner::ScanConfig;
use crate::services::{auth_service, provider_service, result_service, scan_service};

// ---------------------------------------------------------------------------
// CoreState
// ---------------------------------------------------------------------------

/// Shared application state that is platform-agnostic (no Axum / JNI types).
///
/// Both the web-backend `AppState` and the mobile-backend `OnceCell<CoreState>`
/// hold an instance of this struct.
#[derive(Clone)]
pub struct CoreState {
    /// SQLite connection pool.
    pub db: SqlitePool,
    /// Reusable TLS connector for scanner probes.
    pub tls_connector: Arc<TlsConnector>,
    /// JWT signing / verification secret.
    pub jwt_secret: Vec<u8>,
    /// Per-scan broadcast channels keyed by scan ID.
    scan_channels: Arc<Mutex<HashMap<String, broadcast::Sender<ScanProgressEvent>>>>,
    /// Per-scan cancellation tokens keyed by scan ID.
    cancel_tokens: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl CoreState {
    /// Create a new `CoreState` from its constituent parts.
    ///
    /// Prefer [`init`] which performs full initialization (DB, migrations,
    /// admin seeding, TLS setup) and returns a ready-to-use `CoreState`.
    pub fn new(db: SqlitePool, tls_connector: TlsConnector, jwt_secret: Vec<u8>) -> Self {
        Self {
            db,
            tls_connector: Arc::new(tls_connector),
            jwt_secret,
            scan_channels: Arc::new(Mutex::new(HashMap::new())),
            cancel_tokens: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create a broadcast channel for a scan and store it internally.
    pub async fn create_scan_channel(
        &self,
        scan_id: &str,
    ) -> (broadcast::Sender<ScanProgressEvent>, CancellationToken) {
        let (tx, _) = broadcast::channel(256);
        let token = CancellationToken::new();
        self.scan_channels
            .lock()
            .await
            .insert(scan_id.to_string(), tx.clone());
        self.cancel_tokens
            .lock()
            .await
            .insert(scan_id.to_string(), token.clone());
        (tx, token)
    }

    /// Subscribe to an existing scan's broadcast channel.
    ///
    /// Returns `None` if no channel exists for the given scan ID.
    pub async fn subscribe_scan(
        &self,
        scan_id: &str,
    ) -> Option<broadcast::Receiver<ScanProgressEvent>> {
        self.scan_channels
            .lock()
            .await
            .get(scan_id)
            .map(|tx| tx.subscribe())
    }

    /// Remove a scan's broadcast channel (called after the scan finishes).
    pub async fn remove_scan_channel(&self, scan_id: &str) {
        self.scan_channels.lock().await.remove(scan_id);
        self.cancel_tokens.lock().await.remove(scan_id);
    }

    /// Cancel a running scan by triggering its cancellation token.
    ///
    /// Returns `true` if the scan had a cancellation token (i.e. was running).
    pub async fn cancel_scan(&self, scan_id: &str) -> bool {
        if let Some(token) = self.cancel_tokens.lock().await.get(scan_id) {
            token.cancel();
            true
        } else {
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/// Initialize the core: create DB pool, run migrations, seed admin user,
/// retrieve JWT secret, create TLS connector, and spawn the provider
/// auto-update background loop.
///
/// Returns a fully-configured [`CoreState`] ready for use.
pub async fn init(database_url: &str) -> Result<CoreState, CoreError> {
    let pool = crate::db::init_pool(database_url).await?;
    tracing::info!("Database initialized");

    auth_service::seed_admin_user(&pool).await?;
    let jwt_secret = auth_service::get_or_create_jwt_secret(&pool).await?;

    // Spawn the provider auto-update background loop.
    let auto_update_pool = pool.clone();
    tokio::spawn(async move {
        provider_service::run_auto_update_loop(auto_update_pool).await;
    });

    let tls_connector = crate::scanner::create_tls_connector();

    Ok(CoreState::new(pool, tls_connector, jwt_secret))
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/// Authenticate a user and return a JWT token.
pub async fn login(
    state: &CoreState,
    username: &str,
    password: &str,
) -> Result<LoginResponse, CoreError> {
    // Look up user
    let user: Option<(String, String)> =
        sqlx::query_as("SELECT username, password_hash FROM users WHERE username = ?")
            .bind(username)
            .fetch_optional(&state.db)
            .await?;

    let (uname, password_hash) = user.ok_or_else(|| {
        CoreError::Unauthorized("Invalid username or password".to_string())
    })?;

    let pw = password.to_string();
    let hash = password_hash.clone();
    let valid = tokio::task::spawn_blocking(move || auth_service::verify_password(&pw, &hash))
        .await
        .map_err(|e| CoreError::Internal(anyhow::anyhow!("Join error: {}", e)))??;

    if !valid {
        return Err(CoreError::Unauthorized(
            "Invalid username or password".to_string(),
        ));
    }

    let token = auth_service::generate_jwt(&uname, &state.jwt_secret)?;
    Ok(LoginResponse { token })
}

/// Validate a JWT token and return the decoded claims.
pub fn validate_token(state: &CoreState, token: &str) -> Result<Claims, CoreError> {
    auth_service::validate_jwt(token, &state.jwt_secret)
}

/// Change the password for the given user.
pub async fn change_password(
    state: &CoreState,
    username: &str,
    req: &ChangePasswordRequest,
) -> Result<(), CoreError> {
    let uname = username.to_string();
    let current = req.current_password.clone();
    let new_pw = req.new_password.clone();
    let pool = state.db.clone();

    tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Handle::current();
        rt.block_on(auth_service::change_password(&pool, &uname, &current, &new_pw))
    })
    .await
    .map_err(|e| CoreError::Internal(anyhow::anyhow!("Join error: {}", e)))?
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

/// List scans with pagination.
pub async fn list_scans(
    state: &CoreState,
    page: u32,
    per_page: u32,
) -> Result<PaginatedResponse<Scan>, CoreError> {
    let total = scan_service::count_scans(&state.db).await?;
    let data = scan_service::list_scans(&state.db, page, per_page).await?;
    Ok(PaginatedResponse {
        data,
        total,
        page,
        per_page,
    })
}

/// Get a single scan by ID.
pub async fn get_scan(state: &CoreState, id: &str) -> Result<Scan, CoreError> {
    scan_service::get_scan(&state.db, id).await
}

/// Create a scan, start it in the background, and return the scan record
/// together with a broadcast receiver for real-time progress events.
///
/// The caller can use the receiver to stream progress (e.g. via WebSocket on
/// web, or polling on mobile).  The broadcast channel is automatically removed
/// once the scan finishes.
pub async fn start_scan(
    state: &CoreState,
    req: &CreateScanRequest,
) -> Result<(Scan, broadcast::Receiver<ScanProgressEvent>), CoreError> {
    let scan = scan_service::create_scan(&state.db, req).await?;

    let config = ScanConfig {
        provider_id: req.provider.clone(),
        concurrency: req.concurrency.unwrap_or(3000) as usize,
        timeout_ms: req.timeout_ms.unwrap_or(2000) as u64,
        port: req.port.unwrap_or(443) as u16,
        extended: req.extended,
        samples: req.samples.unwrap_or(3) as usize,
        extended_concurrency: req.extended_concurrency.unwrap_or(200) as usize,
        extended_timeout_ms: req.extended_timeout_ms.unwrap_or(10000) as u64,
        packet_loss_probes: req.packet_loss_probes.unwrap_or(10) as usize,
        ip_ranges: req.ip_ranges.clone(),
    };

    let scan_id = scan.id.clone();
    let (tx, cancel_token) = state.create_scan_channel(&scan_id).await;
    let rx = tx.subscribe();

    let pool = state.db.clone();
    let tls = state.tls_connector.clone();
    let state_clone = state.clone();

    tokio::spawn(async move {
        run_scan(scan_id.clone(), config, pool, tls, tx, cancel_token).await;
        state_clone.remove_scan_channel(&scan_id).await;
    });

    Ok((scan, rx))
}

/// Stop a running scan.
///
/// Signals the scan to stop via its cancellation token. The scan will flush
/// any results collected so far to the database and mark itself as `stopped`.
/// Returns an error if the scan is not found or not currently running.
pub async fn stop_scan(state: &CoreState, scan_id: &str) -> Result<Scan, CoreError> {
    let scan = scan_service::get_scan(&state.db, scan_id).await?;
    if scan.status != "running" && scan.status != "pending" {
        return Err(CoreError::BadRequest(format!(
            "Scan {} is not running (status: {})",
            scan_id, scan.status
        )));
    }

    let cancelled = state.cancel_scan(scan_id).await;
    if !cancelled {
        return Err(CoreError::BadRequest(format!(
            "Scan {} has no active cancellation token",
            scan_id
        )));
    }

    // The orchestrator will handle updating the DB status to "stopped"
    // and flushing results. Re-fetch the scan after a brief delay to
    // return updated state.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    scan_service::get_scan(&state.db, scan_id).await
}

/// Get results for a specific scan with pagination.
pub async fn get_scan_results(
    state: &CoreState,
    scan_id: &str,
    page: u32,
    per_page: u32,
) -> Result<PaginatedResponse<ScanResult>, CoreError> {
    let total = scan_service::count_scan_results(&state.db, scan_id).await?;
    let data = scan_service::get_scan_results(&state.db, scan_id, page, per_page).await?;
    Ok(PaginatedResponse {
        data,
        total,
        page,
        per_page,
    })
}

/// Delete all completed / failed scans and their results.
/// Returns the number of deleted scans.
pub async fn delete_completed_scans(state: &CoreState) -> Result<u64, CoreError> {
    scan_service::delete_all_completed_scans(&state.db).await
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/// List all scan results with optional filtering and pagination.
pub async fn list_results(
    state: &CoreState,
    page: u32,
    per_page: u32,
    reachable_only: Option<bool>,
    provider: Option<&str>,
) -> Result<PaginatedResponse<ScanResult>, CoreError> {
    let total = result_service::count_results(&state.db, reachable_only, provider).await?;
    let data =
        result_service::list_results(&state.db, page, per_page, reachable_only, provider).await?;
    Ok(PaginatedResponse {
        data,
        total,
        page,
        per_page,
    })
}

/// List aggregated (deduplicated) reachable IP results with averages.
pub async fn list_aggregated_ips(
    state: &CoreState,
    page: u32,
    per_page: u32,
    provider: Option<&str>,
) -> Result<PaginatedResponse<AggregatedIpResult>, CoreError> {
    let total = result_service::count_aggregated_ips(&state.db, provider).await?;
    let data =
        result_service::list_aggregated_ips(&state.db, page, per_page, provider).await?;
    Ok(PaginatedResponse {
        data,
        total,
        page,
        per_page,
    })
}

/// List all individual scan results for a specific IP with pagination.
pub async fn get_ip_results(
    state: &CoreState,
    ip: &str,
    page: u32,
    per_page: u32,
) -> Result<PaginatedResponse<ScanResult>, CoreError> {
    let total = result_service::count_ip_results(&state.db, ip).await?;
    let data = result_service::list_ip_results(&state.db, ip, page, per_page).await?;
    Ok(PaginatedResponse {
        data,
        total,
        page,
        per_page,
    })
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/// List all CDN providers.
pub async fn list_providers(state: &CoreState) -> Result<Vec<Provider>, CoreError> {
    provider_service::list_providers(&state.db).await
}

/// Get a single provider by ID.
pub async fn get_provider(state: &CoreState, id: &str) -> Result<Provider, CoreError> {
    provider_service::get_provider_by_id(&state.db, id).await
}

/// Create a new custom provider.
pub async fn create_provider(
    state: &CoreState,
    req: &CreateProviderRequest,
) -> Result<Provider, CoreError> {
    provider_service::create_provider(&state.db, req).await
}

/// Update an existing provider.
pub async fn update_provider(
    state: &CoreState,
    id: &str,
    req: &UpdateProviderRequest,
) -> Result<Provider, CoreError> {
    provider_service::update_provider(&state.db, id, req).await
}

/// Delete a custom provider and all associated ranges & settings.
pub async fn delete_provider(state: &CoreState, id: &str) -> Result<(), CoreError> {
    provider_service::delete_provider(&state.db, id).await
}

// ---------------------------------------------------------------------------
// Provider Ranges
// ---------------------------------------------------------------------------

/// List all IP ranges for a provider.
pub async fn get_provider_ranges(
    state: &CoreState,
    provider_id: &str,
) -> Result<Vec<ProviderRange>, CoreError> {
    provider_service::get_ranges(&state.db, provider_id).await
}

/// Fetch ranges from the provider's upstream URLs and store them.
pub async fn fetch_provider_ranges(
    state: &CoreState,
    provider_id: &str,
) -> Result<Vec<ProviderRange>, CoreError> {
    provider_service::fetch_and_store_ranges(&state.db, provider_id).await
}

/// Create a custom IP range for a provider.
pub async fn create_custom_range(
    state: &CoreState,
    provider_id: &str,
    req: &CreateRangeRequest,
) -> Result<ProviderRange, CoreError> {
    provider_service::create_custom_range(&state.db, provider_id, req).await
}

/// Update a range (CIDR and/or enabled flag).
pub async fn update_range(
    state: &CoreState,
    range_id: &str,
    req: &UpdateRangeRequest,
) -> Result<ProviderRange, CoreError> {
    provider_service::update_range(&state.db, range_id, req).await
}

/// Delete a range.
pub async fn delete_range(state: &CoreState, range_id: &str) -> Result<(), CoreError> {
    provider_service::delete_range(&state.db, range_id).await
}

/// Bulk toggle enabled/disabled for multiple range IDs.
pub async fn bulk_toggle_ranges(
    state: &CoreState,
    req: &BulkToggleRequest,
) -> Result<(), CoreError> {
    provider_service::bulk_toggle_ranges(&state.db, req).await
}

// ---------------------------------------------------------------------------
// Provider Settings
// ---------------------------------------------------------------------------

/// Get auto-update settings for a provider.
pub async fn get_provider_settings(
    state: &CoreState,
    provider_id: &str,
) -> Result<ProviderSettings, CoreError> {
    provider_service::get_settings(&state.db, provider_id).await
}

/// Update auto-update settings for a provider.
pub async fn update_provider_settings(
    state: &CoreState,
    provider_id: &str,
    req: &UpdateProviderSettingsRequest,
) -> Result<ProviderSettings, CoreError> {
    provider_service::update_settings(&state.db, provider_id, req).await
}
