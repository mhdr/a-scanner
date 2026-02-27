pub mod orchestrator;
pub mod provider;

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use rustls::pki_types::ServerName;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_rustls::TlsConnector;

/// Configuration for a scan run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    /// Provider ID (e.g., "cloudflare", "gcore").
    pub provider_id: String,
    /// Maximum number of concurrent probes.
    pub concurrency: usize,
    /// Timeout for each IP probe in milliseconds.
    pub timeout_ms: u64,
    /// Port to probe (typically 443 for HTTPS).
    pub port: u16,
    /// Whether to run extended tests (TLS, TTFB, download speed).
    pub extended: bool,
    /// Number of samples for stability test (extended mode).
    pub samples: usize,
    /// Concurrency for extended tests (lower than phase 1).
    pub extended_concurrency: usize,
    /// Timeout for extended tests in milliseconds.
    pub extended_timeout_ms: u64,
    /// Number of TCP probes for packet loss measurement (extended mode).
    pub packet_loss_probes: usize,
    /// Optional explicit list of CIDR ranges to scan.
    /// If `None`, the orchestrator reads enabled ranges from the database.
    pub ip_ranges: Option<Vec<String>>,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            provider_id: "cloudflare".to_string(),
            concurrency: 3000,
            timeout_ms: 2000,
            port: 443,
            extended: false,
            samples: 3,
            extended_concurrency: 200,
            extended_timeout_ms: 10000,
            packet_loss_probes: 10,
            ip_ranges: None,
        }
    }
}

/// Result of probing a single IP.
#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub ip: IpAddr,
    pub latency: Option<Duration>,
    pub is_reachable: bool,
}

/// Extended test result containing all real-world metrics.
#[derive(Clone, Debug)]
pub struct ExtendedResult {
    pub ip: IpAddr,
    pub tcp_ms: u64,
    pub tls_ms: Option<u64>,
    pub ttfb_ms: Option<u64>,
    pub download_speed_kbps: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub success_rate: f64,
    pub packet_loss: f64,
    pub score: f64,
}

impl ExtendedResult {
    /// Calculate a weighted score (lower is better).
    pub fn calculate_score(&mut self) {
        let ttfb_score = self.ttfb_ms.unwrap_or(10000) as f64;

        // Invert download speed (higher speed = lower score)
        let speed_score = 10000.0 - self.download_speed_kbps.unwrap_or(0.0).min(10000.0);

        let jitter_score = self.jitter_ms.unwrap_or(1000.0);
        let tls_score = self.tls_ms.unwrap_or(5000) as f64;

        // Penalize low success rate heavily
        let success_penalty = if self.success_rate < 1.0 {
            (1.0 - self.success_rate) * 5000.0
        } else {
            0.0
        };

        // Penalize packet loss (0-100 scale, so 10% loss = 1000 penalty)
        let packet_loss_penalty = self.packet_loss * 100.0;

        self.score = (0.25 * ttfb_score)
            + (0.30 * speed_score)
            + (0.15 * jitter_score)
            + (0.10 * tls_score)
            + (0.20 * packet_loss_penalty)
            + success_penalty;
    }
}

/// Trait for CDN providers. Each provider knows how to supply IP ranges.
pub trait CdnProvider: Send + Sync {
    /// Human-readable name of the provider.
    fn name(&self) -> &str;

    /// Unique identifier for the provider.
    fn id(&self) -> &str;

    /// SNI hostname used for TLS connections to this provider.
    fn sni(&self) -> &str;

    /// URLs to fetch CIDR range lists from.
    fn ip_range_urls(&self) -> Vec<&str>;

    /// Response format for the upstream IP range URLs.
    /// `"text"` = one CIDR per line, `"json"` = JSON with addresses arrays.
    fn response_format(&self) -> &str;
}

/// Create a TLS connector with webpki root certificates.
pub fn create_tls_connector() -> TlsConnector {
    // Ensure the ring crypto provider is installed as the process-level default.
    // On Android (cross-compiled), rustls cannot auto-detect the provider from
    // crate features, so we install it explicitly.  The call is idempotent — it
    // returns Err if a provider is already installed, which we ignore.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let root_store =
        rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    TlsConnector::from(Arc::new(config))
}

/// Probe a single IP by attempting a TCP connection.
pub async fn probe_ip(ip: IpAddr, port: u16, timeout_ms: u64) -> ProbeResult {
    let addr = SocketAddr::new(ip, port);
    let duration = Duration::from_millis(timeout_ms);
    let start = tokio::time::Instant::now();

    match timeout(duration, TcpStream::connect(addr)).await {
        Ok(Ok(_)) => ProbeResult {
            ip,
            latency: Some(start.elapsed()),
            is_reachable: true,
        },
        _ => ProbeResult {
            ip,
            latency: None,
            is_reachable: false,
        },
    }
}

/// Test TLS handshake timing — measures time for TLS negotiation after TCP connect.
pub async fn test_tls_handshake(
    ip: IpAddr,
    port: u16,
    sni: &str,
    timeout_ms: u64,
    connector: &TlsConnector,
) -> Option<u64> {
    let addr = SocketAddr::new(ip, port);
    let duration = Duration::from_millis(timeout_ms);

    let tcp_stream = match timeout(duration, TcpStream::connect(addr)).await {
        Ok(Ok(stream)) => stream,
        _ => return None,
    };

    let server_name = match ServerName::try_from(sni.to_string()) {
        Ok(name) => name,
        Err(_) => return None,
    };

    let start = std::time::Instant::now();
    match timeout(duration, connector.connect(server_name, tcp_stream)).await {
        Ok(Ok(_tls_stream)) => Some(start.elapsed().as_millis() as u64),
        _ => None,
    }
}

/// Test Time-To-First-Byte — measures time from HTTP request to first response byte.
pub async fn test_ttfb(
    ip: IpAddr,
    port: u16,
    sni: &str,
    timeout_ms: u64,
    connector: &TlsConnector,
) -> Option<u64> {
    let addr = SocketAddr::new(ip, port);
    let duration = Duration::from_millis(timeout_ms);

    let tcp_stream = match timeout(duration, TcpStream::connect(addr)).await {
        Ok(Ok(stream)) => stream,
        _ => return None,
    };

    let server_name = match ServerName::try_from(sni.to_string()) {
        Ok(name) => name,
        Err(_) => return None,
    };

    let mut tls_stream = match timeout(duration, connector.connect(server_name, tcp_stream)).await {
        Ok(Ok(stream)) => stream,
        _ => return None,
    };

    let request = format!(
        "GET /cdn-cgi/trace HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        sni
    );

    let start = std::time::Instant::now();

    if timeout(duration, tls_stream.write_all(request.as_bytes()))
        .await
        .is_err()
    {
        return None;
    }

    let mut buf = [0u8; 1];
    match timeout(duration, tls_stream.read(&mut buf)).await {
        Ok(Ok(n)) if n > 0 => Some(start.elapsed().as_millis() as u64),
        _ => None,
    }
}

/// Test download speed by fetching /cdn-cgi/trace multiple times on a keep-alive connection.
pub async fn test_download_speed(
    ip: IpAddr,
    port: u16,
    sni: &str,
    timeout_ms: u64,
    connector: &TlsConnector,
) -> Option<f64> {
    let addr = SocketAddr::new(ip, port);
    let duration = Duration::from_millis(timeout_ms);

    let tcp_stream = match timeout(duration, TcpStream::connect(addr)).await {
        Ok(Ok(stream)) => stream,
        _ => return None,
    };

    let server_name = match ServerName::try_from(sni.to_string()) {
        Ok(name) => name,
        Err(_) => return None,
    };

    let mut tls_stream = match timeout(duration, connector.connect(server_name, tcp_stream)).await {
        Ok(Ok(stream)) => stream,
        _ => return None,
    };

    let request = format!(
        "GET /cdn-cgi/trace HTTP/1.1\r\nHost: {}\r\nConnection: keep-alive\r\n\r\n",
        sni
    );

    let start = std::time::Instant::now();
    let mut total_bytes = 0usize;

    for _ in 0..10 {
        if timeout(
            Duration::from_millis(1000),
            tls_stream.write_all(request.as_bytes()),
        )
        .await
        .is_err()
        {
            break;
        }

        let mut buf = [0u8; 2048];
        match timeout(Duration::from_millis(2000), tls_stream.read(&mut buf)).await {
            Ok(Ok(n)) if n > 0 => total_bytes += n,
            _ => break,
        }
    }

    let elapsed = start.elapsed().as_secs_f64();
    if elapsed > 0.0 && total_bytes > 0 {
        Some((total_bytes as f64 / 1024.0) / elapsed)
    } else {
        None
    }
}

/// Test packet loss by sending multiple TCP connect probes and measuring failure rate.
///
/// Returns packet loss as a percentage (0.0–100.0).
pub async fn test_packet_loss(
    ip: IpAddr,
    port: u16,
    timeout_ms: u64,
    probes: usize,
) -> f64 {
    let addr = SocketAddr::new(ip, port);
    let duration = Duration::from_millis(timeout_ms);
    let mut failures = 0usize;

    for _ in 0..probes {
        match timeout(duration, TcpStream::connect(addr)).await {
            Ok(Ok(_)) => {} // success
            _ => failures += 1,
        }
        // Small delay between probes to avoid burst effects
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    (failures as f64 / probes as f64) * 100.0
}

/// Quick functional verification of an IP: single TLS handshake + TTFB test.
///
/// Used as a lightweight filter before running the expensive extended test battery.
/// Returns `true` only if both TLS and TTFB succeed, confirming the IP is not
/// blocked at higher protocol layers (e.g., by GFW).
pub async fn quick_verify_ip(
    ip: IpAddr,
    port: u16,
    sni: &str,
    timeout_ms: u64,
    connector: &TlsConnector,
) -> bool {
    // TLS handshake must succeed
    let tls_ok = test_tls_handshake(ip, port, sni, timeout_ms, connector).await;
    if tls_ok.is_none() {
        return false;
    }
    // TTFB must succeed (proves HTTP-level connectivity)
    test_ttfb(ip, port, sni, timeout_ms, connector).await.is_some()
}

/// Run extended tests on a single IP with multiple samples for stability measurement.
#[allow(clippy::too_many_arguments)]
pub async fn run_extended_tests(
    ip: IpAddr,
    tcp_ms: u64,
    port: u16,
    sni: &str,
    timeout_ms: u64,
    samples: usize,
    packet_loss_probes: usize,
    connector: &TlsConnector,
) -> ExtendedResult {
    let mut ttfb_samples: Vec<u64> = Vec::with_capacity(samples);
    let mut tls_ms: Option<u64> = None;
    let mut successes = 0usize;

    for i in 0..samples {
        // First sample: measure TLS handshake separately
        if i == 0 {
            if let Some(tls) = test_tls_handshake(ip, port, sni, timeout_ms, connector).await {
                tls_ms = Some(tls);
            }
        }

        // TTFB test
        if let Some(ttfb) = test_ttfb(ip, port, sni, timeout_ms, connector).await {
            ttfb_samples.push(ttfb);
            successes += 1;
        }

        // Small delay between samples
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    // Download speed test (single measurement)
    let download_speed = test_download_speed(ip, port, sni, timeout_ms, connector).await;

    // Packet loss test
    let packet_loss = test_packet_loss(ip, port, timeout_ms, packet_loss_probes).await;

    // Calculate TTFB average
    let ttfb_avg = if !ttfb_samples.is_empty() {
        Some(ttfb_samples.iter().sum::<u64>() / ttfb_samples.len() as u64)
    } else {
        None
    };

    // Calculate jitter (standard deviation of TTFB)
    let jitter = if ttfb_samples.len() >= 2 {
        let mean = ttfb_samples.iter().sum::<u64>() as f64 / ttfb_samples.len() as f64;
        let variance = ttfb_samples
            .iter()
            .map(|&x| {
                let diff = x as f64 - mean;
                diff * diff
            })
            .sum::<f64>()
            / ttfb_samples.len() as f64;
        Some(variance.sqrt())
    } else {
        None
    };

    let success_rate = successes as f64 / samples as f64;

    let mut result = ExtendedResult {
        ip,
        tcp_ms,
        tls_ms,
        ttfb_ms: ttfb_avg,
        download_speed_kbps: download_speed,
        jitter_ms: jitter,
        success_rate,
        packet_loss,
        score: 0.0,
    };

    result.calculate_score();
    result
}

/// Try to raise the file descriptor limit for high concurrency scanning.
pub fn setup_fd_limit(desired: u64) -> u64 {
    match rlimit::increase_nofile_limit(desired) {
        Ok(actual) => {
            if actual < desired {
                tracing::warn!(
                    "Requested {} file descriptors but only got {}",
                    desired,
                    actual
                );
            }
            actual
        }
        Err(e) => {
            tracing::warn!("Failed to increase file descriptor limit: {}", e);
            1024 // fallback
        }
    }
}
