-- Provider IP ranges table: stores CIDR blocks per provider (auto-fetched or custom).
CREATE TABLE IF NOT EXISTS provider_ranges (
    id TEXT PRIMARY KEY NOT NULL,
    provider_id TEXT NOT NULL,
    cidr TEXT NOT NULL,
    ip_count INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider_id, cidr)
);

CREATE INDEX IF NOT EXISTS idx_provider_ranges_provider ON provider_ranges(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_ranges_enabled ON provider_ranges(provider_id, enabled);

-- Provider settings table: controls auto-update behavior per provider.
CREATE TABLE IF NOT EXISTS provider_settings (
    provider_id TEXT PRIMARY KEY NOT NULL,
    auto_update INTEGER NOT NULL DEFAULT 0,
    auto_update_interval_hours INTEGER NOT NULL DEFAULT 24,
    last_fetched_at TEXT
);

-- Seed default settings for known providers.
INSERT OR IGNORE INTO provider_settings (provider_id, auto_update, auto_update_interval_hours)
VALUES ('cloudflare', 0, 24), ('gcore', 0, 24);
