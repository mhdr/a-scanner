use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use futures::stream::{self, StreamExt};
use sqlx::SqlitePool;
use tokio_rustls::TlsConnector;
use uuid::Uuid;

use ipnet::IpNet;

use super::provider::{expand_ranges, fetch_provider_ips, get_provider_from_db};
use super::{probe_ip, run_extended_tests, setup_fd_limit, ScanConfig};
use crate::models::ScanStatus;
use crate::services;

/// Run a full scan as a background task.
///
/// This function is designed to be spawned via `tokio::spawn`. It:
/// 1. Fetches IP ranges for the provider
/// 2. Runs Phase 1 (TCP probe) on all IPs concurrently
/// 3. If extended mode, runs Phase 2 (TLS/TTFB/speed) on reachable IPs
/// 4. Updates scan status and results in the database throughout
pub async fn run_scan(
    scan_id: String,
    config: ScanConfig,
    pool: SqlitePool,
    tls_connector: Arc<TlsConnector>,
) {
    if let Err(e) = run_scan_inner(&scan_id, &config, &pool, &tls_connector).await {
        tracing::error!("Scan {} failed: {}", scan_id, e);
        let _ = update_scan_status(&pool, &scan_id, ScanStatus::Failed).await;
    }
}

async fn run_scan_inner(
    scan_id: &str,
    config: &ScanConfig,
    pool: &SqlitePool,
    tls_connector: &Arc<TlsConnector>,
) -> anyhow::Result<()> {
    // Resolve provider
    let provider = get_provider_from_db(pool, &config.provider_id)
        .await
        .map_err(|e| anyhow::anyhow!("Provider lookup failed: {e}"))?;

    // Update status to running
    update_scan_status(pool, scan_id, ScanStatus::Running).await?;

    // Resolve IP list: explicit ranges > DB enabled ranges > live fetch fallback
    tracing::info!("Scan {}: resolving IP ranges for {}", scan_id, provider.name());
    let ips = if let Some(ref cidr_list) = config.ip_ranges {
        // Explicit ranges provided in the request
        let mut nets: Vec<IpNet> = Vec::new();
        for cidr in cidr_list {
            nets.push(cidr.parse().map_err(|e| anyhow::anyhow!("Invalid CIDR '{}': {}", cidr, e))?);
        }
        expand_ranges(&nets, true)
    } else {
        // Try DB enabled ranges first
        let db_ranges = services::provider_service::get_enabled_ranges(pool, &config.provider_id)
            .await
            .unwrap_or_default();
        if db_ranges.is_empty() {
            // Fallback: fetch live from provider URLs (first run, no ranges in DB yet)
            tracing::info!("Scan {}: no DB ranges, fetching live", scan_id);
            fetch_provider_ips(provider.as_ref()).await?
        } else {
            let mut nets: Vec<IpNet> = Vec::new();
            for r in &db_ranges {
                if let Ok(net) = r.cidr.parse::<IpNet>() {
                    nets.push(net);
                }
            }
            expand_ranges(&nets, true)
        }
    };
    let total_ips = ips.len() as i64;

    // Update total_ips count
    sqlx::query("UPDATE scans SET total_ips = ?, updated_at = ? WHERE id = ?")
        .bind(total_ips)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(scan_id)
        .execute(pool)
        .await?;

    tracing::info!("Scan {}: starting Phase 1 with {} IPs", scan_id, total_ips);

    // Raise file descriptor limit for high concurrency
    let fd_buffer = 100u64;
    let desired_fds = config.concurrency as u64 + fd_buffer;
    let actual_fds = setup_fd_limit(desired_fds);
    let concurrency = if actual_fds < desired_fds {
        let adjusted = (actual_fds.saturating_sub(fd_buffer)) as usize;
        tracing::warn!(
            "Scan {}: adjusting concurrency from {} to {} due to FD limits",
            scan_id,
            config.concurrency,
            adjusted
        );
        adjusted.max(1)
    } else {
        config.concurrency
    };

    // Phase 1: TCP scan
    let scanned_count = Arc::new(AtomicU64::new(0));
    let reachable_results: Arc<tokio::sync::Mutex<Vec<(std::net::IpAddr, u64)>>> =
        Arc::new(tokio::sync::Mutex::new(Vec::new()));

    let port = config.port;
    let timeout_ms = config.timeout_ms;
    let scan_id_owned = scan_id.to_string();
    let pool_clone = pool.clone();

    // Batch insert buffer
    let batch_size = 100usize;
    let pending_results: Arc<tokio::sync::Mutex<Vec<(String, String, String, Option<i64>, bool)>>> =
        Arc::new(tokio::sync::Mutex::new(Vec::new()));

    stream::iter(ips)
        .map(|ip| {
            let scanned = scanned_count.clone();
            let reachable = reachable_results.clone();
            let pending = pending_results.clone();
            let pool = pool_clone.clone();
            let scan_id = scan_id_owned.clone();

            async move {
                let result = probe_ip(ip, port, timeout_ms).await;
                let count = scanned.fetch_add(1, Ordering::Relaxed) + 1;

                let latency_ms = result
                    .latency
                    .map(|d| d.as_millis() as i64);

                if result.is_reachable {
                    if let Some(lat) = latency_ms {
                        reachable.lock().await.push((ip, lat as u64));
                    }
                }

                // Queue result for batch insert
                let row = (
                    Uuid::new_v4().to_string(),
                    scan_id.clone(),
                    ip.to_string(),
                    latency_ms,
                    result.is_reachable,
                );

                let mut buf = pending.lock().await;
                buf.push(row);

                let should_flush = buf.len() >= batch_size;
                if should_flush {
                    let batch: Vec<_> = buf.drain(..).collect();
                    drop(buf);
                    let _ = flush_results(&pool, &batch).await;
                    // Update scanned_ips progress
                    let _ = sqlx::query(
                        "UPDATE scans SET scanned_ips = ?, updated_at = ? WHERE id = ?",
                    )
                    .bind(count as i64)
                    .bind(chrono::Utc::now().to_rfc3339())
                    .bind(&scan_id)
                    .execute(&pool)
                    .await;
                }
            }
        })
        .buffer_unordered(concurrency)
        .collect::<Vec<()>>()
        .await;

    // Flush remaining results
    {
        let buf = pending_results.lock().await;
        if !buf.is_empty() {
            let _ = flush_results(&pool_clone, &buf).await;
        }
    }

    // Final progress update
    let final_scanned = scanned_count.load(Ordering::Relaxed);
    sqlx::query("UPDATE scans SET scanned_ips = ?, updated_at = ? WHERE id = ?")
        .bind(final_scanned as i64)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(scan_id)
        .execute(pool)
        .await?;

    let mut reachable = reachable_results.lock().await.clone();
    reachable.sort_by_key(|(_, latency)| *latency);

    tracing::info!(
        "Scan {}: Phase 1 complete — {}/{} reachable",
        scan_id,
        reachable.len(),
        total_ips
    );

    // Phase 2: Extended tests (if enabled)
    if config.extended && !reachable.is_empty() {
        tracing::info!(
            "Scan {}: starting Phase 2 extended tests on {} IPs",
            scan_id,
            reachable.len()
        );

        let sni = provider.sni().to_string();
        let ext_timeout = config.extended_timeout_ms;
        let samples = config.samples;
        let ext_concurrency = config.extended_concurrency;
        let connector = tls_connector.clone();

        let extended_results: Arc<tokio::sync::Mutex<Vec<super::ExtendedResult>>> =
            Arc::new(tokio::sync::Mutex::new(Vec::new()));

        let ext_results_clone = extended_results.clone();
        let pool_phase2 = pool.clone();
        let scan_id_phase2 = scan_id.to_string();

        stream::iter(reachable.clone())
            .map(|(ip, tcp_ms)| {
                let results = ext_results_clone.clone();
                let connector = connector.clone();
                let sni = sni.clone();
                let pool = pool_phase2.clone();
                let scan_id = scan_id_phase2.clone();

                async move {
                    let result = run_extended_tests(
                        ip, tcp_ms, port, &sni, ext_timeout, samples, &connector,
                    )
                    .await;

                    // Update the existing scan_result row with extended metrics
                    let _ = sqlx::query(
                        "UPDATE scan_results SET
                            tls_latency_ms = ?, ttfb_ms = ?, download_speed_kbps = ?,
                            jitter_ms = ?, success_rate = ?, score = ?
                         WHERE scan_id = ? AND ip = ?",
                    )
                    .bind(result.tls_ms.map(|v| v as i64))
                    .bind(result.ttfb_ms.map(|v| v as i64))
                    .bind(result.download_speed_kbps)
                    .bind(result.jitter_ms)
                    .bind(result.success_rate)
                    .bind(result.score)
                    .bind(&scan_id)
                    .bind(ip.to_string())
                    .execute(&pool)
                    .await;

                    results.lock().await.push(result);
                }
            })
            .buffer_unordered(ext_concurrency)
            .collect::<Vec<()>>()
            .await;

        let ext_count = extended_results.lock().await.len();
        tracing::info!(
            "Scan {}: Phase 2 complete — {} extended results",
            scan_id,
            ext_count
        );

        // Update scan mode
        sqlx::query("UPDATE scans SET mode = 'extended', updated_at = ? WHERE id = ?")
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(scan_id)
            .execute(pool)
            .await?;
    }

    // Mark scan as completed
    update_scan_status(pool, scan_id, ScanStatus::Completed).await?;
    tracing::info!("Scan {} completed successfully", scan_id);

    Ok(())
}

/// Update the status of a scan.
async fn update_scan_status(
    pool: &SqlitePool,
    scan_id: &str,
    status: ScanStatus,
) -> anyhow::Result<()> {
    sqlx::query("UPDATE scans SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status.as_str())
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(scan_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Flush a batch of scan results into the database.
async fn flush_results(
    pool: &SqlitePool,
    batch: &[(String, String, String, Option<i64>, bool)],
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    for (id, scan_id, ip, latency_ms, is_reachable) in batch {
        sqlx::query(
            "INSERT INTO scan_results (id, scan_id, ip, latency_ms, is_reachable, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(scan_id)
        .bind(ip)
        .bind(latency_ms)
        .bind(is_reachable)
        .bind(&now)
        .execute(pool)
        .await?;
    }
    Ok(())
}
