use sqlx::SqlitePool;

use crate::error::CoreError;
use crate::models::{AggregatedIpResult, ScanResult};

/// List all scan results with optional filtering.
pub async fn list_results(
    db: &SqlitePool,
    page: u32,
    per_page: u32,
    reachable_only: Option<bool>,
    provider: Option<&str>,
) -> Result<Vec<ScanResult>, CoreError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;
    let reachable = reachable_only.unwrap_or(false);

    let results = if let Some(prov) = provider {
        if reachable {
            sqlx::query_as::<_, ScanResult>(
                "SELECT sr.id, sr.scan_id, sr.ip, sr.latency_ms, sr.is_reachable, sr.created_at,
                        sr.tls_latency_ms, sr.ttfb_ms, sr.download_speed_kbps,
                        sr.jitter_ms, sr.success_rate, sr.packet_loss, sr.score
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
                        sr.jitter_ms, sr.success_rate, sr.packet_loss, sr.score
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
                    jitter_ms, success_rate, packet_loss, score
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
                    jitter_ms, success_rate, packet_loss, score
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

/// Count all scan results matching the given filters.
pub async fn count_results(
    db: &SqlitePool,
    reachable_only: Option<bool>,
    provider: Option<&str>,
) -> Result<i64, CoreError> {
    let reachable = reachable_only.unwrap_or(false);

    let count: (i64,) = if let Some(prov) = provider {
        if reachable {
            sqlx::query_as(
                "SELECT COUNT(*) FROM scan_results sr JOIN scans s ON sr.scan_id = s.id WHERE sr.is_reachable = 1 AND s.provider = ?",
            )
            .bind(prov)
            .fetch_one(db)
            .await?
        } else {
            sqlx::query_as(
                "SELECT COUNT(*) FROM scan_results sr JOIN scans s ON sr.scan_id = s.id WHERE s.provider = ?",
            )
            .bind(prov)
            .fetch_one(db)
            .await?
        }
    } else if reachable {
        sqlx::query_as("SELECT COUNT(*) FROM scan_results WHERE is_reachable = 1")
            .fetch_one(db)
            .await?
    } else {
        sqlx::query_as("SELECT COUNT(*) FROM scan_results")
            .fetch_one(db)
            .await?
    };

    Ok(count.0)
}

/// List aggregated (deduplicated) reachable IP results with averages.
pub async fn list_aggregated_ips(
    db: &SqlitePool,
    page: u32,
    per_page: u32,
    provider: Option<&str>,
) -> Result<Vec<AggregatedIpResult>, CoreError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;

    let results = if let Some(prov) = provider {
        sqlx::query_as::<_, AggregatedIpResult>(
            "SELECT sr.ip,
                    AVG(sr.latency_ms) as avg_latency_ms,
                    AVG(sr.tls_latency_ms) as avg_tls_latency_ms,
                    AVG(sr.ttfb_ms) as avg_ttfb_ms,
                    AVG(sr.download_speed_kbps) as avg_download_speed_kbps,
                    AVG(sr.jitter_ms) as avg_jitter_ms,
                    AVG(sr.packet_loss) as avg_packet_loss,
                    AVG(sr.score) as avg_score,
                    COUNT(*) as scan_count,
                    MAX(sr.created_at) as last_seen
             FROM scan_results sr
             JOIN scans s ON sr.scan_id = s.id
             WHERE sr.is_reachable = 1 AND s.provider = ?
             GROUP BY sr.ip
             ORDER BY avg_score ASC NULLS LAST, avg_latency_ms ASC NULLS LAST
             LIMIT ? OFFSET ?",
        )
        .bind(prov)
        .bind(limit)
        .bind(offset)
        .fetch_all(db)
        .await?
    } else {
        sqlx::query_as::<_, AggregatedIpResult>(
            "SELECT ip,
                    AVG(latency_ms) as avg_latency_ms,
                    AVG(tls_latency_ms) as avg_tls_latency_ms,
                    AVG(ttfb_ms) as avg_ttfb_ms,
                    AVG(download_speed_kbps) as avg_download_speed_kbps,
                    AVG(jitter_ms) as avg_jitter_ms,
                    AVG(packet_loss) as avg_packet_loss,
                    AVG(score) as avg_score,
                    COUNT(*) as scan_count,
                    MAX(created_at) as last_seen
             FROM scan_results
             WHERE is_reachable = 1
             GROUP BY ip
             ORDER BY avg_score ASC NULLS LAST, avg_latency_ms ASC NULLS LAST
             LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(db)
        .await?
    };

    Ok(results)
}

/// Count unique reachable IPs matching the given filters.
pub async fn count_aggregated_ips(
    db: &SqlitePool,
    provider: Option<&str>,
) -> Result<i64, CoreError> {
    let count: (i64,) = if let Some(prov) = provider {
        sqlx::query_as(
            "SELECT COUNT(DISTINCT sr.ip) FROM scan_results sr JOIN scans s ON sr.scan_id = s.id WHERE sr.is_reachable = 1 AND s.provider = ?",
        )
        .bind(prov)
        .fetch_one(db)
        .await?
    } else {
        sqlx::query_as("SELECT COUNT(DISTINCT ip) FROM scan_results WHERE is_reachable = 1")
            .fetch_one(db)
            .await?
    };

    Ok(count.0)
}

/// List all individual scan results for a specific IP.
pub async fn list_ip_results(
    db: &SqlitePool,
    ip: &str,
    page: u32,
    per_page: u32,
) -> Result<Vec<ScanResult>, CoreError> {
    let offset = ((page - 1) * per_page) as i64;
    let limit = per_page as i64;

    let results = sqlx::query_as::<_, ScanResult>(
        "SELECT id, scan_id, ip, latency_ms, is_reachable, created_at,
                tls_latency_ms, ttfb_ms, download_speed_kbps,
                jitter_ms, success_rate, packet_loss, score
         FROM scan_results
         WHERE ip = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(ip)
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await?;

    Ok(results)
}

/// Count all results for a specific IP.
pub async fn count_ip_results(db: &SqlitePool, ip: &str) -> Result<i64, CoreError> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM scan_results WHERE ip = ?",
    )
    .bind(ip)
    .fetch_one(db)
    .await?;
    Ok(row.0)
}
