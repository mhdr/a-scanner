use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::ScanResult;

/// List all scan results with optional filtering.
pub async fn list_results(
    db: &SqlitePool,
    page: u32,
    per_page: u32,
    reachable_only: Option<bool>,
    _provider: Option<&str>,
) -> Result<Vec<ScanResult>, AppError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;

    let results = if reachable_only.unwrap_or(false) {
        sqlx::query_as::<_, ScanResult>(
            "SELECT id, scan_id, ip, latency_ms, is_reachable, created_at
             FROM scan_results
             WHERE is_reachable = 1
             ORDER BY latency_ms ASC NULLS LAST
             LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(db)
        .await?
    } else {
        sqlx::query_as::<_, ScanResult>(
            "SELECT id, scan_id, ip, latency_ms, is_reachable, created_at
             FROM scan_results
             ORDER BY latency_ms ASC NULLS LAST
             LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(db)
        .await?
    };

    Ok(results)
}
