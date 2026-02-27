use std::net::IpAddr;

use ipnet::IpNet;
use sqlx::SqlitePool;

use super::CdnProvider;
use crate::error::CoreError;

/// Fetch a URL and parse CIDR ranges from the response.
///
/// The `format` parameter controls parsing:
/// - `"text"` — plain text, one CIDR per line (e.g. Cloudflare).
/// - `"json"` — JSON object with `"addresses"` and/or `"addresses_v6"` arrays (e.g. Gcore).
pub(crate) async fn fetch_cidr_list(url: &str, format: &str) -> anyhow::Result<Vec<IpNet>> {
    let body = reqwest::get(url).await?.text().await?;

    if format == "json" {
        let json: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| anyhow::anyhow!("Expected JSON response from {url}: {e}"))?;
        let mut ranges = Vec::new();
        for key in &["addresses", "addresses_v6"] {
            if let Some(arr) = json.get(key).and_then(|v| v.as_array()) {
                for item in arr {
                    if let Some(cidr_str) = item.as_str() {
                        match cidr_str.trim().parse::<IpNet>() {
                            Ok(net) => ranges.push(net),
                            Err(e) => tracing::warn!("Skipping invalid CIDR '{}': {}", cidr_str, e),
                        }
                    }
                }
            }
        }
        tracing::info!("Parsed {} CIDR ranges from JSON response at {}", ranges.len(), url);
        return Ok(ranges);
    }

    // Default: plain-text, one CIDR per line.
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
                for (count, ip) in net.hosts().enumerate() {
                    if count >= 65536 {
                        tracing::warn!(
                            "IPv6 range {} has too many IPs, limiting to first 65536",
                            net
                        );
                        break;
                    }
                    ips.push(IpAddr::V6(ip));
                }
            }
        }
    }
    ips
}

/// Database-backed CDN provider, constructed from the `providers` table.
pub struct DbProvider {
    pub id_val: String,
    pub name_val: String,
    pub sni_val: String,
    pub urls: Vec<String>,
    pub response_format_val: String,
}

impl CdnProvider for DbProvider {
    fn name(&self) -> &str {
        &self.name_val
    }

    fn id(&self) -> &str {
        &self.id_val
    }

    fn sni(&self) -> &str {
        &self.sni_val
    }

    fn ip_range_urls(&self) -> Vec<&str> {
        self.urls.iter().map(|s| s.as_str()).collect()
    }

    fn response_format(&self) -> &str {
        &self.response_format_val
    }
}

/// Load a provider from the database and return it as a `Box<dyn CdnProvider>`.
pub async fn get_provider_from_db(
    db: &SqlitePool,
    id: &str,
) -> Result<Box<dyn CdnProvider>, CoreError> {
    let row = sqlx::query_as::<_, crate::models::Provider>(
        "SELECT id, name, description, sni, ip_range_urls, is_builtin, response_format, created_at, updated_at
         FROM providers WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("Provider '{id}' not found")))?;

    let urls: Vec<String> = serde_json::from_str(&row.ip_range_urls)
        .unwrap_or_default();

    Ok(Box::new(DbProvider {
        id_val: row.id,
        name_val: row.name,
        sni_val: row.sni,
        urls,
        response_format_val: row.response_format,
    }))
}

/// Fetch and expand all IP ranges for a provider.
pub async fn fetch_provider_ips(provider: &dyn CdnProvider) -> anyhow::Result<Vec<IpAddr>> {
    let mut all_ranges = Vec::new();
    let format = provider.response_format();
    for url in provider.ip_range_urls() {
        match fetch_cidr_list(url, format).await {
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
