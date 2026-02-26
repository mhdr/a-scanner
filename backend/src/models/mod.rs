use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Status of a scan job.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

impl ScanStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ScanStatus::Pending => "pending",
            ScanStatus::Running => "running",
            ScanStatus::Completed => "completed",
            ScanStatus::Failed => "failed",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "pending" => ScanStatus::Pending,
            "running" => ScanStatus::Running,
            "completed" => ScanStatus::Completed,
            "failed" => ScanStatus::Failed,
            _ => ScanStatus::Failed,
        }
    }
}

/// A scan job row from the database.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Scan {
    pub id: String,
    pub provider: String,
    pub status: String,
    pub total_ips: i64,
    pub scanned_ips: i64,
    pub working_ips: i64,
    pub created_at: String,
    pub updated_at: String,
    pub mode: String,
    pub concurrency: i64,
    pub timeout_ms: i64,
    pub port: i64,
    pub extended: bool,
}

/// A single scan result row from the database.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ScanResult {
    pub id: String,
    pub scan_id: String,
    pub ip: String,
    pub latency_ms: Option<i64>,
    pub is_reachable: bool,
    pub created_at: String,
    pub tls_latency_ms: Option<i64>,
    pub ttfb_ms: Option<i64>,
    pub download_speed_kbps: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub success_rate: Option<f64>,
    pub packet_loss: Option<f64>,
    pub score: Option<f64>,
}

/// Supported CDN provider stored in the database.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub description: String,
    pub sni: String,
    /// JSON array of upstream URL strings, e.g. `["https://..."]`.
    pub ip_range_urls: String,
    pub is_builtin: bool,
    /// Response format for upstream IP range URLs: `"text"` (one CIDR per line) or `"json"` (JSON with addresses arrays).
    pub response_format: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating a new provider.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProviderRequest {
    pub name: String,
    pub description: Option<String>,
    pub sni: String,
    pub ip_range_urls: Vec<String>,
}

/// Request body for updating a provider.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProviderRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub sni: Option<String>,
    pub ip_range_urls: Option<Vec<String>>,
}

/// A provider IP range (CIDR block) stored in the database.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProviderRange {
    pub id: String,
    pub provider_id: String,
    pub cidr: String,
    pub ip_count: i64,
    pub enabled: bool,
    pub is_custom: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Per-provider settings controlling auto-update behavior.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProviderSettings {
    pub provider_id: String,
    pub auto_update: bool,
    pub auto_update_interval_hours: i64,
    pub last_fetched_at: Option<String>,
}

/// Generic paginated response wrapper.
#[derive(Debug, Clone, Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: u32,
    pub per_page: u32,
}

/// Request body for creating a new scan.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateScanRequest {
    pub provider: String,
    #[serde(default)]
    pub extended: bool,
    pub concurrency: Option<i64>,
    pub timeout_ms: Option<i64>,
    pub port: Option<i64>,
    pub samples: Option<i64>,
    pub extended_concurrency: Option<i64>,
    pub extended_timeout_ms: Option<i64>,
    pub packet_loss_probes: Option<i64>,
    /// Optional explicit list of CIDR ranges to scan. If omitted, uses enabled ranges from DB.
    pub ip_ranges: Option<Vec<String>>,
}

/// Request body for creating a custom IP range.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateRangeRequest {
    pub cidr: String,
    pub enabled: Option<bool>,
}

/// Request body for updating an IP range.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateRangeRequest {
    pub cidr: Option<String>,
    pub enabled: Option<bool>,
}

/// Request body for bulk-toggling range enabled state.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkToggleRequest {
    pub range_ids: Vec<String>,
    pub enabled: bool,
}

/// Request body for updating provider settings.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProviderSettingsRequest {
    pub auto_update: Option<bool>,
    pub auto_update_interval_hours: Option<i64>,
}
