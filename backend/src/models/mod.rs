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
    pub created_at: String,
    pub updated_at: String,
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
}

/// Supported CDN provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub description: String,
}
