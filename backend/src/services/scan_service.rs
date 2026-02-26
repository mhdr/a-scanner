use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{Scan, ScanResult, ScanStatus};

/// List scans with pagination.
pub async fn list_scans(db: &SqlitePool, page: u32, per_page: u32) -> Result<Vec<Scan>, AppError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;

    let scans = sqlx::query_as::<_, Scan>(
        "SELECT id, provider, status, total_ips, scanned_ips, created_at, updated_at
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

/// Create a new scan record.
pub async fn create_scan(db: &SqlitePool, provider: &str) -> Result<Scan, AppError> {
    let id = Uuid::new_v4().to_string();
    let status = ScanStatus::Pending.as_str();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO scans (id, provider, status, total_ips, scanned_ips, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)",
    )
    .bind(&id)
    .bind(provider)
    .bind(status)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;

    get_scan(db, &id).await
}

/// Get a single scan by ID.
pub async fn get_scan(db: &SqlitePool, id: &str) -> Result<Scan, AppError> {
    let scan = sqlx::query_as::<_, Scan>(
        "SELECT id, provider, status, total_ips, scanned_ips, created_at, updated_at
         FROM scans WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Scan {id} not found")))?;

    Ok(scan)
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
        "SELECT id, scan_id, ip, latency_ms, is_reachable, created_at
         FROM scan_results
         WHERE scan_id = ?
         ORDER BY latency_ms ASC NULLS LAST
         LIMIT ? OFFSET ?",
    )
    .bind(scan_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await?;

    Ok(results)
}
