use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use futures::stream::{self, StreamExt};
use sqlx::SqlitePool;
use tokio::sync::broadcast;
use tokio_rustls::TlsConnector;
use uuid::Uuid;

use ipnet::IpNet;

use super::provider::{expand_ranges, fetch_provider_ips, get_provider_from_db};
use super::{probe_ip, quick_verify_ip, run_extended_tests, setup_fd_limit, ScanConfig};
use crate::models::{ScanProgressEvent, ScanStatus};
use crate::services;

/// In-memory representation of a scan result row, accumulated during scanning
/// and flushed to the database in bulk at the end.
#[derive(Debug, Clone)]
struct PendingResult {
    id: String,
    ip: String,
    latency_ms: Option<i64>,
    is_reachable: bool,
    tls_latency_ms: Option<i64>,
    ttfb_ms: Option<i64>,
    download_speed_kbps: Option<f64>,
    jitter_ms: Option<f64>,
    success_rate: Option<f64>,
    packet_loss: Option<f64>,
    score: Option<f64>,
}

/// Run a full scan as a background task.
///
/// This function is designed to be spawned via `tokio::spawn`. It:
/// 1. Fetches IP ranges for the provider
/// 2. Runs Phase 1 (TCP probe) on all IPs concurrently
/// 3. If extended mode, runs Phase 2 (TLS/TTFB/speed) on reachable IPs
/// 4. Writes all results to the database in bulk at the end
///
/// The caller is responsible for creating and cleaning up the broadcast channel.
pub async fn run_scan(
    scan_id: String,
    config: ScanConfig,
    pool: SqlitePool,
    tls_connector: Arc<TlsConnector>,
    tx: broadcast::Sender<ScanProgressEvent>,
) {
    if let Err(e) = run_scan_inner(&scan_id, &config, &pool, &tls_connector, &tx).await {
        tracing::error!("Scan {} failed: {}", scan_id, e);
        let _ = update_scan_status(&pool, &scan_id, ScanStatus::Failed).await;
        // Fetch the latest scan data from DB so we preserve the real progress counts
        // rather than resetting them to 0.
        let (scanned, working, total) =
            match services::scan_service::get_scan(&pool, &scan_id).await {
                Ok(s) => (s.scanned_ips, s.working_ips, s.total_ips),
                Err(_) => (0, 0, 0),
            };
        let _ = tx.send(ScanProgressEvent {
            scan_id: scan_id.clone(),
            status: "failed".to_string(),
            scanned_ips: scanned,
            working_ips: working,
            total_ips: total,
            phase: "failed".to_string(),
            extended_done: None,
            extended_total: None,
        });
    }
}

/// Emit a progress event, ignoring send errors (no subscribers).
fn emit_progress(
    tx: &broadcast::Sender<ScanProgressEvent>,
    scan_id: &str,
    status: &str,
    scanned_ips: i64,
    working_ips: i64,
    total_ips: i64,
    phase: &str,
) {
    let _ = tx.send(ScanProgressEvent {
        scan_id: scan_id.to_string(),
        status: status.to_string(),
        scanned_ips,
        working_ips,
        total_ips,
        phase: phase.to_string(),
        extended_done: None,
        extended_total: None,
    });
}

/// Emit a progress event with extended-test progress info.
fn emit_progress_ext(
    tx: &broadcast::Sender<ScanProgressEvent>,
    scan_id: &str,
    status: &str,
    scanned_ips: i64,
    working_ips: i64,
    total_ips: i64,
    phase: &str,
    extended_done: i64,
    extended_total: i64,
) {
    let _ = tx.send(ScanProgressEvent {
        scan_id: scan_id.to_string(),
        status: status.to_string(),
        scanned_ips,
        working_ips,
        total_ips,
        phase: phase.to_string(),
        extended_done: Some(extended_done),
        extended_total: Some(extended_total),
    });
}

async fn run_scan_inner(
    scan_id: &str,
    config: &ScanConfig,
    pool: &SqlitePool,
    tls_connector: &Arc<TlsConnector>,
    tx: &broadcast::Sender<ScanProgressEvent>,
) -> anyhow::Result<()> {
    // Resolve provider
    let provider = get_provider_from_db(pool, &config.provider_id)
        .await
        .map_err(|e| anyhow::anyhow!("Provider lookup failed: {e}"))?;

    // Update status to running
    update_scan_status(pool, scan_id, ScanStatus::Running).await?;
    emit_progress(tx, scan_id, "running", 0, 0, 0, "resolving");

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

    emit_progress(tx, scan_id, "running", 0, 0, total_ips, "phase1");
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

    // Phase 1: TCP scan — all results collected in memory, no DB writes
    let scanned_count = Arc::new(AtomicU64::new(0));
    let working_count = Arc::new(AtomicU64::new(0));
    let reachable_results: Arc<tokio::sync::Mutex<Vec<(std::net::IpAddr, u64)>>> =
        Arc::new(tokio::sync::Mutex::new(Vec::new()));

    // In-memory result accumulator keyed by IP string
    let all_results: Arc<tokio::sync::Mutex<HashMap<String, PendingResult>>> =
        Arc::new(tokio::sync::Mutex::new(HashMap::new()));

    let port = config.port;
    let timeout_ms = config.timeout_ms;
    let scan_id_owned = scan_id.to_string();
    let tx_clone = tx.clone();
    // Emit progress every N IPs (at least every 1% or every 50 IPs)
    let progress_interval = (total_ips as u64 / 100).max(50);

    stream::iter(ips)
        .map(|ip| {
            let scanned = scanned_count.clone();
            let working = working_count.clone();
            let reachable = reachable_results.clone();
            let results_map = all_results.clone();
            let scan_id = scan_id_owned.clone();
            let tx = tx_clone.clone();

            async move {
                let result = probe_ip(ip, port, timeout_ms).await;
                let count = scanned.fetch_add(1, Ordering::Relaxed) + 1;

                let latency_ms = result.latency.map(|d| d.as_millis() as i64);

                if result.is_reachable {
                    working.fetch_add(1, Ordering::Relaxed);
                    if let Some(lat) = latency_ms {
                        reachable.lock().await.push((ip, lat as u64));
                    }
                }

                let ip_str = ip.to_string();
                let row = PendingResult {
                    id: Uuid::new_v4().to_string(),
                    ip: ip_str.clone(),
                    latency_ms,
                    is_reachable: result.is_reachable,
                    tls_latency_ms: None,
                    ttfb_ms: None,
                    download_speed_kbps: None,
                    jitter_ms: None,
                    success_rate: None,
                    packet_loss: None,
                    score: None,
                };
                results_map.lock().await.insert(ip_str, row);

                // Emit progress periodically to avoid flooding WS clients
                if count % progress_interval == 0 || count == total_ips as u64 {
                    let w = working.load(Ordering::Relaxed) as i64;
                    emit_progress(&tx, &scan_id, "running", count as i64, w, total_ips, "phase1");
                }
            }
        })
        .buffer_unordered(concurrency)
        .collect::<Vec<()>>()
        .await;

    // Update scanned_ips progress
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

    // Persist working_ips count after Phase 1
    let working_count = reachable.len() as i64;
    if let Err(e) = services::scan_service::update_working_ips(pool, scan_id, working_count).await {
        tracing::warn!("Scan {}: failed to update working_ips: {}", scan_id, e);
    }
    emit_progress(tx, scan_id, "running", total_ips, working_count, total_ips, "phase1_done");

    // Phase 2: Extended tests (if enabled)
    if config.extended && !reachable.is_empty() {
        // Phase 1.5: Quick verify — filter out IPs that are TCP-reachable but
        // blocked at TLS/HTTP layer (e.g., by GFW). This avoids wasting time
        // running the full extended test battery on non-functional IPs.
        let sni = provider.sni().to_string();
        let pre_verify_count = reachable.len();
        tracing::info!(
            "Scan {}: starting quick verify on {} reachable IPs",
            scan_id,
            pre_verify_count
        );
        emit_progress(tx, scan_id, "running", total_ips, working_count, total_ips, "quick_verify");

        let connector_verify = tls_connector.clone();
        let sni_verify = sni.clone();
        let verify_timeout = config.timeout_ms;
        let verify_port = config.port;

        let verified: Vec<(std::net::IpAddr, u64)> = stream::iter(reachable)
            .map(|(ip, tcp_ms)| {
                let connector = connector_verify.clone();
                let sni = sni_verify.clone();
                async move {
                    let ok = quick_verify_ip(ip, verify_port, &sni, verify_timeout, &connector).await;
                    (ip, tcp_ms, ok)
                }
            })
            .buffer_unordered(concurrency)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .filter_map(|(ip, tcp_ms, ok)| if ok { Some((ip, tcp_ms)) } else { None })
            .collect();

        // Mark IPs that failed quick-verify as not reachable in memory
        {
            let verified_set: std::collections::HashSet<String> =
                verified.iter().map(|(ip, _)| ip.to_string()).collect();
            let original_reachable = reachable_results.lock().await;
            let failed_ips: Vec<String> = original_reachable
                .iter()
                .map(|(ip, _)| ip.to_string())
                .filter(|ip_str| !verified_set.contains(ip_str))
                .collect();

            if !failed_ips.is_empty() {
                let mut map = all_results.lock().await;
                for ip_str in &failed_ips {
                    if let Some(r) = map.get_mut(ip_str) {
                        r.is_reachable = false;
                    }
                }
                tracing::info!(
                    "Scan {}: marked {} IPs as unreachable (failed quick verify)",
                    scan_id,
                    failed_ips.len()
                );
            }
        }

        let reachable = verified;

        tracing::info!(
            "Scan {}: quick verify complete — {}/{} passed",
            scan_id,
            reachable.len(),
            pre_verify_count
        );

        // Update working_ips with refined count after quick verify
        let verified_count = reachable.len() as i64;
        if let Err(e) = services::scan_service::update_working_ips(pool, scan_id, verified_count).await {
            tracing::warn!("Scan {}: failed to update working_ips after quick verify: {}", scan_id, e);
        }
        emit_progress(tx, scan_id, "running", total_ips, verified_count, total_ips, "quick_verify_done");

        if reachable.is_empty() {
            tracing::info!("Scan {}: no IPs passed quick verify, skipping Phase 2", scan_id);
            // Flush all results to DB before completing
            tracing::info!("Scan {}: writing results to database...", scan_id);
            flush_all_results(pool, scan_id, &all_results.lock().await).await?;
            update_scan_status(pool, scan_id, ScanStatus::Completed).await?;
            tracing::info!("Scan {} completed successfully", scan_id);
            return Ok(());
        }

        let extended_total = reachable.len() as i64;
        emit_progress_ext(tx, scan_id, "running", total_ips, verified_count, total_ips, "phase2", 0, extended_total);
        tracing::info!(
            "Scan {}: starting Phase 2 extended tests on {} IPs",
            scan_id,
            reachable.len()
        );
        let ext_timeout = config.extended_timeout_ms;
        let samples = config.samples;
        let ext_concurrency = config.extended_concurrency;
        let packet_loss_probes = config.packet_loss_probes;
        let connector = tls_connector.clone();

        // Collect extended results in memory
        let ext_results_map = all_results.clone();
        let ext_done_count = Arc::new(AtomicU64::new(0));
        // Emit Phase 2 progress every N IPs (at least every 1 IP for small sets, cap at 5)
        let ext_progress_interval = (extended_total as u64 / 20).max(1);
        let scan_id_p2 = scan_id.to_string();
        let tx_p2 = tx.clone();

        stream::iter(reachable.clone())
            .map(|(ip, tcp_ms)| {
                let results_map = ext_results_map.clone();
                let connector = connector.clone();
                let sni = sni.clone();
                let ext_done = ext_done_count.clone();
                let scan_id = scan_id_p2.clone();
                let tx = tx_p2.clone();

                async move {
                    let result = run_extended_tests(
                        ip, tcp_ms, port, &sni, ext_timeout, samples, packet_loss_probes, &connector,
                    )
                    .await;

                    // Update in-memory result with extended metrics
                    let ip_str = ip.to_string();
                    let mut map = results_map.lock().await;
                    if let Some(r) = map.get_mut(&ip_str) {
                        r.tls_latency_ms = result.tls_ms.map(|v| v as i64);
                        r.ttfb_ms = result.ttfb_ms.map(|v| v as i64);
                        r.download_speed_kbps = result.download_speed_kbps;
                        r.jitter_ms = result.jitter_ms;
                        r.success_rate = Some(result.success_rate);
                        r.packet_loss = Some(result.packet_loss);
                        r.score = Some(result.score);
                    }

                    // Emit Phase 2 progress periodically
                    let done = ext_done.fetch_add(1, Ordering::Relaxed) + 1;
                    if done % ext_progress_interval == 0 || done == extended_total as u64 {
                        emit_progress_ext(
                            &tx, &scan_id, "running",
                            total_ips, verified_count, total_ips,
                            "phase2", done as i64, extended_total,
                        );
                    }
                }
            })
            .buffer_unordered(ext_concurrency)
            .collect::<Vec<()>>()
            .await;

        tracing::info!(
            "Scan {}: Phase 2 complete — {} extended results",
            scan_id,
            reachable.len()
        );

        // Update scan mode (cheap single-row update)
        sqlx::query("UPDATE scans SET mode = 'extended', updated_at = ? WHERE id = ?")
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(scan_id)
            .execute(pool)
            .await?;
    }

    // Flush all accumulated results to the database in bulk
    tracing::info!("Scan {}: writing {} results to database...", scan_id, all_results.lock().await.len());
    flush_all_results(pool, scan_id, &all_results.lock().await).await?;

    // Mark scan as completed
    update_scan_status(pool, scan_id, ScanStatus::Completed).await?;
    let final_working = services::scan_service::get_scan(pool, scan_id)
        .await
        .map(|s| s.working_ips)
        .unwrap_or(0);
    emit_progress(tx, scan_id, "completed", total_ips, final_working, total_ips, "done");
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

/// Flush all accumulated scan results to the database in a single transaction.
async fn flush_all_results(
    pool: &SqlitePool,
    scan_id: &str,
    results: &tokio::sync::MutexGuard<'_, HashMap<String, PendingResult>>,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut tx = pool.begin().await?;

    for r in results.values() {
        sqlx::query(
            "INSERT INTO scan_results (id, scan_id, ip, latency_ms, is_reachable, created_at,
                tls_latency_ms, ttfb_ms, download_speed_kbps, jitter_ms, success_rate, packet_loss, score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.id)
        .bind(scan_id)
        .bind(&r.ip)
        .bind(r.latency_ms)
        .bind(r.is_reachable)
        .bind(&now)
        .bind(r.tls_latency_ms)
        .bind(r.ttfb_ms)
        .bind(r.download_speed_kbps)
        .bind(r.jitter_ms)
        .bind(r.success_rate)
        .bind(r.packet_loss)
        .bind(r.score)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    tracing::info!("Flushed {} results for scan {}", results.len(), scan_id);
    Ok(())
}
