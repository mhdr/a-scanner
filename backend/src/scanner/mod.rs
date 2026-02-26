pub mod provider;

use std::net::IpAddr;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Configuration for a scan run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    /// Maximum number of concurrent probes.
    pub concurrency: usize,
    /// Timeout for each IP probe.
    pub timeout: Duration,
    /// Number of retries per IP.
    pub retries: u32,
    /// Port to probe (typically 443 for HTTPS).
    pub port: u16,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            concurrency: 64,
            timeout: Duration::from_secs(3),
            retries: 1,
            port: 443,
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

/// Trait for CDN providers. Each provider knows its IP ranges.
pub trait CdnProvider: Send + Sync {
    /// Human-readable name of the provider.
    fn name(&self) -> &str;

    /// Unique identifier for the provider.
    fn id(&self) -> &str;

    /// Return the list of IP addresses to scan.
    fn ip_ranges(&self) -> Vec<IpAddr>;
}

/// Probe a single IP by attempting a TCP connection.
pub async fn probe_ip(ip: IpAddr, port: u16, timeout: Duration) -> ProbeResult {
    let addr = std::net::SocketAddr::new(ip, port);
    let start = tokio::time::Instant::now();

    match tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr)).await {
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
