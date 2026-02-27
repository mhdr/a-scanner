use ipnet::IpNet;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::CoreError;
use crate::models::{
    BulkToggleRequest, CreateProviderRequest, CreateRangeRequest, Provider, ProviderRange,
    ProviderSettings, UpdateProviderRequest, UpdateProviderSettingsRequest, UpdateRangeRequest,
};
use crate::scanner::provider::{fetch_cidr_list, get_provider_from_db};

// ---------------------------------------------------------------------------
// Provider CRUD
// ---------------------------------------------------------------------------

/// List all providers.
pub async fn list_providers(db: &SqlitePool) -> Result<Vec<Provider>, CoreError> {
    let providers = sqlx::query_as::<_, Provider>(
        "SELECT id, name, description, sni, ip_range_urls, is_builtin, response_format, created_at, updated_at
         FROM providers ORDER BY name",
    )
    .fetch_all(db)
    .await?;
    Ok(providers)
}

/// Get a single provider by ID.
pub async fn get_provider_by_id(db: &SqlitePool, id: &str) -> Result<Provider, CoreError> {
    sqlx::query_as::<_, Provider>(
        "SELECT id, name, description, sni, ip_range_urls, is_builtin, response_format, created_at, updated_at
         FROM providers WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("Provider '{id}' not found")))
}

/// Create a new custom provider.
pub async fn create_provider(
    db: &SqlitePool,
    req: &CreateProviderRequest,
) -> Result<Provider, CoreError> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let description = req.description.clone().unwrap_or_default();
    let urls_json = serde_json::to_string(&req.ip_range_urls)
        .map_err(|e| CoreError::BadRequest(format!("Invalid ip_range_urls: {e}")))?;

    sqlx::query(
        "INSERT INTO providers (id, name, description, sni, ip_range_urls, is_builtin, response_format, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 'text', ?, ?)",
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&description)
    .bind(&req.sni)
    .bind(&urls_json)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;

    // Also create a provider_settings row.
    sqlx::query(
        "INSERT OR IGNORE INTO provider_settings (provider_id, auto_update, auto_update_interval_hours)
         VALUES (?, 0, 24)",
    )
    .bind(&id)
    .execute(db)
    .await?;

    get_provider_by_id(db, &id).await
}

/// Update an existing provider.
pub async fn update_provider(
    db: &SqlitePool,
    id: &str,
    req: &UpdateProviderRequest,
) -> Result<Provider, CoreError> {
    let existing = get_provider_by_id(db, id).await?;
    let now = chrono::Utc::now().to_rfc3339();

    let name = req.name.as_deref().unwrap_or(&existing.name);
    let description = req.description.as_deref().unwrap_or(&existing.description);
    let sni = req.sni.as_deref().unwrap_or(&existing.sni);
    let urls_json = if let Some(ref urls) = req.ip_range_urls {
        serde_json::to_string(urls)
            .map_err(|e| CoreError::BadRequest(format!("Invalid ip_range_urls: {e}")))?
    } else {
        existing.ip_range_urls.clone()
    };

    sqlx::query(
        "UPDATE providers SET name = ?, description = ?, sni = ?, ip_range_urls = ?, updated_at = ? WHERE id = ?",
    )
    .bind(name)
    .bind(description)
    .bind(sni)
    .bind(&urls_json)
    .bind(&now)
    .bind(id)
    .execute(db)
    .await?;

    get_provider_by_id(db, id).await
}

/// Delete a provider and all associated ranges & settings.
pub async fn delete_provider(db: &SqlitePool, id: &str) -> Result<(), CoreError> {
    let existing = get_provider_by_id(db, id).await?;
    if existing.is_builtin {
        return Err(CoreError::BadRequest(
            "Cannot delete a built-in provider".to_string(),
        ));
    }
    // Cascade delete ranges and settings.
    sqlx::query("DELETE FROM provider_ranges WHERE provider_id = ?")
        .bind(id)
        .execute(db)
        .await?;
    sqlx::query("DELETE FROM provider_settings WHERE provider_id = ?")
        .bind(id)
        .execute(db)
        .await?;
    sqlx::query("DELETE FROM providers WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Range queries
// ---------------------------------------------------------------------------

/// List all ranges for a provider.
pub async fn get_ranges(db: &SqlitePool, provider_id: &str) -> Result<Vec<ProviderRange>, CoreError> {
    let ranges = sqlx::query_as::<_, ProviderRange>(
        "SELECT id, provider_id, cidr, ip_count, enabled, is_custom, created_at, updated_at
         FROM provider_ranges WHERE provider_id = ? ORDER BY cidr",
    )
    .bind(provider_id)
    .fetch_all(db)
    .await?;
    Ok(ranges)
}

/// List only enabled ranges for a provider (used by the scanner).
pub async fn get_enabled_ranges(db: &SqlitePool, provider_id: &str) -> Result<Vec<ProviderRange>, CoreError> {
    let ranges = sqlx::query_as::<_, ProviderRange>(
        "SELECT id, provider_id, cidr, ip_count, enabled, is_custom, created_at, updated_at
         FROM provider_ranges WHERE provider_id = ? AND enabled = 1 ORDER BY cidr",
    )
    .bind(provider_id)
    .fetch_all(db)
    .await?;
    Ok(ranges)
}

// ---------------------------------------------------------------------------
// Fetch from upstream & store
// ---------------------------------------------------------------------------

/// Count the number of host IPs in a CIDR range.
fn cidr_ip_count(net: &IpNet) -> i64 {
    match net {
        IpNet::V4(v4) => {
            let hosts: Vec<_> = v4.hosts().collect();
            hosts.len() as i64
        }
        IpNet::V6(v6) => {
            let prefix = v6.prefix_len();
            if prefix >= 128 {
                1
            } else {
                let bits = 128 - prefix as u64;
                if bits > 16 {
                    65536 // cap like expand_ranges does
                } else {
                    (1u64 << bits) as i64
                }
            }
        }
    }
}

/// Fetch CIDR ranges from the provider's upstream URLs and upsert into DB.
/// Only touches auto-fetched ranges (`is_custom = 0`); custom ranges are preserved.
pub async fn fetch_and_store_ranges(
    db: &SqlitePool,
    provider_id: &str,
) -> Result<Vec<ProviderRange>, CoreError> {
    let provider = get_provider_from_db(db, provider_id).await?;

    let mut all_cidrs: Vec<(String, i64)> = Vec::new();
    let format = provider.response_format();
    for url in provider.ip_range_urls() {
        let nets = fetch_cidr_list(url, format)
            .await
            .map_err(|e| CoreError::Internal(e))?;
        for net in &nets {
            all_cidrs.push((net.to_string(), cidr_ip_count(net)));
        }
    }

    let now = chrono::Utc::now().to_rfc3339();

    // Upsert each fetched CIDR (only for non-custom rows).
    for (cidr, ip_count) in &all_cidrs {
        sqlx::query(
            "INSERT INTO provider_ranges (id, provider_id, cidr, ip_count, enabled, is_custom, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, 0, ?, ?)
             ON CONFLICT(provider_id, cidr) DO UPDATE
             SET ip_count = excluded.ip_count, updated_at = excluded.updated_at
             WHERE is_custom = 0",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(provider_id)
        .bind(cidr)
        .bind(ip_count)
        .bind(&now)
        .bind(&now)
        .execute(db)
        .await?;
    }

    // Remove auto-fetched CIDRs no longer present upstream.
    let cidr_strings: Vec<&str> = all_cidrs.iter().map(|(c, _)| c.as_str()).collect();
    if cidr_strings.is_empty() {
        // If upstream returned nothing, don't delete existing ranges (could be a transient error).
    } else {
        // Build placeholders
        let placeholders: String = cidr_strings.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "DELETE FROM provider_ranges WHERE provider_id = ? AND is_custom = 0 AND cidr NOT IN ({placeholders})"
        );
        let mut query = sqlx::query(&sql).bind(provider_id);
        for cidr in &cidr_strings {
            query = query.bind(cidr);
        }
        query.execute(db).await?;
    }

    // Update last_fetched_at in provider_settings.
    sqlx::query(
        "INSERT INTO provider_settings (provider_id, auto_update, auto_update_interval_hours, last_fetched_at)
         VALUES (?, 0, 24, ?)
         ON CONFLICT(provider_id) DO UPDATE SET last_fetched_at = excluded.last_fetched_at",
    )
    .bind(provider_id)
    .bind(&now)
    .execute(db)
    .await?;

    get_ranges(db, provider_id).await
}

// ---------------------------------------------------------------------------
// CRUD for individual ranges
// ---------------------------------------------------------------------------

/// Create a custom range for a provider.
pub async fn create_custom_range(
    db: &SqlitePool,
    provider_id: &str,
    req: &CreateRangeRequest,
) -> Result<ProviderRange, CoreError> {
    // Validate provider exists.
    let _ = get_provider_by_id(db, provider_id).await?;

    // Validate CIDR format.
    let net: IpNet = req
        .cidr
        .parse()
        .map_err(|e| CoreError::BadRequest(format!("Invalid CIDR '{}': {e}", req.cidr)))?;
    let ip_count = cidr_ip_count(&net);
    let cidr_str = net.to_string();

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let enabled = req.enabled.unwrap_or(true);

    sqlx::query(
        "INSERT INTO provider_ranges (id, provider_id, cidr, ip_count, enabled, is_custom, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(&id)
    .bind(provider_id)
    .bind(&cidr_str)
    .bind(ip_count)
    .bind(enabled)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref db_err) if db_err.message().contains("UNIQUE") => {
            CoreError::BadRequest(format!("Range {cidr_str} already exists for provider {provider_id}"))
        }
        other => CoreError::Database(other),
    })?;

    get_range_by_id(db, &id).await
}

/// Get a single range by its ID.
async fn get_range_by_id(db: &SqlitePool, range_id: &str) -> Result<ProviderRange, CoreError> {
    sqlx::query_as::<_, ProviderRange>(
        "SELECT id, provider_id, cidr, ip_count, enabled, is_custom, created_at, updated_at
         FROM provider_ranges WHERE id = ?",
    )
    .bind(range_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("Range {range_id} not found")))
}

/// Update a range (CIDR and/or enabled flag).
pub async fn update_range(
    db: &SqlitePool,
    range_id: &str,
    req: &UpdateRangeRequest,
) -> Result<ProviderRange, CoreError> {
    let existing = get_range_by_id(db, range_id).await?;
    let now = chrono::Utc::now().to_rfc3339();

    let (new_cidr, new_ip_count) = if let Some(ref cidr_str) = req.cidr {
        let net: IpNet = cidr_str
            .parse()
            .map_err(|e| CoreError::BadRequest(format!("Invalid CIDR '{cidr_str}': {e}")))?;
        (net.to_string(), cidr_ip_count(&net))
    } else {
        (existing.cidr.clone(), existing.ip_count)
    };
    let new_enabled = req.enabled.unwrap_or(existing.enabled);

    sqlx::query(
        "UPDATE provider_ranges SET cidr = ?, ip_count = ?, enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&new_cidr)
    .bind(new_ip_count)
    .bind(new_enabled)
    .bind(&now)
    .bind(range_id)
    .execute(db)
    .await?;

    get_range_by_id(db, range_id).await
}

/// Delete a range.
pub async fn delete_range(db: &SqlitePool, range_id: &str) -> Result<(), CoreError> {
    let result = sqlx::query("DELETE FROM provider_ranges WHERE id = ?")
        .bind(range_id)
        .execute(db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(format!("Range {range_id} not found")));
    }
    Ok(())
}

/// Bulk toggle enabled/disabled for multiple range IDs.
pub async fn bulk_toggle_ranges(db: &SqlitePool, req: &BulkToggleRequest) -> Result<(), CoreError> {
    let now = chrono::Utc::now().to_rfc3339();
    for id in &req.range_ids {
        sqlx::query("UPDATE provider_ranges SET enabled = ?, updated_at = ? WHERE id = ?")
            .bind(req.enabled)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Provider settings
// ---------------------------------------------------------------------------

/// Get settings for a provider.
pub async fn get_settings(db: &SqlitePool, provider_id: &str) -> Result<ProviderSettings, CoreError> {
    let settings = sqlx::query_as::<_, ProviderSettings>(
        "SELECT provider_id, auto_update, auto_update_interval_hours, last_fetched_at
         FROM provider_settings WHERE provider_id = ?",
    )
    .bind(provider_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| CoreError::NotFound(format!("Settings for provider {provider_id} not found")))?;
    Ok(settings)
}

/// Update settings for a provider.
pub async fn update_settings(
    db: &SqlitePool,
    provider_id: &str,
    req: &UpdateProviderSettingsRequest,
) -> Result<ProviderSettings, CoreError> {
    let existing = get_settings(db, provider_id).await?;
    let auto_update = req.auto_update.unwrap_or(existing.auto_update);
    let interval = req
        .auto_update_interval_hours
        .unwrap_or(existing.auto_update_interval_hours);

    sqlx::query(
        "UPDATE provider_settings SET auto_update = ?, auto_update_interval_hours = ? WHERE provider_id = ?",
    )
    .bind(auto_update)
    .bind(interval)
    .bind(provider_id)
    .execute(db)
    .await?;

    get_settings(db, provider_id).await
}

// ---------------------------------------------------------------------------
// Auto-update background loop
// ---------------------------------------------------------------------------

/// Background task that periodically checks provider_settings and re-fetches
/// ranges for providers whose auto_update is enabled and whose data is stale.
pub async fn run_auto_update_loop(db: SqlitePool) {
    let check_interval = std::time::Duration::from_secs(5 * 60); // every 5 minutes
    loop {
        tokio::time::sleep(check_interval).await;

        let rows = sqlx::query_as::<_, ProviderSettings>(
            "SELECT provider_id, auto_update, auto_update_interval_hours, last_fetched_at
             FROM provider_settings WHERE auto_update = 1",
        )
        .fetch_all(&db)
        .await;

        let settings_list = match rows {
            Ok(list) => list,
            Err(e) => {
                tracing::error!("Auto-update: failed to query provider_settings: {e}");
                continue;
            }
        };

        for settings in settings_list {
            let stale = match &settings.last_fetched_at {
                None => true,
                Some(ts) => {
                    if let Ok(fetched) = chrono::DateTime::parse_from_rfc3339(ts) {
                        let age = chrono::Utc::now().signed_duration_since(fetched);
                        age.num_hours() >= settings.auto_update_interval_hours
                    } else {
                        true
                    }
                }
            };

            if stale {
                tracing::info!(
                    "Auto-update: fetching ranges for provider '{}'",
                    settings.provider_id
                );
                match fetch_and_store_ranges(&db, &settings.provider_id).await {
                    Ok(ranges) => {
                        tracing::info!(
                            "Auto-update: stored {} ranges for '{}'",
                            ranges.len(),
                            settings.provider_id
                        );
                    }
                    Err(e) => {
                        tracing::error!(
                            "Auto-update: failed to fetch ranges for '{}': {e}",
                            settings.provider_id
                        );
                    }
                }
            }
        }
    }
}
