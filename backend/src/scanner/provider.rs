use std::net::IpAddr;

use ipnet::IpNet;

use super::CdnProvider;

/// Fetch a URL and parse each non-empty, non-comment line as an IpNet CIDR range.
async fn fetch_cidr_list(url: &str) -> anyhow::Result<Vec<IpNet>> {
    let body = reqwest::get(url).await?.text().await?;
    let mut ranges = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        match trimmed.parse::<IpNet>() {
            Ok(net) => ranges.push(net),
            Err(e) => tracing::warn!("Skipping invalid CIDR '{}': {}", trimmed, e),
        }
    }
    Ok(ranges)
}

/// Expand CIDR ranges into individual IP addresses.
/// IPv6 ranges are capped at 65536 IPs each.
pub fn expand_ranges(ranges: &[IpNet], ipv4_only: bool) -> Vec<IpAddr> {
    let mut ips = Vec::new();
    for range in ranges {
        match range {
            IpNet::V4(net) => {
                for ip in net.hosts() {
                    ips.push(IpAddr::V4(ip));
                }
            }
            IpNet::V6(net) => {
                if ipv4_only {
                    continue;
                }
                let mut count = 0u64;
                for ip in net.hosts() {
                    if count >= 65536 {
                        tracing::warn!(
                            "IPv6 range {} has too many IPs, limiting to first 65536",
                            net
                        );
                        break;
                    }
                    ips.push(IpAddr::V6(ip));
                    count += 1;
                }
            }
        }
    }
    ips
}

/// Cloudflare CDN provider — fetches live CIDR ranges from Cloudflare's public endpoint.
pub struct CloudflareProvider;

impl CdnProvider for CloudflareProvider {
    fn name(&self) -> &str {
        "Cloudflare"
    }

    fn id(&self) -> &str {
        "cloudflare"
    }

    fn sni(&self) -> &str {
        "cloudflare.com"
    }

    fn ip_range_urls(&self) -> Vec<&str> {
        vec!["https://www.cloudflare.com/ips-v4"]
    }
}

/// Gcore CDN provider.
pub struct GcoreProvider;

impl CdnProvider for GcoreProvider {
    fn name(&self) -> &str {
        "Gcore"
    }

    fn id(&self) -> &str {
        "gcore"
    }

    fn sni(&self) -> &str {
        "gcore.com"
    }

    fn ip_range_urls(&self) -> Vec<&str> {
        vec!["https://api.gcore.com/cdn/public-net-list"]
    }
}

/// Get a provider implementation by ID string.
pub fn get_provider(id: &str) -> Option<Box<dyn CdnProvider>> {
    match id {
        "cloudflare" => Some(Box::new(CloudflareProvider)),
        "gcore" => Some(Box::new(GcoreProvider)),
        _ => None,
    }
}

/// Fetch and expand all IP ranges for a provider.
pub async fn fetch_provider_ips(provider: &dyn CdnProvider) -> anyhow::Result<Vec<IpAddr>> {
    let mut all_ranges = Vec::new();
    for url in provider.ip_range_urls() {
        match fetch_cidr_list(url).await {
            Ok(ranges) => {
                tracing::info!(
                    "Fetched {} CIDR ranges from {} for {}",
                    ranges.len(),
                    url,
                    provider.name()
                );
                all_ranges.extend(ranges);
            }
            Err(e) => {
                tracing::error!("Failed to fetch ranges from {}: {}", url, e);
                return Err(e);
            }
        }
    }
    let ips = expand_ranges(&all_ranges, true); // IPv4 only by default for web
    tracing::info!(
        "Expanded to {} individual IPs for {}",
        ips.len(),
        provider.name()
    );
    Ok(ips)
}
