use std::net::IpAddr;

use super::CdnProvider;

/// Cloudflare CDN provider — returns a sample of Cloudflare IP addresses.
pub struct CloudflareProvider;

impl CdnProvider for CloudflareProvider {
    fn name(&self) -> &str {
        "Cloudflare"
    }

    fn id(&self) -> &str {
        "cloudflare"
    }

    fn ip_ranges(&self) -> Vec<IpAddr> {
        // A small sample of Cloudflare IPs for initial implementation.
        // In production, this would fetch from https://www.cloudflare.com/ips-v4
        // and expand CIDR ranges into individual addresses.
        let cidrs = [
            "173.245.48.0",
            "103.21.244.0",
            "103.22.200.0",
            "103.31.4.0",
            "141.101.64.0",
            "108.162.192.0",
            "190.93.240.0",
            "188.114.96.0",
            "197.234.240.0",
            "198.41.128.0",
            "162.158.0.0",
            "104.16.0.0",
            "104.24.0.0",
            "172.64.0.0",
            "131.0.72.0",
        ];

        cidrs
            .iter()
            .filter_map(|ip| ip.parse::<IpAddr>().ok())
            .collect()
    }
}
