use std::net::IpAddr;

use ipnet::IpNet;
use sqlx::SqlitePool;

use super::CdnProvider;
use crate::error::AppError;

/// Fetch a URL and parse each non-empty, non-comment line as an IpNet CIDR range.
pub(crate) async fn fetch_cidr_list(url: &str) -> anyhow::Result<Vec<IpNet>> {
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

/// Database-backed CDN provider, constructed from the `providers` table.
pub struct DbProvider {
    pub id_val: String,
    pub name_val: String,
    pub sni_val: String,
    pub urls: Vec<String>,
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
}

/// Load a provider from the database and return it as a `Box<dyn CdnProvider>`.
pub async fn get_provider_from_db(
    db: &SqlitePool,
    id: &str,
) -> Result<Box<dyn CdnProvider>, AppError> {
    let row = sqlx::query_as::<_, crate::models::Provider>(
        "SELECT id, name, description, sni, ip_range_urls, is_builtin, created_at, updated_at
         FROM providers WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Provider '{id}' not found")))?;

    let urls: Vec<String> = serde_json::from_str(&row.ip_range_urls)
        .unwrap_or_default();

    Ok(Box::new(DbProvider {
        id_val: row.id,
        name_val: row.name,
        sni_val: row.sni,
        urls,
    }))
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
