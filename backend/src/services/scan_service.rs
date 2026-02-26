use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{CreateScanRequest, Scan, ScanResult, ScanStatus};

/// Count total scans.
pub async fn count_scans(db: &SqlitePool) -> Result<i64, AppError> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM scans")
        .fetch_one(db)
        .await?;
    Ok(row.0)
}

/// List scans with pagination.
pub async fn list_scans(db: &SqlitePool, page: u32, per_page: u32) -> Result<Vec<Scan>, AppError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;

    let scans = sqlx::query_as::<_, Scan>(
        "SELECT id, provider, status, total_ips, scanned_ips, working_ips, created_at, updated_at,
                mode, concurrency, timeout_ms, port, extended
         FROM scans
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await?;

    Ok(scans)
}

/// Create a new scan record and return it.
pub async fn create_scan(db: &SqlitePool, req: &CreateScanRequest) -> Result<Scan, AppError> {
    let id = Uuid::new_v4().to_string();
    let status = ScanStatus::Pending.as_str();
    let now = chrono::Utc::now().to_rfc3339();
    let concurrency = req.concurrency.unwrap_or(64);
    let timeout_ms = req.timeout_ms.unwrap_or(2000);
    let port = req.port.unwrap_or(443);
    let mode = if req.extended { "extended" } else { "basic" };

    sqlx::query(
        "INSERT INTO scans (id, provider, status, total_ips, scanned_ips, working_ips, created_at, updated_at,
                            mode, concurrency, timeout_ms, port, extended)
         VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&req.provider)
    .bind(status)
    .bind(&now)
    .bind(&now)
    .bind(mode)
    .bind(concurrency)
    .bind(timeout_ms)
    .bind(port)
    .bind(req.extended)
    .execute(db)
    .await?;

    get_scan(db, &id).await
}

/// Get a single scan by ID.
pub async fn get_scan(db: &SqlitePool, id: &str) -> Result<Scan, AppError> {
    let scan = sqlx::query_as::<_, Scan>(
        "SELECT id, provider, status, total_ips, scanned_ips, working_ips, created_at, updated_at,
                mode, concurrency, timeout_ms, port, extended
         FROM scans WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Scan {id} not found")))?;

    Ok(scan)
}

/// Update the working_ips count for a scan.
pub async fn update_working_ips(db: &SqlitePool, scan_id: &str, count: i64) -> Result<(), AppError> {
    sqlx::query("UPDATE scans SET working_ips = ?, updated_at = ? WHERE id = ?")
        .bind(count)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(scan_id)
        .execute(db)
        .await?;
    Ok(())
}

/// Delete all completed/failed scans and their results.
/// Running and pending scans are left untouched.
/// Returns the number of deleted scans (results are cascade-deleted).
pub async fn delete_all_completed_scans(db: &SqlitePool) -> Result<u64, AppError> {
    let result = sqlx::query(
        "DELETE FROM scans WHERE status NOT IN ('running', 'pending')",
    )
    .execute(db)
    .await?;
    Ok(result.rows_affected())
}

/// Count results for a specific scan.
pub async fn count_scan_results(db: &SqlitePool, scan_id: &str) -> Result<i64, AppError> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM scan_results WHERE scan_id = ? AND is_reachable = 1",
    )
    .bind(scan_id)
    .fetch_one(db)
    .await?;
    Ok(row.0)
}

/// Get results for a specific scan with pagination.
pub async fn get_scan_results(
    db: &SqlitePool,
    scan_id: &str,
    page: u32,
    per_page: u32,
) -> Result<Vec<ScanResult>, AppError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;

    let results = sqlx::query_as::<_, ScanResult>(
        "SELECT id, scan_id, ip, latency_ms, is_reachable, created_at,
                tls_latency_ms, ttfb_ms, download_speed_kbps, jitter_ms, success_rate, packet_loss, score
         FROM scan_results
         WHERE scan_id = ? AND is_reachable = 1
         ORDER BY CASE WHEN score IS NOT NULL THEN score ELSE latency_ms END ASC NULLS LAST
         LIMIT ? OFFSET ?",
    )
    .bind(scan_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await?;

    Ok(results)
}
