use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::ScanResult;

/// List all scan results with optional filtering.
pub async fn list_results(
    db: &SqlitePool,
    page: u32,
    per_page: u32,
    reachable_only: Option<bool>,
    provider: Option<&str>,
) -> Result<Vec<ScanResult>, AppError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;
    let reachable = reachable_only.unwrap_or(false);

    let results = if let Some(prov) = provider {
        if reachable {
            sqlx::query_as::<_, ScanResult>(
                "SELECT sr.id, sr.scan_id, sr.ip, sr.latency_ms, sr.is_reachable, sr.created_at,
                        sr.tls_latency_ms, sr.ttfb_ms, sr.download_speed_kbps,
                        sr.jitter_ms, sr.success_rate, sr.score
                 FROM scan_results sr
                 JOIN scans s ON sr.scan_id = s.id
                 WHERE sr.is_reachable = 1 AND s.provider = ?
                 ORDER BY CASE WHEN sr.score IS NOT NULL THEN sr.score ELSE sr.latency_ms END ASC NULLS LAST
                 LIMIT ? OFFSET ?",
            )
            .bind(prov)
            .bind(limit)
            .bind(offset)
            .fetch_all(db)
            .await?
        } else {
            sqlx::query_as::<_, ScanResult>(
                "SELECT sr.id, sr.scan_id, sr.ip, sr.latency_ms, sr.is_reachable, sr.created_at,
                        sr.tls_latency_ms, sr.ttfb_ms, sr.download_speed_kbps,
                        sr.jitter_ms, sr.success_rate, sr.score
                 FROM scan_results sr
                 JOIN scans s ON sr.scan_id = s.id
                 WHERE s.provider = ?
                 ORDER BY CASE WHEN sr.score IS NOT NULL THEN sr.score ELSE sr.latency_ms END ASC NULLS LAST
                 LIMIT ? OFFSET ?",
            )
            .bind(prov)
            .bind(limit)
            .bind(offset)
            .fetch_all(db)
            .await?
        }
    } else if reachable {
        sqlx::query_as::<_, ScanResult>(
            "SELECT id, scan_id, ip, latency_ms, is_reachable, created_at,
                    tls_latency_ms, ttfb_ms, download_speed_kbps,
                    jitter_ms, success_rate, score
             FROM scan_results
             WHERE is_reachable = 1
             ORDER BY CASE WHEN score IS NOT NULL THEN score ELSE latency_ms END ASC NULLS LAST
             LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(db)
        .await?
    } else {
        sqlx::query_as::<_, ScanResult>(
            "SELECT id, scan_id, ip, latency_ms, is_reachable, created_at,
                    tls_latency_ms, ttfb_ms, download_speed_kbps,
                    jitter_ms, success_rate, score
             FROM scan_results
             ORDER BY CASE WHEN score IS NOT NULL THEN score ELSE latency_ms END ASC NULLS LAST
             LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(db)
        .await?
    };

    Ok(results)
}
